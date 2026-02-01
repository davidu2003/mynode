import { FastifyPluginAsync } from 'fastify';
import { WebSocket, RawData } from 'ws';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { config } from '../config/index.js';
import { v4 as uuidv4 } from 'uuid';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
}

interface AgentConnection {
  vpsId: number;
  socket: WebSocket;
  lastHeartbeat: number;
  pendingRequests: Map<string, PendingRequest>;
}

export interface ExtendedAgent {
  vpsId: number;
  exec(command: string, timeout?: number): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

class AgentManager {
  private agents: Map<number, AgentConnection> = new Map();

  addAgent(vpsId: number, socket: WebSocket) {
    // 关闭旧连接
    const existing = this.agents.get(vpsId);
    if (existing) {
      existing.socket.close();
    }

    this.agents.set(vpsId, {
      vpsId,
      socket,
      lastHeartbeat: Date.now(),
      pendingRequests: new Map(),
    });

    // 更新数据库状态
    db.update(schema.vps)
      .set({ agentStatus: 'online', updatedAt: new Date() })
      .where(eq(schema.vps.id, vpsId))
      .run();
  }

  removeAgent(vpsId: number) {
    const agent = this.agents.get(vpsId);
    if (agent) {
      // 清理所有pending请求
      agent.pendingRequests.forEach((req) => {
        clearTimeout(req.timeout);
        req.reject(new Error('Agent disconnected'));
      });
      this.agents.delete(vpsId);
    }

    // 更新数据库状态
    db.update(schema.vps)
      .set({ agentStatus: 'offline', updatedAt: new Date() })
      .where(eq(schema.vps.id, vpsId))
      .run();
  }

  getAgent(vpsId: number): ExtendedAgent | undefined {
    const agent = this.agents.get(vpsId);
    if (!agent) return undefined;

    return {
      vpsId: agent.vpsId,
      exec: async (command: string, timeout?: number) => {
        const result = await this.sendRequest(vpsId, 'exec', { command, timeout }, timeout || 60000);
        return result as { exitCode: number; stdout: string; stderr: string };
      },
      readFile: async (path: string) => {
        const result = await this.sendRequest(vpsId, 'read_file', { path });
        return result.content as string;
      },
      writeFile: async (path: string, content: string) => {
        await this.sendRequest(vpsId, 'write_file', { path, content });
      },
    };
  }

  getRawAgent(vpsId: number): AgentConnection | undefined {
    return this.agents.get(vpsId);
  }

  updateHeartbeat(vpsId: number) {
    const agent = this.agents.get(vpsId);
    if (agent) {
      agent.lastHeartbeat = Date.now();
    }
  }

  // 发送请求并等待响应
  async sendRequest(vpsId: number, type: string, payload: any, timeoutMs: number = 30000): Promise<any> {
    const agent = this.agents.get(vpsId);
    if (!agent) {
      throw new Error('Agent not connected');
    }

    const id = uuidv4();
    const message = JSON.stringify({ id, type, payload, timestamp: Date.now() });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        agent.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, timeoutMs);

      agent.pendingRequests.set(id, { resolve, reject, timeout });
      agent.socket.send(message);
    });
  }

  // 处理Agent响应
  handleResponse(vpsId: number, id: string, payload: any, error?: string) {
    const agent = this.agents.get(vpsId);
    if (!agent) return;

    const pending = agent.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      agent.pendingRequests.delete(id);

      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(payload);
      }
    }
  }

  // 检查离线Agent
  checkOfflineAgents() {
    const threshold = Date.now() - config.agentOfflineThreshold;
    this.agents.forEach((agent, vpsId) => {
      if (agent.lastHeartbeat < threshold) {
        console.log(`Agent ${vpsId} is offline (no heartbeat)`);
        this.removeAgent(vpsId);
      }
    });
  }
}

export const agentManager = new AgentManager();

// 服务器启动时，将所有 online 状态的 Agent 重置为 offline
// 防止服务器重启后数据库状态残留导致误判
function resetOnlineAgentsOnStartup() {
  const result = db
    .update(schema.vps)
    .set({ agentStatus: 'offline', updatedAt: new Date() })
    .where(eq(schema.vps.agentStatus, 'online'))
    .run();

  if (result.changes > 0) {
    console.log(`[AgentManager] Reset ${result.changes} agents to offline on startup`);
  }
}

resetOnlineAgentsOnStartup();

// 从数据库获取 Agent 检查配置（单位：秒）
function getAgentCheckConfig(): { checkInterval: number; offlineThreshold: number } {
  const setting = db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'agentCheckConfig'))
    .get();

  if (setting?.value) {
    try {
      const parsed = JSON.parse(setting.value);
      return {
        checkInterval: (parsed.checkInterval || 30) * 1000, // 转为毫秒
        offlineThreshold: (parsed.offlineThreshold || 90) * 1000, // 转为毫秒
      };
    } catch {
      // 解析失败使用默认值
    }
  }

  // 默认值：检查间隔 30 秒，离线阈值 90 秒
  return {
    checkInterval: config.agentHeartbeatInterval || 30000,
    offlineThreshold: config.agentOfflineThreshold || 90000,
  };
}

// 动态检查离线 Agent（支持配置热更新）
let currentCheckInterval: NodeJS.Timeout | null = null;

