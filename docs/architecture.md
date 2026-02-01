# Mynode - 技术设计文档

## 1. 系统架构

### 1.1 整体架构

```
                                 ┌─────────────────────────────────────┐
                                 │           Control Panel              │
                                 │  ┌─────────────────────────────────┐ │
                                 │  │         React Frontend          │ │
                                 │  │        (Vite + TypeScript)      │ │
                                 │  └──────────────┬──────────────────┘ │
                                 │                 │ HTTP/WebSocket     │
                                 │  ┌──────────────▼──────────────────┐ │
                                 │  │         Node.js Backend         │ │
                                 │  │       (Fastify + TypeScript)    │ │
                                 │  │  ┌───────────┐ ┌─────────────┐  │ │
                                 │  │  │ REST API  │ │ WebSocket   │  │ │
                                 │  │  └───────────┘ └─────────────┘  │ │
                                 │  └──────────────┬──────────────────┘ │
                                 │                 │                    │
                                 │  ┌──────────────▼──────────────────┐ │
                                 │  │     SQLite (better-sqlite3)     │ │
                                 │  └─────────────────────────────────┘ │
                                 └─────────────────┬───────────────────┘
                                                   │ WSS
                          ┌────────────────────────┼────────────────────────┐
                          │                        │                        │
                ┌─────────▼─────────┐    ┌─────────▼─────────┐    ┌─────────▼─────────┐
                │    Go Agent       │    │    Go Agent       │    │    Go Agent       │
                │  ┌─────────────┐  │    │  ┌─────────────┐  │    │  ┌─────────────┐  │
                │  │ Executor    │  │    │  │ Executor    │  │    │  │ Executor    │  │
                │  │ Collector   │  │    │  │ Collector   │  │    │  │ Collector   │  │
                │  │ Ping        │  │    │  │ Ping        │  │    │  │ Ping        │  │
                │  └─────────────┘  │    │  └─────────────┘  │    │  └─────────────┘  │
                │      VPS-1        │    │      VPS-2        │    │      VPS-N        │
                └───────────────────┘    └───────────────────┘    └───────────────────┘
```

### 1.2 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React | 19.2.x |
| 前端构建 | Vite | 7.2.x |
| **UI 框架** | **Shadcn UI (Radix UI + Tailwind)** | **Latest** |
| **样式系统** | **Tailwind CSS** | **v3.4.x** |
| **状态管理 (Server)** | **TanStack Query (React Query)** | **v5.x** |
| **状态管理 (Local)** | **Zustand** | **v4.x** |
| **表单管理** | **React Hook Form** | **v7.x** |
| 图表 | ECharts | 6.0.x |
| 路由 | React Router | 7.13.x |
| 后端框架 | Fastify | 5.7.x |
| 后端语言 | TypeScript | 5.9.x |
| 数据库 | SQLite (better-sqlite3) | 12.6.x |
| ORM | Drizzle ORM | 0.45.x |
| Agent 语言 | Go | 1.25.x |
| WebSocket | gorilla/websocket | 1.5.x |
| 系统信息 | gopsutil | 3.24.x |

### 1.3 目录结构

```
Mynode/
├── docs/                          # 文档
├── dist/                          # 编译产物
├── src/
│   ├── server/                    # 后端
│   ├── web/                       # 前端
│   │   ├── src/
│   │   │   ├── components/        # UI 组件 (ui/ 为 Shadcn 组件)
│   │   │   │   ├── ui/            # Button, Card, Dialog, Table, etc.
│   │   │   │   └── ...            # 业务组件 (OSIcon, CompactProgress)
│   │   │   ├── pages/             # 页面模块
│   │   │   ├── stores/            # 全局状态 (Theme, Auth)
│   │   │   ├── api/               # API 封装
│   │   │   └── lib/               # 工具库 (utils.ts)
│   │   └── package.json
│   └── agent/                     # Go Agent
```

### 1.4 前端架构演进与重构总结 (2026)

前端架构已从传统的 Ant Design 全家桶迁移至现代化的 **Tailwind CSS + Headless UI** 架构，旨在提供更轻量、更灵活、视觉更统一的用户体验。

