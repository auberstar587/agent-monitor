# Agent Monitor v2

> 本地 AI Agent 统一管理平台 — 项目注册、输出归集、蓝图编排、共享记忆、任务管理

---

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动全部服务（后端 + 前端）
pnpm dev

# 单独启动
pnpm dev:server    # Fastify 后端 → http://127.0.0.1:3002
pnpm dev:ui        # Vite 前端   → http://localhost:5173
```

### 前置条件

- **PostgreSQL 17** — 数据库 `agent_monitor`
- **Node.js** ≥ 20（推荐 22+）
- **pnpm** ≥ 10

```bash
# 创建数据库
createdb agent_monitor
# 首次启动后端时会自动执行所有迁移（001-004）
```

---

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Fastify 5 + TypeScript |
| 数据库 | PostgreSQL 17（独立 `agent_monitor`） |
| 前端 | Vite 6 + React 19 + Tailwind CSS v4 |
| 状态管理 | Zustand |
| 实时通信 | WebSocket（ws 库） |
| 包管理 | pnpm workspaces |

---

## 架构总览

```
agent-monitor/
├── packages/
│   ├── server/                # 后端 (port 3002)
│   │   ├── src/
│   │   │   ├── adapters/      # Agent 平台适配器（mock / multica）
│   │   │   ├── db/            # 数据库连接 + 迁移（001-004）
│   │   │   ├── routes/        # API 路由（10 个文件）
│   │   │   ├── services/      # 业务逻辑层
│   │   │   └── index.ts       # Fastify 入口
│   │   └── tests/             # 测试
│   └── ui/                    # 前端 (port 5173)
│       └── src/
│           ├── pages/         # 12 个页面
│           ├── components/    # 可复用组件
│           ├── lib/           # API 客户端
│           ├── stores/        # Zustand 状态
│           └── index.css      # 设计系统（CSS 变量 + 组件类）
├── docs/                      # 项目文档
└── archive/                   # 归档的旧版本
```

### 后端 → 前端数据流

```
Adapter（mock/multica）
   ↓
Services → SQLite(替代: PostgreSQL DB)
   ↓
Routes (Fastify API)
   ↓ HTTP
Vite Dev Server → React 前端
```

---

## 核心功能

| 功能 | 说明 | 页面 |
|------|------|------|
| **项目管理** | 注册本地项目，检测技术栈，关系图 | `/projects` |
| **Agent 管理** | 多平台 Agent 注册 + 质量追踪 | `/agents` |
| **输出归集** | 跨 Agent 输出时间线 | `/outputs` |
| **共享记忆** | 跨项目知识库 + Dream 自动合并 | `/memory` |
| **收件箱** | 待处理事项统一入口 | `/inbox` |
| **蓝图编排** | DAG 多 Agent 工作流编辑器 | `/blueprints` |
| **任务管理** | 任务 CRUD + 状态流转 | `/tasks` |
| **总览** | 全局状态仪表盘 | `/` |

---

## 关键命令

```bash
pnpm dev          # 启动全部
pnpm typecheck    # TypeScript 类型检查
pnpm build        # 构建
pnpm test         # 运行测试
pnpm dev:server   # 仅后端
pnpm dev:ui       # 仅前端
```

---

## API 概览

### 项目管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | 注册项目 |
| GET | `/api/projects/:id` | 项目详情 |
| PUT | `/api/projects/:id` | 编辑项目 |
| DELETE | `/api/projects/:id` | 删除项目 |
| GET | `/api/projects/:id/relations` | 项目关系 |
| GET | `/api/projects/:id/context` | 项目上下文（记忆注入） |

### Agent 管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents` | Agent 列表 |
| GET | `/api/agents/:id` | Agent 详情 + 轨迹 |
| PUT | `/api/agents/:id` | 编辑 Agent |
| POST | `/api/agents/sync` | 从 Adapter 同步 |