function startAgentOfflineChecker() {
  const { checkInterval, offlineThreshold } = getAgentCheckConfig();

  // 清除旧的定时器
  if (currentCheckInterval) {
    clearInterval(currentCheckInterval);
  }

  // 使用动态阈值检查
  currentCheckInterval = setInterval(() => {
    const { offlineThreshold: threshold } = getAgentCheckConfig();
    const thresholdTime = Date.now() - threshold;

    agentManager['agents'].forEach((agent, vpsId) => {
      if (agent.lastHeartbeat < thresholdTime) {
        console.log(`Agent ${vpsId} is offline (no heartbeat for ${threshold / 1000}s)`);
        agentManager.removeAgent(vpsId);
      }
    });
  }, checkInterval);

  console.log(`[AgentManager] Offline checker started: interval=${checkInterval / 1000}s, threshold=${offlineThreshold / 1000}s`);
}

startAgentOfflineChecker();

// 导出重启检查器的方法，供配置更新时调用
export function restartAgentOfflineChecker() {
  startAgentOfflineChecker();
}

export const agentWebSocket: FastifyPluginAsync = async (fastify) => {
  fastify.get('/agent', { websocket: true }, (socket, request) => {
    const query = request.query as { token?: string };
    const token = query.token;

    if (!token) {
      socket.close(4001, 'Token required');
      return;
    }

    // 验证Token
    const vpsItem = db
      .select()
      .from(schema.vps)
      .where(eq(schema.vps.agentToken, token))
      .get();

    if (!vpsItem) {
      socket.close(4002, 'Invalid token');
      return;
    }

    console.log(`Agent connected: VPS ${vpsItem.id} (${vpsItem.name})`);
    agentManager.addAgent(vpsItem.id, socket);

    // 发送连接确认
    socket.send(JSON.stringify({
      type: 'connected',
      payload: { vpsId: vpsItem.id, name: vpsItem.name },
    }));

    // 下发网络监控配置
    sendPingConfig(vpsItem.id);

    socket.on('message', (data: RawData) => {
      try {
        const message = JSON.parse(data.toString());
        handleAgentMessage(vpsItem.id, message);
      } catch (err) {
        console.error('Failed to parse agent message:', err);
      }
    });

    socket.on('close', () => {
      console.log(`Agent disconnected: VPS ${vpsItem.id}`);
      agentManager.removeAgent(vpsItem.id);
    });

    socket.on('error', (err: Error) => {
      console.error(`Agent error: VPS ${vpsItem.id}:`, err);
    });
  });
};

export function sendPingConfig(vpsId: number) {
  const agent = agentManager.getRawAgent(vpsId);
  if (!agent) return;

  const monitors = db
    .select()
    .from(schema.pingMonitors)
    .where(eq(schema.pingMonitors.vpsId, vpsId))
    .all()
    .map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      type: monitor.type,
      host: monitor.target,
      port: monitor.port,
      interval: monitor.interval,
      timeout: monitor.timeout,
      enabled: monitor.enabled,
    }));

  agent.socket.send(JSON.stringify({
    type: 'ping_config',
    payload: { monitors },
  }));
}

function handleAgentMessage(vpsId: number, message: any) {
  const { id, type, payload, error } = message;

  switch (type) {
    case 'heartbeat':
      agentManager.updateHeartbeat(vpsId);
      // 发送心跳确认
      const agent = agentManager.getRawAgent(vpsId);
      if (agent) {
        agent.socket.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
      }
      break;

    case 'metrics':
      // 保存监控指标
      db.insert(schema.metrics).values({
        vpsId,
        cpuUsage: payload.cpu,
        memUsage: payload.memory?.usedPercent,
        diskUsage: payload.disk?.[0]?.usedPercent,
        netIn: payload.network?.rxBytes,
        netOut: payload.network?.txBytes,
        diskReadBytes: payload.diskIo?.readBytes,
        diskWriteBytes: payload.diskIo?.writeBytes,
        load1: payload.load?.load1,
        load5: payload.load?.load5,
        load15: payload.load?.load15,
        collectedAt: new Date(),
      }).run();
      break;

    case 'system_info':
      // 更新系统信息
      db.update(schema.vps)
        .set({
          osType: payload.osType,
          osVersion: payload.osVersion,
          arch: payload.arch,
          updatedAt: new Date(),
        })
        .where(eq(schema.vps.id, vpsId))
        .run();

      const systemInfoRecord = {
        vpsId,
        hostname: payload.hostname || null,
        kernel: payload.kernel || null,
        cpuModel: payload.cpu?.model || null,
        cpuCores: payload.cpu?.cores || null,
        cpuThreads: payload.cpu?.threads || null,
        memTotal: payload.memory?.total || null,
        memAvailable: payload.memory?.available || null,
        disks: payload.disks ? JSON.stringify(payload.disks) : null,
        networks: payload.networks ? JSON.stringify(payload.networks) : null,
        updatedAt: new Date(),
      };

      const existing = db
        .select()
        .from(schema.vpsSystemInfo)
        .where(eq(schema.vpsSystemInfo.vpsId, vpsId))
        .get();

      if (existing) {
        db.update(schema.vpsSystemInfo)
          .set(systemInfoRecord)
          .where(eq(schema.vpsSystemInfo.id, existing.id))
          .run();
      } else {
        db.insert(schema.vpsSystemInfo).values(systemInfoRecord).run();
      }
      break;

    case 'ping_results':
      // 保存Ping结果
      const now = new Date();
      for (const result of payload.results || []) {
        db.insert(schema.pingResults).values({
          monitorId: result.monitorId,
          success: result.success,
          latency: result.latency,
          error: result.error,
          collectedAt: now,
        }).run();
      }
      break;

    case 'response':
      // 处理请求响应
      agentManager.handleResponse(vpsId, id, payload, error);
      break;

    default:
      console.log(`Unknown message type from VPS ${vpsId}:`, type);
  }
}
