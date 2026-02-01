import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// VPS分组
export const vpsGroups = sqliteTable('vps_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// VPS主表
export const vps = sqliteTable('vps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  ip: text('ip').notNull(),
  sshPort: integer('ssh_port').notNull().default(22),
  authType: text('auth_type', { enum: ['password', 'key'] }).notNull(),
  authCredential: text('auth_credential').notNull(), // 加密存储
  logo: text('logo'), // URL或Base64
  vendorUrl: text('vendor_url'),
  groupId: integer('group_id').references(() => vpsGroups.id),
  agentToken: text('agent_token').unique(),
  agentStatus: text('agent_status', {
    enum: ['pending', 'installing', 'online', 'offline'],
  }).default('pending'),
  osType: text('os_type'), // debian, ubuntu, centos, etc.
  osVersion: text('os_version'),
  arch: text('arch'), // amd64, arm64
  publicIpv4: text('public_ipv4'), // 从被控服务器获取的公网 IPv4
  publicIpv6: text('public_ipv6'), // 从被控服务器获取的公网 IPv6
  countryCode: text('country_code'), // 国家/地区代码，如 "US", "HK", "TW"
  country: text('country'), // 国家/地区名称
  geoUpdatedAt: integer('geo_updated_at', { mode: 'timestamp' }), // 地理信息缓存更新时间
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// VPS-分组关联
export const vpsGroupMembers = sqliteTable('vps_group_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id')
    .notNull()
    .references(() => vps.id, { onDelete: 'cascade' }),
  groupId: integer('group_id')
    .notNull()
    .references(() => vpsGroups.id, { onDelete: 'cascade' }),
});

// VPS系统信息
export const vpsSystemInfo = sqliteTable('vps_system_info', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id')
    .notNull()
    .references(() => vps.id, { onDelete: 'cascade' }),
  hostname: text('hostname'),
  kernel: text('kernel'),
  cpuModel: text('cpu_model'),
  cpuCores: integer('cpu_cores'),
  cpuThreads: integer('cpu_threads'),
  memTotal: integer('mem_total'),
  memAvailable: integer('mem_available'),
  disks: text('disks', { mode: 'json' }),
  networks: text('networks', { mode: 'json' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// VPS费用
export const vpsBilling = sqliteTable('vps_billing', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id')
    .notNull()
    .references(() => vps.id, { onDelete: 'cascade' }),
  currency: text('currency').notNull().default('USD'), // USD, CNY, EUR, etc.
  amount: real('amount').notNull(),
  bandwidth: text('bandwidth'),
  traffic: text('traffic'),
  trafficGb: real('traffic_gb'),
  trafficCycle: text('traffic_cycle'),
  route: text('route'),
  billingCycle: text('billing_cycle').notNull(), // monthly, quarterly, yearly, etc.
  cycleDays: integer('cycle_days'), // 自定义天数
  startDate: integer('start_date', { mode: 'timestamp' }).notNull(),
  expireDate: integer('expire_date', { mode: 'timestamp' }).notNull(),
  autoRenew: integer('auto_renew', { mode: 'boolean' }).default(false),
});

// 标签
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color').default('#1890ff'),
});

// VPS-标签关联
export const vpsTags = sqliteTable('vps_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id')
    .notNull()
    .references(() => vps.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' }),
});

// 配置历史
// 通知配置
export const notifyConfig = sqliteTable('notify_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['email', 'telegram'] }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  config: text('config', { mode: 'json' }).notNull(), // SMTP配置或Telegram配置
});

// 通知记录
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id').references(() => vps.id, { onDelete: 'set null' }),
  type: text('type').notNull(), // expire_warning, agent_offline, threshold_alert
  title: text('title').notNull(),
  message: text('message').notNull(),
  channel: text('channel').notNull(), // email, telegram
  status: text('status', { enum: ['pending', 'sent', 'failed'] }).default('pending'),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
});

// 命令执行日志
export const commandLogs = sqliteTable('command_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id')
    .notNull()
    .references(() => vps.id, { onDelete: 'cascade' }),
  command: text('command').notNull(),
  output: text('output'),
  exitCode: integer('exit_code'),
  executedAt: integer('executed_at', { mode: 'timestamp' }).notNull(),
  executedBy: text('executed_by'),
});

// 初始化模板
export const initTemplates = sqliteTable('init_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  script: text('script').notNull(),
  variables: text('variables', { mode: 'json' }), // 变量定义
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// 监控指标
export const metrics = sqliteTable('metrics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id')
    .notNull()
    .references(() => vps.id, { onDelete: 'cascade' }),
  cpuUsage: real('cpu_usage'),
  memUsage: real('mem_usage'),
  diskUsage: real('disk_usage'),
  netIn: integer('net_in'), // bytes
  netOut: integer('net_out'), // bytes
  diskReadBytes: integer('disk_read_bytes'), // bytes
  diskWriteBytes: integer('disk_write_bytes'), // bytes
  load1: real('load1'),
  load5: real('load5'),
  load15: real('load15'),
  collectedAt: integer('collected_at', { mode: 'timestamp' }).notNull(),
});

