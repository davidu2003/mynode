import { Client } from 'ssh2';
import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export interface InstallTarget {
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  credential: string;
}

export interface AgentInstallOptions extends InstallTarget {
  agentDownloadBaseUrl: string;
  agentToken: string;
  serverAddr: string;
}

export interface DetectedSystemInfo {
  arch: string;
  osType?: string;
  osVersion?: string;
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function shellEscapeSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function resolvePublicBaseUrl(request: any): string {
  if (config.publicBaseUrl) {
    return normalizeUrl(config.publicBaseUrl);
  }

  const stored = getStoredPublicBaseUrl();
  if (stored) {
    return normalizeUrl(stored);
  }

  const forwardedProto = request.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || (request.raw?.socket?.encrypted ? 'https' : 'http');
  const forwardedHost = request.headers['x-forwarded-host'];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.headers.host;
  const basePath = config.basePath || '';

  return normalizeUrl(`${proto}://${host}${basePath}`);
}

export function resolvePublicBaseUrlFromConfig(): string {
  if (config.publicBaseUrl) {
    return normalizeUrl(config.publicBaseUrl);
  }

  const stored = getStoredPublicBaseUrl();
  if (stored) {
    return normalizeUrl(stored);
  }

  const basePath = config.basePath || '';
  return normalizeUrl(`http://${config.host}:${config.port}${basePath}`);
}

export function buildAgentDownloadBaseUrl(publicBaseUrl: string): string {
  const base = normalizeUrl(config.agentDownloadBaseUrl || publicBaseUrl);
  return config.agentDownloadBaseUrl ? base : `${base}/agent`;
}

export function buildServerWsUrl(publicBaseUrl: string): string {
  const base = normalizeUrl(publicBaseUrl);
  const wsBase = base.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  return `${wsBase}/ws/agent`;
}

function mapArch(value: string): string {
  const trimmed = value.trim();
  if (trimmed === 'x86_64') return 'amd64';
  if (trimmed === 'aarch64' || trimmed === 'arm64') return 'arm64';
  throw new Error(`Unsupported arch: ${trimmed}`);
}

function parseOsRelease(content: string): { osType?: string; osVersion?: string } {
  const result: { osType?: string; osVersion?: string } = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, rawValue] = trimmed.split('=', 2);
    const value = rawValue.replace(/^"/, '').replace(/"$/, '');
    if (key === 'ID') result.osType = value;
    if (key === 'VERSION_ID') result.osVersion = value;
  }
  return result;
}

async function withSshConnection<T>(options: InstallTarget, fn: (conn: Client) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const connectConfig: any = {
      host: options.host,
      port: options.port,
      username: options.username,
      readyTimeout: 30000,
    };

    if (options.authType === 'password') {
      connectConfig.password = options.credential;
    } else {
      connectConfig.privateKey = options.credential;
    }

    conn.on('ready', async () => {
      try {
        const result = await fn(conn);
        conn.end();
        resolve(result);
      } catch (err) {
        conn.end();
        reject(err);
      }
    });

    conn.on('error', reject);
    conn.connect(connectConfig);
  });
}

async function execOverSsh(conn: Client, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let stdout = '';
      let stderr = '';
      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      stream.on('close', (code: number | null) => {
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
    });
  });
}

async function getSftp(conn: Client) {
  return new Promise<any>((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) reject(err);
      else resolve(sftp);
    });
  });
}