#### 1.4.1 核心迁移
*   **样式系统**: 从 AntD 的 Less/CSS-in-JS 迁移至 **Tailwind CSS**。实现了 Utility-first 的开发模式，极大减少了自定义 CSS 代码量，并原生支持深色模式 (`dark:` 修饰符)。
*   **UI 组件**: 引入 **Shadcn UI** (基于 Radix UI)，组件代码直接存在于项目中 (`src/components/ui`), 拥有完全的控制权和定制能力。移除了对 Ant Design 组件库的强依赖（仅保留 `message` 用于全局提示）。
*   **数据流**: 引入 **TanStack Query** 接管服务端状态（数据获取、缓存、同步、轮询）。移除了大量手动维护 `loading/error/data` 的 `useEffect` 代码，代码更简洁、鲁棒性更强。
*   **表单处理**: 引入 **React Hook Form**。替代了 AntD Form，实现了非受控组件的高性能表单处理，与 Shadcn Input/Select 完美结合。

#### 1.4.2 视觉与交互优化
*   **深色模式**: 深度优化的 Dark Mode，使用 Zinc 色系 (`slate-950` 映射) 打造冷峻、高对比度的黑金风格。所有组件（表格、弹窗、表单、图表）均实现了自适应。
*   **紧凑布局**: 针对 Dashboard 和列表页进行了**高密度信息展示**优化。
    *   **Compact Progress**: 将百分比/数值直接内嵌于进度条中央，节省 30% 以上的横向空间。
    *   **Grid Layout**: 摒弃传统的栅格系统，使用 CSS Grid (`grid-cols-[...]`) 实现精确的列宽控制。
*   **品牌识别**: 引入 `react-icons` (Simple Icons)，根据操作系统指纹自动展示精确的品牌图标（如 Debian, Ubuntu, CentOS 的官方 LOGO），提升专业度。

#### 1.4.3 模块重构清单
*   **Dashboard**: 全新 Grid 布局，集成资产总览卡片，实时数据轮询。
*   **Server List**: 自定义 Table 组件，集成 Tag/Group 筛选。
*   **Server Detail**: 使用 Radix Tabs 分离视图，卡片式信息展示，集成 Shadcn Dialog 终端。
*   **Settings/Configs**: 模块化表单设计，动态字段数组 (`useFieldArray`) 支持。
*   **Software**: 统一的软件管理界面，支持多选服务器同步操作。

## 2. 后端模块设计

- 认证与安全：初始化管理员、登录/退出、登录锁定、修改密码
- VPS 管理：增删改查、分组/标签、多字段账单
- Agent 安装与更新：SSH + SCP 安装、在线 Agent 自更新
- Agent WebSocket：心跳、系统信息、监控指标、命令执行、文件读写、Ping 监控
- 配置管理：
  - 配置模块（network/timezone/dns/ssh）保存/同步/回滚
- 软件管理：软件定义 CRUD、安装/卸载、服务控制、配置读写、状态刷新
- DD 重装：任务创建、状态跟踪、强制终止、重装 Agent
- 通知配置：邮件/Telegram 配置与测试
- 系统设置：PUBLIC_BASE_URL、Agent 在线检查、网络监控配置、清理接口
- 审计日志：关键操作统一入库
- 自动任务：账单自动续费检查

## 3. 数据库设计

详细模型图见：`docs/database.md`

*(后续内容保持不变)*

## 4. 本次变更说明（2026-01-31）

- 前端图表组件修复：补齐 LineChart 的 extraSeries 入参类型与处理，避免运行时白屏
- 后端与数据库：无变更

## 5. 本次变更说明（2026-01-31）

- 配置管理：配置查看弹窗支持单机编辑与保存（Network/SSH）
- 后端与数据库：无变更

## 6. 本次变更说明（2026-01-31）

- 时区配置页面修复：补齐 detail 表单提交处理，避免页面白屏
- 后端与数据库：无变更

## 7. 本次变更说明（2026-01-31）

- 分组/标签管理：标题前增加图标以增强可读性
- 后端与数据库：无变更

## 8. 本次变更说明（2026-01-31）

- 仪表盘服务器列表：名称前 Logo 高度调整为 10px
- 后端与数据库：无变更

## 9. 本次变更说明（2026-01-31）

- 仪表盘服务器列表：Logo 尺寸使用固定 Tailwind 尺寸类确保生效
- 后端与数据库：无变更

## 10. 本次变更说明（2026-01-31）

- 仪表盘服务器列表：Logo 调整为 40px
- 后端与数据库：无变更

## 11. 本次变更说明（2026-01-31）

- 仪表盘服务器列表：Logo 独立为"商家"列，Logo 高度固定 10px、宽度自适应
- 后端与数据库：无变更

## 12. IP 地理位置与国旗展示功能（2026-01-31）

### 12.1 功能概述

在服务器列表、服务器详情、仪表盘等位置展示 IP 所在国家/地区的国旗图标。

### 12.2 数据库变更

