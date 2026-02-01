CREATE TABLE `admin` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer,
	`last_login_ip` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_username_unique` ON `admin` (`username`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` integer,
	`details` text,
	`ip` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `command_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vps_id` integer NOT NULL,
	`command` text NOT NULL,
	`output` text,
	`exit_code` integer,
	`executed_at` integer NOT NULL,
	`executed_by` text,
	FOREIGN KEY (`vps_id`) REFERENCES `vps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `config_module_sync_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module_type` text NOT NULL,
	`vps_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`synced_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`vps_id`) REFERENCES `vps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `config_modules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`previous_content` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `config_modules_type_unique` ON `config_modules` (`type`);--> statement-breakpoint
CREATE TABLE `dd_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vps_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`target_os` text NOT NULL,
	`target_version` text NOT NULL,
	`new_password` text NOT NULL,
	`new_ssh_port` integer DEFAULT 22 NOT NULL,
	`command_output` text,
	`command_exit_code` integer,
	`error_message` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`vps_id`) REFERENCES `vps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `init_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`script` text NOT NULL,
	`variables` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`attempted_at` integer NOT NULL,
	`success` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vps_id` integer NOT NULL,
	`cpu_usage` real,
	`mem_usage` real,
	`disk_usage` real,
	`net_in` integer,
	`net_out` integer,
	`disk_read_bytes` integer,
	`disk_write_bytes` integer,
	`load1` real,
	`load5` real,
	`load15` real,
	`collected_at` integer NOT NULL,
	FOREIGN KEY (`vps_id`) REFERENCES `vps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vps_id` integer,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending',
	`sent_at` integer,
	FOREIGN KEY (`vps_id`) REFERENCES `vps`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `notify_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`enabled` integer DEFAULT true,
	`config` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ping_monitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vps_id` integer NOT NULL,
	`name` text NOT NULL,
	`target` text NOT NULL,
	`port` integer,
	`type` text NOT NULL,
	`interval` integer DEFAULT 60 NOT NULL,
	`timeout` integer DEFAULT 5000 NOT NULL,
	`enabled` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`vps_id`) REFERENCES `vps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ping_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`success` integer NOT NULL,
	`latency` real,
	`error` text,
	`collected_at` integer NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `ping_monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `software` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`category` text,
	`install_method` text NOT NULL,
	`install_script` text NOT NULL,
	`uninstall_script` text,
	`check_command` text,
	`version_command` text,
	`service_name` text,
	`config_path` text,
	`config_content` text,
	`service_config_content` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `software_name_unique` ON `software` (`name`);--> statement-breakpoint
CREATE TABLE `software_installations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`software_id` integer NOT NULL,
	`vps_id` integer NOT NULL,
	`status` text DEFAULT 'installing' NOT NULL,
	`version` text,
	`install_output` text,
	`error_message` text,
	`installed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`software_id`) REFERENCES `software`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vps_id`) REFERENCES `vps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `software_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_settings_key_unique` ON `system_settings` (`key`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#1890ff'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `vps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`ip` text NOT NULL,
	`ssh_port` integer DEFAULT 22 NOT NULL,
	`auth_type` text NOT NULL,
	`auth_credential` text NOT NULL,
	`logo` text,
	`vendor_url` text,
	`group_id` integer,
	`agent_token` text,
	`agent_status` text DEFAULT 'pending',
	`os_type` text,
	`os_version` text,
	`arch` text,
	`country_code` text,
	`country` text,
	`geo_updated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `vps_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vps_agent_token_unique` ON `vps` (`agent_token`);--> statement-breakpoint
CREATE TABLE `vps_billing` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vps_id` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`amount` real NOT NULL,
	`bandwidth` text,
	`traffic` text,
	`traffic_gb` real,
	`traffic_cycle` text,
	`route` text,
	`billing_cycle` text NOT NULL,
	`cycle_days` integer,
	`start_date` integer NOT NULL,
	`expire_date` integer NOT NULL,
	`auto_renew` integer DEFAULT false,
	FOREIGN KEY (`vps_id`) REFERENCES `vps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vps_group_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vps_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	FOREIGN KEY (`vps_id`) REFERENCES `vps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `vps_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vps_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vps_system_info` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vps_id` integer NOT NULL,
	`hostname` text,
	`kernel` text,
	`cpu_model` text,
	`cpu_cores` integer,
	`cpu_threads` integer,
	`mem_total` integer,
	`mem_available` integer,
	`disks` text,
	`networks` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`vps_id`) REFERENCES `vps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vps_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vps_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`vps_id`) REFERENCES `vps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