// Ping监控配置
export const pingMonitors = sqliteTable('ping_monitors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id')
    .notNull()
    .references(() => vps.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // 监控名称
  target: text('target').notNull(), // 目标地址（IP或域名）
  port: integer('port'), // TCP端口（TCPing时必填）
  type: text('type', { enum: ['icmp', 'tcp'] }).notNull(), // 监控类型
  interval: integer('interval').notNull().default(60), // 监控频率（秒）
  timeout: integer('timeout').notNull().default(5000), // 超时时间（毫秒）
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Ping监控结果
export const pingResults = sqliteTable('ping_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  monitorId: integer('monitor_id')
    .notNull()
    .references(() => pingMonitors.id, { onDelete: 'cascade' }),
  success: integer('success', { mode: 'boolean' }).notNull(),
  latency: real('latency'), // 延迟（毫秒）
  error: text('error'), // 错误信息
  collectedAt: integer('collected_at', { mode: 'timestamp' }).notNull(),
});

// 软件预设配置
export const softwarePresets = sqliteTable('software_presets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull(), // xray, nginx, realm, snell
  config: text('config', { mode: 'json' }).notNull(),
});

// 管理员（单用户）
export const admin = sqliteTable('admin', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  lastLoginIp: text('last_login_ip'),
});

// 登录失败记录（用于锁定）
export const loginAttempts = sqliteTable('login_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ip: text('ip').notNull(),
  attemptedAt: integer('attempted_at', { mode: 'timestamp' }).notNull(),
  success: integer('success', { mode: 'boolean' }).notNull(),
});

// 系统设置
export const systemSettings = sqliteTable('system_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value', { mode: 'json' }).notNull(),
});

// DD重装任务
export const ddTasks = sqliteTable('dd_tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id')
    .notNull()
    .references(() => vps.id, { onDelete: 'cascade' }),
  status: text('status', {
    enum: ['pending', 'executing', 'rebooting', 'waiting', 'reconnecting', 'installing_agent', 'completed', 'failed'],
  }).notNull().default('pending'),
  targetOs: text('target_os').notNull(), // debian, ubuntu, centos, rocky, alpine
  targetVersion: text('target_version').notNull(), // 13, 24.04, 9, etc.
  newPassword: text('new_password').notNull(), // 加密存储
  newSshPort: integer('new_ssh_port').notNull().default(22),
  commandOutput: text('command_output'),
  commandExitCode: integer('command_exit_code'),
  errorMessage: text('error_message'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

// 审计日志
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(), // login, logout, vps_create, vps_delete, command_exec, config_update
  targetType: text('target_type'), // vps, config, system
  targetId: integer('target_id'),
  details: text('details', { mode: 'json' }),
  ip: text('ip'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// 配置管理模块
export const configModules = sqliteTable('config_modules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull().unique(),
  content: text('content', { mode: 'json' }).notNull(),
  previousContent: text('previous_content', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// 配置同步记录
export const configModuleSyncRecords = sqliteTable('config_module_sync_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  moduleType: text('module_type').notNull(),
  vpsId: integer('vps_id')
    .notNull()
    .references(() => vps.id, { onDelete: 'cascade' }),
  status: text('status', {
    enum: ['pending', 'success', 'failed'],
  }).notNull().default('pending'),
  errorMessage: text('error_message'),
  syncedAt: integer('synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// 软件定义表
export const software = sqliteTable('software', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  category: text('category'), // web, container, proxy, etc.
  installMethod: text('install_method', {
    enum: ['script', 'command', 'apt', 'yum']
  }).notNull(),
  installScript: text('install_script').notNull(),
  uninstallScript: text('uninstall_script'),
  checkCommand: text('check_command'), // 检查是否已安装，如 "which nginx"
  versionCommand: text('version_command'), // 获取版本，如 "nginx -v"
  serviceName: text('service_name'), // systemd服务名，如 "nginx"
  configPath: text('config_path'), // 配置文件路径
  configContent: text('config_content'), // 默认配置内容
  serviceConfigContent: text('service_config_content'), // systemd服务配置内容
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// 软件安装记录表
export const softwareInstallations = sqliteTable('software_installations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  softwareId: integer('software_id')
    .notNull()
    .references(() => software.id, { onDelete: 'cascade' }),
  vpsId: integer('vps_id')
    .notNull()
    .references(() => vps.id, { onDelete: 'cascade' }),
  status: text('status', {
    enum: ['installing', 'installed', 'failed', 'uninstalled']
  }).notNull().default('installing'),
  version: text('version'),
  installOutput: text('install_output'),
  errorMessage: text('error_message'),
  installedAt: integer('installed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
