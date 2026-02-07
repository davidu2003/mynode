# Mynode - VPS 统一管理系统

<div align="center">

一个用于统一管理多台 VPS 服务器的现代化系统，支持通过 Web 控制面板对 100+ 台 VPS 进行批量管理、监控和运维操作。

</div>

---

## ✨ 核心特性

### 🖥️ 服务器管理
- **多服务器支持**：统一管理 100+ 台分布在不同厂商的 VPS
- **多系统兼容**：支持 Ubuntu、Debian、CentOS、Rocky、Alpine 等主流 Linux 发行版
- **灵活分组**：支持多级分组和标签管理，快速筛选定位服务器
- **费用管理**：多币种、多付费周期账单管理，年度费用自动统计
- **智能接入**：自动检测操作系统和架构，一键安装 Agent

### 📊 实时监控
- **系统监控**：CPU、内存、磁盘、网络流量实时监控
- **历史数据**：监控数据持久化存储，支持自定义保留策略
- **网络探测**：支持 TCP/ICMP Ping 监控，多目标下发
- **可视化面板**：基于 ECharts 的实时监控曲线，支持缩放和悬浮值显示
- **智能告警**：到期提醒、离线通知、阈值告警（规划中）

### ⚙️ 配置管理
- **统一配置**：网络（BBR）、时区、DNS、SSH 等系统配置统一管理
- **批量同步**：一键将配置同步到多台服务器
- **配置回滚**：支持回滚到上一个版本
- **单机编辑**：支持查看和编辑单台服务器的配置

### 🛠️ 运维操作
- **DD 重装**：支持 Debian/Ubuntu/CentOS/Rocky/Alpine 一键重装系统
- **软件管理**：自定义软件定义，支持批量安装/卸载、服务控制
- **远程执行**：支持单台或批量执行 Shell 命令
- **文件管理**：远程读取和更新配置文件

### 🔒 安全特性
- **加密通信**：Agent 与 Server 通过 WSS 加密通信
- **Token 认证**：Agent 基于 Token 认证，防止未授权访问
- **敏感信息加密**：SSH 凭证使用 AES-256-GCM 加密存储
- **登录保护**：5 次失败锁定 15 分钟，防暴力破解
- **审计日志**：所有关键操作记录审计日志

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    Control Panel                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   React     │  │  Node.js    │  │    SQLite       │  │
│  │ TypeScript  │──│  Fastify    │──│  better-sqlite3 │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────┘  │
└──────────────────────────┼──────────────────────────────┘
                           │ WebSocket (WSS)
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
    │   Go    │       │   Go    │       │   Go    │
    │  Agent  │       │  Agent  │       │  Agent  │
    └─────────┘       └─────────┘       └─────────┘
     VPS-1              VPS-2              VPS-N
