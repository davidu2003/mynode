import { Client } from 'ssh2';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { decrypt, encrypt } from '../utils/crypto.js';
import { agentManager } from '../websocket/agent.js';
import {
  buildAgentDownloadBaseUrl,
  buildServerWsUrl,
  installAgentOverSshViaScp,
  resolvePublicBaseUrlFromConfig,
} from './agent-install.js';

// 支持的操作系统和版本
export const SUPPORTED_OS = {
  debian: ['11', '12', '13'],
  ubuntu: ['20.04', '22.04', '24.04'],
  centos: ['7', '8', '9'],
  rocky: ['8', '9'],
  alpine: ['3.18', '3.19', '3.20'],
};

interface DDOptions {
  vpsId: number;
  targetOs: string;
  targetVersion: string;
  newPassword: string;
  newSshPort: number;
}

/**
 * DD重装服务
 * 流程：
 * 1. 通过Agent或SSH执行DD脚本
 * 2. VPS重启进入重装
 * 3. 轮询等待重装完成
 * 4. 用新凭证SSH连接
 * 5. 重新安装Agent
 */
export class DDService {
  private canceledTasks = new Set<number>();

  /**
   * 开始DD重装任务
   */
  async startDD(options: DDOptions): Promise<number> {
    const { vpsId, targetOs, targetVersion, newPassword, newSshPort } = options;

    // 获取VPS信息
    const vps = db.select().from(schema.vps).where(eq(schema.vps.id, vpsId)).get();
    if (!vps) {
      throw new Error('VPS not found');
    }

    // 创建DD任务记录
    const result = db.insert(schema.ddTasks).values({
      vpsId,
      targetOs,
      targetVersion,
      newPassword: encrypt(newPassword),
      newSshPort,
      status: 'pending',
      startedAt: new Date(),
    }).run();

    const taskId = Number(result.lastInsertRowid);

    // 更新VPS状态
    db.update(schema.vps)
      .set({ agentStatus: 'installing', updatedAt: new Date() })
      .where(eq(schema.vps.id, vpsId))
      .run();

    // 异步执行DD流程
    this.executeDD(taskId, vps, options).catch((err) => {
      console.error(`DD task ${taskId} failed:`, err);
      this.updateTaskStatus(taskId, 'failed', err.message);
    });

    return taskId;
  }

  /**
   * 执行DD重装流程
   */
  private async executeDD(taskId: number, vps: any, options: DDOptions) {
    this.assertNotCanceled(taskId);
    const { targetOs, targetVersion, newPassword, newSshPort } = options;

    // 构建DD命令
    const ddCommand = this.buildDDCommand(targetOs, targetVersion, newPassword, newSshPort);

    // 阶段1: 执行DD脚本
    this.updateTaskStatus(taskId, 'executing');
    this.assertNotCanceled(taskId);

    const agent = agentManager.getAgent(vps.id);
    if (agent) {
      // 优先通过Agent执行
      try {
        const result = await agent.exec(ddCommand, 120000);
        this.updateTaskCommandResult(taskId, result.stdout, result.stderr, result.exitCode);
      } catch (err) {
        // DD脚本会导致连接断开，这是正常的
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.updateTaskCommandResult(taskId, '', errorMessage);
        console.log(`DD command sent to VPS ${vps.id}, connection will be lost`);
      }
    } else {
      // 通过SSH执行
      const output = await this.executeViaSSH(vps, ddCommand);
      this.updateTaskCommandResult(taskId, output);
    }

    // 阶段2: 等待重启
    this.updateTaskStatus(taskId, 'rebooting');
    this.assertNotCanceled(taskId);
    await this.sleep(30000); // 等待30秒让VPS开始重启

    // 阶段3: 等待重装完成（轮询检测）
    this.updateTaskStatus(taskId, 'waiting');
    const maxWaitTime = 20 * 60 * 1000; // 最多等待20分钟
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      this.assertNotCanceled(taskId);
      await this.sleep(30000); // 每30秒检测一次

      const isReady = await this.checkSSHReady(vps.ip, newSshPort, 'root', newPassword);
      if (!isReady) {
        continue;
      }

      const osRelease = await this.fetchOsRelease(vps.ip, newSshPort, newPassword);
      if (this.isTargetOsMatch(osRelease, targetOs, targetVersion)) {
        break;
      }
    }