### 任务管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks` | 任务列表（支持筛选） |
| POST | `/api/tasks` | 创建任务 |
| GET | `/api/tasks/:id` | 任务详情 |
| PUT | `/api/tasks/:id` | 编辑任务 |
| POST | `/api/tasks/:id/transition` | 状态流转 |
| DELETE | `/api/tasks/:id` | 删除任务 |

### 输出 / 记忆 / 执行轨迹
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/outputs` | Agent 输出列表 |
| GET | `/api/memory` | 记忆列表 |
| POST | `/api/memory` | 创建记忆 |
| POST | `/api/memory/dream` | Dream 自动合并 |
| GET | `/api/traces` | 执行轨迹列表 |
| GET | `/api/traces/:taskId` | 轨迹详情 + 工具调用 |

### 蓝图 / 调度 / 决策
| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/blueprints` | 蓝图 CRUD |
| POST | `/api/blueprints/:id/run` | 运行蓝图 |
| GET/POST | `/api/meetings` | 会议管理 |
| GET/POST/DELETE | `/api/scheduler` | 定时调度 |
| POST | `/api/decisions/assess-risk` | 风险评估 |

### 收件箱
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/inbox` | 待处理列表 |
| POST | `/api/inbox/:id/resolve` | 标记已处理 |

---

## 数据库

PostgreSQL 17，独立数据库 `agent_monitor`。

迁移文件：`packages/server/src/db/migrations/`

| 迁移 | 内容 |
|:----:|------|
| `001_initial.sql` | 核心表：local_projects, agent_outputs, shared_memory, execution_traces, inbox_items, blueprints 系列, context_packs |
| `002_blueprint_enhancements.sql` | 蓝图表增强 + meetings/meeting_messages |
| `003_agents.sql` | registered_agents + quality JSONB |
| `004_tasks.sql` | tasks 表 + 状态机 |

---

## 设计规范

- **暗色主题** — `#0f1117` 底色，HW layered paper 风格
- **强调色** — 青色 `#22d3ee` / 紫色 `#a78bfa`
- **状态色** — 成功 `#34d399` / 警告 `#fbbf24` / 危险 `#fb7185` / 信息 `#60a5fa`
- **CSS 组件类** — `.content-card` / `.list-row` / `.status-pill` / `.button` / `.empty-state`
- **UI 框架** — Tailwind v4 + lucide-react 图标，中文界面

---

## 文档索引

| 文档 | 内容 |
|------|------|
| `SPEC.md` | 项目规范 v2.1.0（需求 + 架构 + 核心对象） |
| `CLAUDE.md` | 协作规则、Git 规范、开发命令 |
| `COLLABORATION-MODEL.md` | 多 Agent 协作模型 |
| `docs/DESIGN.md` | 设计文档（架构图 + 组件设计 + 数据流） |
| `docs/PRODUCT-REQUIREMENTS.md` | 产品需求文档 |
| `docs/DATABASE-SCHEMA.md` | 数据库 Schema 完整参考 |
| `docs/CURRENT-STATUS.md` | 当前项目状态分析 |
| `docs/QA-REPORT.md` | QA 测试报告 + 修复清单 |
| `docs/TASK-CORE-MGMT.md` | 项目管理/Agent/任务优化方案 |
| `docs/MULTICA-INTEGRATION.md` | Multica 集成参考 |

---

## 配置

配置文件 `~/.agent-monitor/config.yaml`，首次启动自动生成。

```yaml
adapter: mock                    # 数据源: mock | multica
server:
  port: 3002
  host: 127.0.0.1
adapters:
  multica:
    enabled: false
    api_url: http://localhost:8080
    api_key: ""
```

---

## 项目状态

Phase 1-5 已全部完成。详见 `SPEC.md#8-开发阶段`。

```
Phase 1: 项目脚手架 + MockAdapter + Agent View          ✅
Phase 2: 蓝图 DAG 引擎 + 编辑器 + 多 Agent 会议          ✅
Phase 3: 记忆 Dream Mode + 跨项目上下文注入               ✅
Phase 4: 定时调度器 + 风险评估                             ✅
Phase 5: 前端深度打磨 + 通铺                               ✅
```