```

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端框架** | React 19 + TypeScript | 使用 Vite 构建 |
| **UI 组件** | Shadcn UI (Radix UI + Tailwind CSS) | Headless UI，完全可定制 |
| **状态管理** | TanStack Query + Zustand | 服务端状态 + 本地状态 |
| **表单处理** | React Hook Form | 高性能非受控表单 |
| **图表** | ECharts 6 | 实时监控可视化 |
| **后端框架** | Fastify 5 + TypeScript | REST API + WebSocket |
| **数据库** | SQLite + Drizzle ORM | 轻量级嵌入式数据库 |
| **Agent** | Go 1.25 + gorilla/websocket | 轻量高效的监控代理 |
| **通信协议** | WebSocket + JSON | Agent 与 Server 双向通信 |

---

## 📁 项目结构

```
Mynode/
├── docs/                          # 📚 项目文档
│   ├── requirements.md            # 需求文档
│   ├── architecture.md            # 架构设计
│   ├── api.md                     # API 文档
│   └── database.md                # 数据库设计
├── src/
│   ├── agent/                     # 🤖 Go Agent
│   │   ├── main.go                # Agent 入口
│   │   ├── collector/             # 系统信息采集
│   │   ├── executor/              # 命令执行
│   │   └── ping/                  # 网络探测
│   ├── server/                    # 🚀 Node.js 后端
│   │   └── src/
│   │       ├── routes/            # 路由注册
│   │       ├── controllers/       # 请求处理、参数验证
│   │       ├── services/          # 业务逻辑
│   │       ├── middleware/        # 中间件（认证等）
│   │       ├── db/                # 数据库 Schema
│   │       └── websocket/         # WebSocket 处理
│   └── web/                       # 🎨 React 前端
│       └── src/
│           ├── components/        # UI 组件
│           │   ├── ui/            # Shadcn UI 组件
│           │   └── ...            # 业务组件
│           ├── pages/             # 页面模块
│           ├── stores/            # 全局状态
│           ├── api/               # API 封装
│           └── lib/               # 工具库
├── dist/                          # 📦 编译产物
└── CLAUDE.md                      # 🤖 AI 开发规范
```

---

## 🚀 快速开始

### 环境要求

- **Node.js**: >= 18.0.0
- **Go**: >= 1.25.0
- **pnpm**: >= 8.0.0

### 安装依赖

```bash
# 安装前端依赖
cd src/web
pnpm install

# 安装后端依赖
cd ../server
pnpm install

# 编译 Agent
cd ../agent
go build -o mynode-agent
```

### 启动服务

```bash
# 启动后端 (开发模式)
cd src/server
pnpm dev

# 启动前端 (开发模式)
cd src/web
pnpm dev

# Agent 在目标 VPS 上运行
./mynode-agent -server wss://your-server.com/ws/agent -token YOUR_TOKEN
```

### 生产构建

```bash
# 构建前端
cd src/web
pnpm build

# 构建后端
cd ../server
pnpm build