    if (Date.now() - startTime >= maxWaitTime) {
      throw new Error('DD重装超时，请手动检查VPS状态');
    }

    // 阶段4: 重新连接
    this.updateTaskStatus(taskId, 'reconnecting');
    this.assertNotCanceled(taskId);

    // 更新VPS的SSH凭证
    db.update(schema.vps)
      .set({
        sshPort: newSshPort,
        authType: 'password',
        authCredential: encrypt(newPassword),
        updatedAt: new Date(),
      })
      .where(eq(schema.vps.id, vps.id))
      .run();

    // 阶段5: 重新安装Agent
    this.updateTaskStatus(taskId, 'installing_agent');
    this.assertNotCanceled(taskId);
    await this.reinstallAgent(vps.id, vps.ip, newSshPort, newPassword, vps.agentToken);

    // 完成
    this.updateTaskStatus(taskId, 'completed');

    db.update(schema.vps)
      .set({
        osType: targetOs,
        osVersion: targetVersion,
        agentStatus: 'pending', // 等待Agent连接
        updatedAt: new Date(),
      })
      .where(eq(schema.vps.id, vps.id))
      .run();
  }

  /**
   * 构建DD命令
   */
  private buildDDCommand(os: string, version: string, password: string, sshPort: number): string {
    // 转义密码中的特殊字符
    const escapedPassword = password.replace(/'/g, "'\\''");

    const installCurl = [
      'if ! command -v curl >/dev/null 2>&1; then',
      'if command -v apt-get >/dev/null 2>&1; then apt-get update && apt-get install -y curl; fi;',
      'if command -v yum >/dev/null 2>&1; then yum install -y curl; fi;',
      'if command -v dnf >/dev/null 2>&1; then dnf install -y curl; fi;',
      'if command -v apk >/dev/null 2>&1; then apk add --no-cache curl; fi;',
      'fi',
    ].join(' ');

    return `${installCurl} && curl -O https://raw.githubusercontent.com/bin456789/reinstall/main/reinstall.sh && bash reinstall.sh ${os} ${version} --password '${escapedPassword}' --ssh-port ${sshPort} && reboot`;
  }

  /**
   * 通过SSH执行命令
   */
  private executeViaSSH(vps: any, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const credential = decrypt(vps.authCredential);

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          let output = '';
          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });
          stream.on('close', () => {
            conn.end();
            resolve(output);
          });
          stream.stderr.on('data', (data: Buffer) => {
            output += data.toString();
          });
        });
      });

      conn.on('error', (err) => {
        // DD脚本执行后连接会断开，这是正常的
        if (err.message.includes('ECONNRESET') || err.message.includes('read ECONNRESET')) {
          resolve('DD command sent, connection closed');
        } else {
          reject(err);
        }
      });

      const connectConfig: any = {
        host: vps.ip,
        port: vps.sshPort,
        username: 'root',
        readyTimeout: 30000,
      };

      if (vps.authType === 'password') {
        connectConfig.password = credential;
      } else {
        connectConfig.privateKey = credential;
      }

      conn.connect(connectConfig);
    });
  }

  /**
   * 检查SSH是否可连接
   */
  private checkSSHReady(host: string, port: number, username: string, password: string): Promise<boolean> {
    return new Promise((resolve) => {
      const conn = new Client();

      const timeout = setTimeout(() => {
        conn.end();
        resolve(false);
      }, 10000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        conn.end();
        resolve(true);
      });

      conn.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });

      conn.connect({
        host,
        port,
        username,
        password,
        readyTimeout: 10000,
      });
    });
  }

  /**
   * 重新安装Agent
   */
  private async reinstallAgent(vpsId: number, host: string, port: number, password: string, agentToken: string) {
    console.log(`Reinstalling agent on VPS ${vpsId}...`);
    const publicBaseUrl = resolvePublicBaseUrlFromConfig();
    const agentDownloadBaseUrl = buildAgentDownloadBaseUrl(publicBaseUrl);
    const serverAddr = buildServerWsUrl(publicBaseUrl);

    await installAgentOverSshViaScp({
      host,
      port,
      username: 'root',
      authType: 'password',
      credential: password,
      agentDownloadBaseUrl,
      agentToken,
      serverAddr,
    });
  }

  /**
   * 更新任务状态
   */
  private updateTaskStatus(taskId: number, status: string, errorMessage?: string) {
    if (this.canceledTasks.has(taskId) && status !== 'failed') {
      return;
    }
    const updateData: any = { status };
    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }
    if (status === 'completed' || status === 'failed') {
      updateData.completedAt = new Date();
    }

    db.update(schema.ddTasks)
      .set(updateData)
      .where(eq(schema.ddTasks.id, taskId))
      .run();
  }

  private updateTaskCommandResult(taskId: number, stdout: string, stderr: string = '', exitCode?: number | null) {
    if (this.canceledTasks.has(taskId)) {
      return;
    }
    const combinedOutput = [stdout, stderr].filter(Boolean).join('\n');
    db.update(schema.ddTasks)
      .set({
        commandOutput: combinedOutput || null,
        commandExitCode: exitCode ?? null,
      })
      .where(eq(schema.ddTasks.id, taskId))
      .run();
  }

  cancelActiveTasksByVps(vpsId: number) {
    const activeTasks = db
      .select()
      .from(schema.ddTasks)
      .where(eq(schema.ddTasks.vpsId, vpsId))
      .all()
      .filter((t) => !['completed', 'failed'].includes(t.status));

    if (activeTasks.length === 0) {
      return 0;
    }

    const now = new Date();
    for (const task of activeTasks) {
      this.canceledTasks.add(task.id);
      db.update(schema.ddTasks)
        .set({
          status: 'failed',
          errorMessage: '任务已被强制结束',
          completedAt: now,
        })
        .where(eq(schema.ddTasks.id, task.id))
        .run();
    }

    return activeTasks.length;
  }

  private assertNotCanceled(taskId: number) {
    if (this.canceledTasks.has(taskId)) {
      throw new Error('DD任务已被强制结束');
    }
  }

  private async fetchOsRelease(host: string, port: number, password: string) {
    const output = await this.executeCommandWithPassword(host, port, 'root', password, 'cat /etc/os-release');
    return this.parseOsRelease(output);
  }

  private parseOsRelease(content: string) {
    const lines = content.split('\n');
    const result: { id?: string; versionId?: string } = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const idx = trimmed.indexOf('=');
      if (idx === -1) {
        continue;
      }
      const key = trimmed.slice(0, idx);
      const rawValue = trimmed.slice(idx + 1).trim();
      const value = rawValue.replace(/^"/, '').replace(/"$/, '');
      if (key === 'ID') {
        result.id = value.toLowerCase();
      } else if (key === 'VERSION_ID') {
        result.versionId = value;
      }
    }
    return result;
  }

  private isTargetOsMatch(
    osRelease: { id?: string; versionId?: string },
    targetOs: string,
    targetVersion: string,
  ) {
    if (!osRelease.id || !osRelease.versionId) {
      return false;
    }
    if (osRelease.id !== targetOs) {
      return false;
    }
    return osRelease.versionId.startsWith(targetVersion);
  }

  private executeCommandWithPassword(
    host: string,
    port: number,
    username: string,
    password: string,
    command: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          let output = '';
          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });
          stream.on('close', () => {
            conn.end();
            resolve(output);
          });
          stream.stderr.on('data', (data: Buffer) => {
            output += data.toString();
          });
        });
      });

      conn.on('error', (err) => {
        reject(err);
      });

      conn.connect({
        host,
        port,
        username,
        password,
        readyTimeout: 15000,
      });
    });
  }

  /**
   * 获取DD任务状态
   */
  getTaskStatus(taskId: number) {
    return db.select().from(schema.ddTasks).where(eq(schema.ddTasks.id, taskId)).get();
  }

  /**
   * 获取VPS的DD任务历史
   */
  getTasksByVPS(vpsId: number) {
    return db.select().from(schema.ddTasks).where(eq(schema.ddTasks.vpsId, vpsId)).all();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const ddService = new DDService();
