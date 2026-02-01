# Mynode - API Reference

Base path: `${BASE_PATH}/api`

Authentication: cookie-based JWT (`token`).
All endpoints return JSON. Errors use `{ error: string, details?: any }`.

## 1. Auth

- `GET /auth/status`
  - Response: `{ initialized: boolean }`

- `POST /auth/setup`
  - Body: `{ username: string, password: string }`
  - Response: `{ success: true }`

- `POST /auth/login`
  - Body: `{ username: string, password: string }`
  - Response: `{ success: true, username: string }`

- `POST /auth/logout`
  - Response: `{ success: true }`

- `GET /auth/me`
  - Response: `{ authenticated: true, username: string }`

- `POST /auth/change-password`
  - Body: `{ oldPassword: string, newPassword: string }`
  - Response: `{ success: true }`

## 2. VPS

- `GET /vps`
  - Query: `page`, `pageSize`, `groupId?`, `status?`, `search?`
  - Response: `{ total, page, pageSize, items: Vps[] }`

- `GET /vps/:id`
  - Response: `Vps` (includes `billing`, `tags`, `groups`, `systemInfo`)

- `POST /vps`
  - Body: `CreateVpsPayload`
  - Response: `{ id: number, agentToken: string, agentInstallCommand: string }`

- `PUT /vps/:id`
  - Body: `UpdateVpsPayload`
  - Response: `{ success: true }`

- `DELETE /vps/:id`
  - Response: `{ success: true }`

- `POST /vps/:id/reset-token`
  - Response: `{ agentToken: string }`

- `POST /vps/:id/install-agent`
  - Body: `{ authType?: 'password' | 'key', authCredential?: string }`
  - Response: `{ status: 'installing' | 'updating' | 'error', method: 'ssh' | 'websocket', error?: string }`

- `POST /vps/:id/exec`
  - Body: `{ command: string, timeout?: number }`
  - Response: `{ exitCode, output, stdout, stderr }`

- `GET /vps/:id/has-credential`
  - Response: `{ hasCredential: boolean }`

- `GET /vps/:id/credential`
  - Response: `{ authType: string, credential: string }`

- `GET /vps/:id/metrics`
  - Query: `limit?`, `since?` (ISO)
  - Response: `{ items: Metric[] }`

- `GET /vps/:id/ping-monitors`
  - Response: `{ items: PingMonitor[] }`

- `GET /vps/:id/ping-results`
  - Query: `monitorId`, `limit?`, `since?` (ISO)
  - Response: `{ items: PingResult[] }`

### CreateVpsPayload

```
{
  "name": "string",
  "ip": "string",
  "sshPort": 22,
  "authType": "password" | "key",
  "authCredential": "string",
  "saveCredential": false,
  "logo": "string?",
  "vendorUrl": "string?",
  "groupId": 1?,
  "groupIds": [1,2]?,
  "tagIds": [1,2]?,
  "billing": {
    "currency": "USD",
    "amount": 10,
    "bandwidth": "string?",
    "traffic": "string?",
    "trafficGb": 100?,
    "trafficCycle": "monthly"?,
    "route": "string?",
    "billingCycle": "monthly" | "quarterly" | "semi-annually" | "annually" | "biennially" | "triennially" | "custom",
    "cycleDays": 30?,
    "startDate": "2024-01-01T00:00:00.000Z",
    "expireDate": "2024-02-01T00:00:00.000Z",
    "autoRenew": false
  }?
}
```

## 3. DD Reinstall

- `GET /dd/supported-os`
  - Response: `{ debian: string[], ubuntu: string[], centos: string[], rocky: string[], alpine: string[] }`

- `POST /dd/:vpsId/start`
  - Query: `force?=true`
  - Body: `{ targetOs, targetVersion, newPassword, newSshPort }`
  - Response: `{ taskId: number, message: string }`

- `GET /dd/task/:taskId`
  - Response: `DdTask`

- `GET /dd/:vpsId/history`
  - Response: `{ items: DdTask[] }`

## 4. Config Modules (global)

- `GET /config/modules/:type`
  - `type`: `network | timezone | dns | ssh`
  - Response: `{ type, content, updatedAt }`

- `PUT /config/modules/:type`
  - Body: `{ content }`
  - Response: `{ success: true }`

- `POST /config/modules/:type/rollback`
  - Response: `{ success: true }`

- `POST /config/modules/:type/sync`
  - Body: `{ targetVpsIds: number[] }`
  - Response: `{ results }`