# 编译 Agent (多架构)
cd ../agent
GOOS=linux GOARCH=amd64 go build -o mynode-agent-linux-amd64
GOOS=linux GOARCH=arm64 go build -o mynode-agent-linux-arm64
```

---

## 🎯 核心功能模块

### 1. 账号与安全
- ✅ 初始化单管理员账号
- ✅ 登录/退出/登录状态校验
- ✅ 修改密码
- ✅ 登录失败锁定（5 次 / 15 分钟）
- ✅ JWT Cookie 会话

### 2. VPS 管理
- ✅ 添加/编辑/删除 VPS
- ✅ 支持密码和 SSH 密钥两种认证方式
- ✅ 自动检测操作系统类型和架构
- ✅ 自动安装 Agent
- ✅ 分组和标签管理
- ✅ 多币种费用管理
- ✅ IP 地理位置和国旗展示

### 3. 监控与可视化
- ✅ 实时监控（CPU、内存、磁盘、网络）
- ✅ 系统负载（1/5/15 分钟）
- ✅ 监控数据持久化
- ✅ 网络探测（TCP/ICMP Ping）
- ✅ ECharts 可视化曲线

### 4. 配置管理
- ✅ 网络配置（BBR、IPv6、DNS）
- ✅ 时区配置（Timedatectl）
- ✅ DNS 配置（Resolv.conf）
- ✅ 配置保存/同步/回滚
- ✅ 单机配置编辑

### 5. 软件管理
- ✅ 自定义软件定义
- ✅ 批量安装/卸载
- ✅ 服务状态查询与控制
- ✅ 配置文件读取/更新
- ✅ 一键安装基础软件（curl、wget、nftables 等）

### 6. DD 重装
- ✅ 支持多种系统版本
- ✅ 自定义 root 密码和 SSH 端口
- ✅ 实时输出重装日志
- ✅ 重装后自动重装 Agent

### 7. 通知系统
- ✅ 邮件通知配置
- ✅ Telegram 通知配置
- ✅ 通知测试功能

### 8. 系统管理
- ✅ 审计日志
- ✅ 系统设置
- ✅ 网络监控配置
- ✅ 数据清理接口

---

## 📖 开发规范

### 后端分层架构

1. **Route 层**：仅负责路由注册，调用 Controller
2. **Controller 层**：处理 HTTP 请求，参数验证，调用 Service
3. **Service 层**：核心业务逻辑，数据库操作
4. **Middleware 层**：通用中间件（认证、日志等）

### 代码风格

- Go 代码使用 `gofmt` 格式化
- TypeScript 代码使用 ESLint + Prettier
- 变量命名语义化，禁止无意义命名
- 函数保持简短，单个函数不超过 50 行
- 优先使用 TypeScript 类型，避免 `any`

### Git 提交规范

提交信息格式：`类型: 描述`

**类型**：
- `feat`: 新功能
- `fix`: 修复 Bug
- `refactor`: 重构
- `docs`: 文档更新
- `style`: 代码格式调整
- `test`: 测试相关
- `chore`: 构建/工具链相关

**示例**：
```bash
git commit -m "feat: 添加用户认证功能"
git commit -m "fix: 修复监控数据查询 bug"
```

### 安全规范

- ✅ 所有用户输入必须验证和转义
- ✅ SQL 查询使用 ORM，禁止拼接 SQL
- ✅ 密码使用 bcrypt 加密存储
- ✅ JWT Token 设置合理过期时间
- ✅ 敏感操作记录审计日志
- ❌ 禁止硬编码密码、API 密钥
- ❌ 禁止在日志中输出敏感信息

---

## 📚 文档

- [需求文档](./docs/requirements.md) - 详细的功能需求和开发阶段规划
- [架构设计](./docs/architecture.md) - 系统架构和技术选型
- [API 文档](./docs/api.md) - REST API 和 WebSocket 接口规范
- [数据库设计](./docs/database.md) - 数据库模型和 ER 图
- [项目规范](./CLAUDE.md) - 开发规范和 AI 协作指南

---

## 🎨 UI 设计

本项目采用现代化的 **Tailwind CSS + Headless UI** 架构：

- **深色模式优先**：使用 Zinc 色系打造冷峻、高对比度的黑金风格
- **紧凑布局**：高密度信息展示，Compact Progress 设计
- **品牌识别**：自动展示操作系统和国家/地区图标
- **响应式设计**：完美支持桌面和移动端

---

## 🛣️ 开发路线图

### ✅ Phase 1: 基础框架（已完成）
- 项目结构搭建
- Agent 基础框架（心跳、重连、采集）
- Server 基础框架（API、数据库）
- VPS 添加与 Agent 安装流程

### ✅ Phase 2: 核心功能（已完成）
- 服务器信息收集
- 命令执行
- 配置管理模块
- DD 重装

### ✅ Phase 3: 监控与告警（进行中）
- 实时监控数据采集
- 监控面板
- 告警规则配置与通知（规划中）

### 🚧 Phase 4: 扩展功能（规划中）
- Web 终端（xterm.js）
- 文件管理（上传/下载/编辑）
- 批量操作与任务队列
- 多用户权限模型

---

## 📊 性能指标

- **并发支持**：100+ 台 VPS 同时在线
- **心跳间隔**：默认 5 秒（可配置）
- **离线阈值**：默认 90 秒
- **响应时间**：< 500ms（内网/常规负载）
- **数据保留**：监控数据支持按天清理

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

在提交代码前，请确保：
1. 代码通过 ESLint 和 gofmt 检查
2. 添加必要的注释和文档
3. 遵循项目的代码风格和架构规范
4. 测试通过（如有）

---

## 📄 许可证

本项目仅供个人学习和研究使用。

---

## 📧 联系方式

如有问题或建议，欢迎通过 Issue 联系。

---

<div align="center">

**⭐ 如果这个项目对你有帮助，欢迎 Star ⭐**

</div>