async function uploadFile(conn: Client, localPath: string, remotePath: string, mode?: number) {
  const sftp = await getSftp(conn);
  await new Promise<void>((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
  if (mode) {
    await new Promise<void>((resolve, reject) => {
      sftp.chmod(remotePath, mode, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

async function uploadContent(conn: Client, remotePath: string, content: string, mode?: number) {
  const sftp = await getSftp(conn);
  await new Promise<void>((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath, mode ? { mode } : undefined);
    stream.on('error', reject);
    stream.on('close', resolve);
    stream.end(content);
  });
}

async function uploadBinaryViaExec(conn: Client, localPath: string) {
  const data = await fs.readFile(localPath);
  await new Promise<void>((resolve, reject) => {
    conn.exec('cat > /tmp/mynode-agent', (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      stream.on('close', (code: number | null) => {
        if (code && code != 0) {
          reject(new Error(`cat exit ${code}`));
          return;
        }
        resolve();
      });
      stream.end(data);
    });
  });
  const installResult = await execOverSsh(conn, 'install -m 755 /tmp/mynode-agent /usr/local/bin/mynode-agent');
  if (installResult.exitCode != 0) {
    throw new Error(installResult.stderr || installResult.stdout || 'install failed');
  }
}

async function writeContentViaExec(conn: Client, remotePath: string, content: string, mode?: number) {
  await new Promise<void>((resolve, reject) => {
    conn.exec(`cat > ${shellEscapeSingle(remotePath)}`, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      stream.on('close', (code: number | null) => {
        if (code && code != 0) {
          reject(new Error(`cat exit ${code}`));
          return;
        }
        resolve();
      });
      stream.end(content);
    });
  });
  if (mode) {
    const chmodResult = await execOverSsh(conn, `chmod ${mode.toString(8)} ${shellEscapeSingle(remotePath)}`);
    if (chmodResult.exitCode != 0) {
      throw new Error(chmodResult.stderr || chmodResult.stdout || 'chmod failed');
    }
  }
}

function buildAgentConfig(serverAddr: string, agentToken: string): string {
  return `server: ${serverAddr}
token: ${agentToken}
`;
}

function buildSystemdService(): string {
  return `[Unit]
Description=Mynode Agent
After=network.target

[Service]
ExecStart=/usr/local/bin/mynode-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}

function getStoredPublicBaseUrl(): string | null {
  const setting = db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'publicBaseUrl'))
    .get();
  if (!setting?.value) return null;
  try {
    const parsed = JSON.parse(setting.value);
    if (typeof parsed === 'string' && parsed.trim()) {
      return parsed.trim();
    }
  } catch {
    return null;
  }
  return null;
}

export function buildInstallScript(): string {
  return `#!/bin/bash
set -e

AGENT_URL="$1"
AGENT_TOKEN="$2"
SERVER_ADDR="$3"

ARCH=$(uname -m)
case $ARCH in
  x86_64) ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

curl -fsSL "${AGENT_URL}/mynode-agent-linux-${ARCH}" -o /usr/local/bin/mynode-agent
chmod +x /usr/local/bin/mynode-agent

mkdir -p /etc/mynode
cat > /etc/mynode/agent.yaml <<EOF
server: ${SERVER_ADDR}
token: ${AGENT_TOKEN}
EOF

cat > /etc/systemd/system/mynode-agent.service <<EOF
[Unit]
Description=Mynode Agent
After=network.target

[Service]
ExecStart=/usr/local/bin/mynode-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mynode-agent
systemctl start mynode-agent
`;
}

export function buildAgentInstallCommand(
  publicBaseUrl: string,
  agentDownloadBaseUrl: string,
  serverAddr: string,
  agentToken: string
): string {
  const scriptUrl = `${normalizeUrl(publicBaseUrl)}/agent/install.sh`;
  return `curl -fsSL ${shellEscapeSingle(scriptUrl)} | bash -s -- ${shellEscapeSingle(agentDownloadBaseUrl)} ${shellEscapeSingle(agentToken)} ${shellEscapeSingle(serverAddr)}`;
}

export async function detectSystemInfoOverSsh(options: InstallTarget): Promise<DetectedSystemInfo> {
  return withSshConnection(options, async (conn) => {
    const archResult = await execOverSsh(conn, 'uname -m');
    if (archResult.exitCode !== 0) {
      throw new Error(archResult.stderr || 'Failed to detect arch');
    }

    const osResult = await execOverSsh(conn, 'cat /etc/os-release');
    const osInfo = osResult.exitCode === 0 ? parseOsRelease(osResult.stdout) : {};

    return {
      arch: mapArch(archResult.stdout),
      osType: osInfo.osType,
      osVersion: osInfo.osVersion,
    };
  });
}

export async function installAgentOverSshViaScp(
  options: AgentInstallOptions
): Promise<{ stdout: string; stderr: string; detected: DetectedSystemInfo }> {
  const detected = await detectSystemInfoOverSsh(options);
  const binaryPath = path.resolve(config.agentBinaryDir, `mynode-agent-linux-${detected.arch}`);
  await fs.access(binaryPath);

  return withSshConnection(options, async (conn) => {
    const stopResult = await execOverSsh(conn, 'systemctl stop mynode-agent || true');
    if (stopResult.exitCode !== 0) {
      throw new Error(`stop-service: ${stopResult.stderr || stopResult.stdout || 'failed'}`);
    }

    const prepResult = await execOverSsh(conn, 'mkdir -p /usr/local/bin /etc/mynode /etc/systemd/system');
    if (prepResult.exitCode !== 0) {
      throw new Error(`prepare: ${prepResult.stderr || prepResult.stdout || 'failed'}`);
    }

    try {
      await uploadFile(conn, binaryPath, '/usr/local/bin/mynode-agent', 0o755);
    } catch (err: any) {
      try {
        await uploadBinaryViaExec(conn, binaryPath);
      } catch (fallbackErr: any) {
        throw new Error(`upload-binary: ${fallbackErr?.message || err?.message || String(err)}`);
      }
    }

    try {
      await uploadContent(conn, '/etc/mynode/agent.yaml', buildAgentConfig(options.serverAddr, options.agentToken), 0o600);
    } catch (err: any) {
      try {
        await writeContentViaExec(conn, '/etc/mynode/agent.yaml', buildAgentConfig(options.serverAddr, options.agentToken), 0o600);
      } catch (fallbackErr: any) {
        throw new Error(`write-config: ${fallbackErr?.message || err?.message || String(err)}`);
      }
    }

    try {
      await uploadContent(conn, '/etc/systemd/system/mynode-agent.service', buildSystemdService(), 0o644);
    } catch (err: any) {
      try {
        await writeContentViaExec(conn, '/etc/systemd/system/mynode-agent.service', buildSystemdService(), 0o644);
      } catch (fallbackErr: any) {
        throw new Error(`write-service: ${fallbackErr?.message || err?.message || String(err)}`);
      }
    }

    const reloadResult = await execOverSsh(
      conn,
      'systemctl daemon-reload && systemctl enable mynode-agent && systemctl restart mynode-agent'
    );
    if (reloadResult.exitCode !== 0) {
      throw new Error(`start-service: ${reloadResult.stderr || reloadResult.stdout || 'failed'}`);
    }

    return { stdout: reloadResult.stdout, stderr: reloadResult.stderr, detected };
  });
}