- `GET /config/modules/:type/vps/:vpsId`
  - Response: `{ type, content }`

- `PUT /config/modules/:type/vps/:vpsId`
  - Body: `{ content }`
  - Response: `{ success: true }`

### SSH Module Content

```
{
  "port": 22,
  "allowRootLogin": false,
  "allowPasswordLogin": false
}
```

## 5. Software

- `GET /software`
  - Response: `{ items: Software[] }`

- `POST /software`
- `GET /software/:id`
- `PUT /software/:id`
- `DELETE /software/:id`

- `POST /software/:id/install`
  - Body: `{ vpsIds: number[] }`
  - Response: `{ results, affectedServers }`

- `POST /software/:id/uninstall`
  - Body: `{ vpsIds: number[] }`
  - Response: `{ results, affectedServers }`

- `GET /software/:id/status/:vpsId`
- `GET /software/:id/service/:vpsId`
- `POST /software/:id/service/:vpsId`
  - Body: `{ action: 'start' | 'stop' | 'restart' }`

- `GET /software/:id/config/:vpsId`
- `PUT /software/:id/config/:vpsId`
  - Body: `{ content: string }`

- `POST /software/refresh-all`
- `GET /software/:id/installations`
  - Query: `page`, `pageSize`, `vpsId?`

- `POST /software/install-base`
  - Body: `{ vpsIds: number[] }`

## 8. Notify

- `GET /notify/config`
- `PUT /notify/config/email`
- `PUT /notify/config/telegram`
- `POST /notify/test/:channel`
  - Body: `{ recipient?: string }`
- `GET /notify/history`
  - Query: `page`, `pageSize`

## 9. System

- `GET /system/settings`
- `PUT /system/settings/:key`
  - Body: `{ value: any }`

- `GET /system/agent-check-config`
- `PUT /system/agent-check-config`
  - Body: `{ checkInterval, offlineThreshold }`

- `GET /system/audit-logs`
  - Query: `page`, `pageSize`

- `GET /system/groups`
- `POST /system/groups`
- `PUT /system/groups/:id`
- `DELETE /system/groups/:id`
- `GET /system/groups/:id/vps`
- `PUT /system/groups/:id/vps`

- `GET /system/tags`
- `POST /system/tags`
- `PUT /system/tags/:id`
- `DELETE /system/tags/:id`

- `GET /system/overview`
- `GET /system/metrics/latest`
- `POST /system/cleanup`

- `GET /system/network-monitors`
- `PUT /system/network-monitors`
  - Body: `{ items: Monitor[] }`
- `POST /system/network-monitors/apply`
  - Body: `{ vpsIds: number[] }`

## 10. Agent WebSocket

Path: `${BASE_PATH}/ws/agent?token=...`

Message envelope:

```
{
  "id": "uuid?",
  "type": "string",
  "payload": {},
  "error": "string?",
  "timestamp": 1730000000000
}
```

Server -> Agent:
- `exec`: `{ command: string, timeout?: number }`
- `read_file`: `{ path: string }`
- `write_file`: `{ path: string, content: string }`
- `ping_config`: `{ monitors: PingMonitor[] }`
- `heartbeat_ack`: `{}`

Agent -> Server:
- `heartbeat`: `{}`
- `metrics`: `MetricsPayload`
- `system_info`: `SystemInfoPayload`
- `ping_results`: `{ results: PingResult[] }`
- `response`: `{ id, payload?, error? }`

## 11. Agent Download

- `GET /agent/install.sh`
- `GET /agent/:filename` (`mynode-agent-linux-amd64` | `mynode-agent-linux-arm64`)

## 12. 本次变更说明（2026-01-31）

- API 无变更（仅前端图表组件修复）

## 13. 本次变更说明（2026-01-31）

- API 无变更（配置查看单机编辑为前端交互调整）

## 14. 本次变更说明（2026-01-31）

- API 无变更（修复时区配置页面白屏）

## 15. 本次变更说明（2026-01-31）

- API 无变更（分组/标签管理标题图标展示）

## 16. 本次变更说明（2026-01-31）

- API 无变更（仪表盘服务器列表 Logo 高度调整）

## 17. 本次变更说明（2026-01-31）

- API 无变更（仪表盘服务器列表 Logo 尺寸样式修正）

## 18. 本次变更说明（2026-01-31）

- API 无变更（仪表盘服务器列表 Logo 调整为 40px）

## 19. 本次变更说明（2026-01-31）

- API 无变更（仪表盘服务器列表新增“商家”列并调整 Logo 尺寸）