VPS 表新增字段：
- `public_ipv4`: 从被控服务器获取的公网 IPv4 地址
- `public_ipv6`: 从被控服务器获取的公网 IPv6 地址
- `country_code`: 国家/地区代码（如 US、HK、TW）
- `country`: 国家/地区名称
- `geo_updated_at`: 地理信息缓存更新时间

### 12.3 公网 IP 获取逻辑

通过 Agent 在被控服务器执行命令获取公网 IP：

```bash
# 获取 IPv4
curl -s --connect-timeout 5 https://api-ipv4.ip.sb/ip

# 获取 IPv6
curl -s --connect-timeout 5 https://api-ipv6.ip.sb/ip
```

**设计要点**：
- 只有 Agent 在线时才会触发获取
- 采用按需刷新策略，缓存有效期 1 天
- 内存队列控制速率（每 1.5 秒一次，遵守 ip-api.com 45次/分钟限制）

### 12.4 地理信息查询

使用获取到的公网 IP 调用 `http://ip-api.com/json/{ip}` 查询地理位置。

### 12.5 前端展示

- **国旗组件**: `src/web/src/components/CountryFlag.tsx`，使用 `flag-icons` 库
- **仪表盘地区列**: 只显示国旗图标，居中对齐
- **服务器列表 IP 列**: 显示 `国旗 IPv4/IPv6` 格式
- **服务器详情**: 显示 `国旗 IPv4/IPv6` 格式

### 12.6 IP 展示逻辑

- 优先显示公网 IP（`publicIpv4`），如果没有则回退到连接 IP（`ip` 字段）
- 如果有 IPv6，显示格式为 `IPv4/IPv6`，IPv6 部分使用浅灰色

## 13. 服务器详情页数据隔离修复（2026-01-31）

### 13.1 问题描述

切换不同服务器详情页时，实时监控图表显示了其他服务器的数据。

### 13.2 根因分析

**后端 Bug**: `getMetrics` 函数中，当有时间范围参数 `since` 时，调用 `metricsQuery.where()` 覆盖了之前的 `vpsId` 过滤条件，导致查询只按时间过滤而没有按 VPS ID 过滤。

**前端缓存**: React Query 在切换 ID 时可能短暂显示旧缓存数据。

### 13.3 修复方案

**后端** (`src/server/src/services/vps.service.ts`):
```typescript
// 修复前（错误）
const metricsQuery = db.select().from(schema.metrics).where(eq(schema.metrics.vpsId, id));
const metrics = validSince ? metricsQuery.where(sql`...`) : metricsQuery; // where 覆盖了 vpsId

// 修复后（正确）
const whereCondition = validSince
  ? sql`${schema.metrics.vpsId} = ${id} AND ${schema.metrics.collectedAt} >= ${validSince}`
  : eq(schema.metrics.vpsId, id);
const metrics = db.select().from(schema.metrics).where(whereCondition)...
```

**前端** (`src/web/src/App.tsx`):
```typescript
// 添加包装组件，通过 key 强制重新挂载
function ServerDetailWrapper() {
  const { id } = useParams<{ id: string }>();
  return <ServerDetail key={id} />;
}
```

**前端** (`src/web/src/pages/ServerManagement/Detail.tsx`):
```typescript
// 添加缓存控制
useQuery({
  queryKey: ['vps', id, 'metrics', timeRange],
  // ...
  staleTime: 0,
  gcTime: 0, // 切换 ID 时立即清除缓存
});
```

## 14. 仪表盘全局资产总览计算修复（2026-01-31）

### 14.1 问题描述

月付服务器的费用没有正确折算为年度费用。

### 14.2 根因分析

原计算逻辑试图根据账单开始/结束日期计算当年实际重叠天数，但对于已过期或即将过期的服务器，重叠天数很小，导致年度费用计算不准确。

### 14.3 修复方案

简化计算逻辑，直接按周期折算年度费用：

```typescript
// 年费 = 单次费用 × (365 ÷ 周期天数)
const costForYear = (billing.amount * 365) / periodDays;
```

**示例**:
- 月付 1 USD → 年费 = 1 × (365 ÷ 30) ≈ 12.17 USD
- 两台月付 1 USD 服务器 → 年费 ≈ 24.33 USD

## 15. 仪表盘 UI 优化（2026-01-31）

- **地区列**: 只显示国旗图标，移除国家名称文字，居中对齐
- **系统列**: 只显示操作系统图标，移除系统名称文字，居中对齐
- **表头对齐**: 地区和系统列表头添加 `text-center` 与内容对齐
