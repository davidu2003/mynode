import { db } from './index.js';
import { sql } from 'drizzle-orm';

// 初始化数据库表
export async function migrate() {
  console.log('Running database migrations...');

  db.run(sql`
    CREATE TABLE IF NOT EXISTS vps_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS vps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ip TEXT NOT NULL,
      ssh_port INTEGER NOT NULL DEFAULT 22,
      auth_type TEXT NOT NULL CHECK(auth_type IN ('password', 'key')),
      auth_credential TEXT NOT NULL,
      logo TEXT,
      vendor_url TEXT,
      group_id INTEGER REFERENCES vps_groups(id),
      agent_token TEXT UNIQUE,
      agent_status TEXT DEFAULT 'pending' CHECK(agent_status IN ('pending', 'installing', 'online', 'offline')),
      os_type TEXT,
      os_version TEXT,
      arch TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS vps_group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL REFERENCES vps(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES vps_groups(id) ON DELETE CASCADE
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS vps_system_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL UNIQUE REFERENCES vps(id) ON DELETE CASCADE,
      hostname TEXT,
      kernel TEXT,
      cpu_model TEXT,
      cpu_cores INTEGER,
      cpu_threads INTEGER,
      mem_total INTEGER,
      mem_available INTEGER,
      disks TEXT,
      networks TEXT,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS vps_billing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL REFERENCES vps(id) ON DELETE CASCADE,
      currency TEXT NOT NULL DEFAULT 'USD',
      amount REAL NOT NULL,
      bandwidth TEXT,
      traffic TEXT,
      route TEXT,
      billing_cycle TEXT NOT NULL,
      cycle_days INTEGER,
      start_date INTEGER NOT NULL,
      expire_date INTEGER NOT NULL,
      auto_renew INTEGER DEFAULT 0
    )
  `);

  try {
    db.run(sql`ALTER TABLE vps_billing ADD COLUMN bandwidth TEXT`);
  } catch {}
  try {
    db.run(sql`ALTER TABLE vps_billing ADD COLUMN traffic TEXT`);
  } catch {}
  try {
    db.run(sql`ALTER TABLE vps_billing ADD COLUMN route TEXT`);
  } catch {}
  try {
    db.run(sql`ALTER TABLE vps_billing ADD COLUMN traffic_gb REAL`);
  } catch {}
  try {
    db.run(sql`ALTER TABLE vps_billing ADD COLUMN traffic_cycle TEXT`);
  } catch {}

  db.run(sql`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#1890ff'
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS vps_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL REFERENCES vps(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  db.run(sql`DROP TABLE IF EXISTS config_history`);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS notify_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('email', 'telegram')),
      enabled INTEGER DEFAULT 1,
      config TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER REFERENCES vps(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
      sent_at INTEGER
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS command_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL REFERENCES vps(id) ON DELETE CASCADE,
      command TEXT NOT NULL,
      output TEXT,
      exit_code INTEGER,
      executed_at INTEGER NOT NULL,
      executed_by TEXT
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS init_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      script TEXT NOT NULL,
      variables TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL REFERENCES vps(id) ON DELETE CASCADE,
      cpu_usage REAL,
      mem_usage REAL,
      disk_usage REAL,
      net_in INTEGER,
      net_out INTEGER,
      disk_read_bytes INTEGER,
      disk_write_bytes INTEGER,
      load1 REAL,
      load5 REAL,
      load15 REAL,
      collected_at INTEGER NOT NULL
    )
  `);

  try {
    db.run(sql`ALTER TABLE metrics ADD COLUMN disk_read_bytes INTEGER`);
  } catch {}
  try {
    db.run(sql`ALTER TABLE metrics ADD COLUMN disk_write_bytes INTEGER`);
  } catch {}

  db.run(sql`
    CREATE TABLE IF NOT EXISTS ping_monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL REFERENCES vps(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      target TEXT NOT NULL,
      port INTEGER,
      type TEXT NOT NULL CHECK(type IN ('icmp', 'tcp')),
      interval INTEGER NOT NULL DEFAULT 60,
      timeout INTEGER NOT NULL DEFAULT 5000,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS ping_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES ping_monitors(id) ON DELETE CASCADE,
      success INTEGER NOT NULL,
      latency REAL,
      error TEXT,
      collected_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS software_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER,
      last_login_ip TEXT
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      attempted_at INTEGER NOT NULL,
      success INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS dd_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL REFERENCES vps(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'executing', 'rebooting', 'waiting', 'reconnecting', 'installing_agent', 'completed', 'failed')),
      target_os TEXT NOT NULL,
      target_version TEXT NOT NULL,
      new_password TEXT NOT NULL,
      new_ssh_port INTEGER NOT NULL DEFAULT 22,
      command_output TEXT,
      command_exit_code INTEGER,
      error_message TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      ip TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  try {
    db.run(sql`ALTER TABLE dd_tasks ADD COLUMN command_output TEXT`);
  } catch {}
  try {
    db.run(sql`ALTER TABLE dd_tasks ADD COLUMN command_exit_code INTEGER`);
  } catch {}

  db.run(sql`DROP TABLE IF EXISTS config_sync_records`);
  db.run(sql`DROP TABLE IF EXISTS config_templates`);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS config_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      previous_content TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS config_module_sync_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_type TEXT NOT NULL,
      vps_id INTEGER NOT NULL REFERENCES vps(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed')),
      error_message TEXT,
      synced_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS software (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      install_method TEXT NOT NULL CHECK(install_method IN ('script', 'command', 'apt', 'yum')),
      install_script TEXT NOT NULL,
      uninstall_script TEXT,
      check_command TEXT,
      version_command TEXT,
      service_name TEXT,
      config_path TEXT,
      config_content TEXT,
      service_config_content TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  try {
    db.run(sql`ALTER TABLE software ADD COLUMN service_name TEXT`);
  } catch {}
  try {
    db.run(sql`ALTER TABLE software ADD COLUMN config_path TEXT`);
  } catch {}
  try {
    db.run(sql`ALTER TABLE software ADD COLUMN config_content TEXT`);
  } catch {}
  try {
    db.run(sql`ALTER TABLE software ADD COLUMN service_config_content TEXT`);
  } catch {}

  db.run(sql`
    CREATE TABLE IF NOT EXISTS software_installations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      software_id INTEGER NOT NULL REFERENCES software(id) ON DELETE CASCADE,
      vps_id INTEGER NOT NULL REFERENCES vps(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'installing' CHECK(status IN ('installing', 'installed', 'failed', 'uninstalled')),
      version TEXT,
      install_output TEXT,
      error_message TEXT,
      installed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(software_id, vps_id)
    )
  `);

  // 创建索引
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_vps_agent_status ON vps(agent_status)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_vps_group_id ON vps(group_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_metrics_vps_id ON metrics(vps_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_metrics_collected_at ON metrics(collected_at)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_ping_results_monitor_id ON ping_results(monitor_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_ping_results_collected_at ON ping_results(collected_at)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_command_logs_vps_id ON command_logs(vps_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_dd_tasks_vps_id ON dd_tasks(vps_id)`);

  // 新增表的索引
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_config_modules_type ON config_modules(type)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_config_module_sync_records_type ON config_module_sync_records(module_type)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_config_module_sync_records_vps_id ON config_module_sync_records(vps_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_software_installations_software_id ON software_installations(software_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_software_installations_vps_id ON software_installations(vps_id)`);

  console.log('Database migrations completed.');
}

// 直接运行时执行迁移
migrate().catch(console.error);
