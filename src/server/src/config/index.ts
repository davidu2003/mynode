import { randomBytes } from 'crypto';

function generateSecret(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

// 从环境变量读取配置，提供默认值
export const config = {
  // 服务器配置
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  basePath: process.env.BASE_PATH || '', // 自定义路径前缀

  // 数据库
  databasePath: process.env.DATABASE_PATH || './data/mynode.db',

  // 安全配置
  encryptionKey: process.env.ENCRYPTION_KEY || generateSecret(32),
  jwtSecret: process.env.JWT_SECRET || generateSecret(32),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',

  // 登录安全
  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
  lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '900000', 10), // 15分钟

  // Agent配置
  agentHeartbeatInterval: parseInt(process.env.AGENT_HEARTBEAT_INTERVAL || '30000', 10), // 30秒
  agentOfflineThreshold: parseInt(process.env.AGENT_OFFLINE_THRESHOLD || '90000', 10), // 90秒
  agentDownloadBaseUrl: process.env.AGENT_DOWNLOAD_BASE_URL || '',
  agentBinaryDir: process.env.AGENT_BINARY_DIR || '../../dist/agent',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',

  // 监控数据保留
  metricsRetentionDays: parseInt(process.env.METRICS_RETENTION_DAYS || '30', 10),

  // 费用自动续费检查周期
  billingAutoRenewIntervalMs: parseInt(process.env.BILLING_AUTORENEW_INTERVAL_MS || '3600000', 10),

  // 终端会话
  terminalIdleTimeout: parseInt(process.env.TERMINAL_IDLE_TIMEOUT || '600000', 10), // 10分钟
  maxTerminalSessions: parseInt(process.env.MAX_TERMINAL_SESSIONS || '2', 10),

  // IP白名单（可选）
  ipWhitelist: process.env.IP_WHITELIST ? process.env.IP_WHITELIST.split(',') : [],

  // 环境
  isDev: process.env.NODE_ENV !== 'production',
};

export type Config = typeof config;
