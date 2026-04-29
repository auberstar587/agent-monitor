# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent Monitor - AI Agent 状态管理与任务调度平台。Agent 通过 HTTP API 主动接入推送消息和状态，前端实时可视化。支持跨平台 Agent（OpenClaw、Hermes、Claude Code 等）。

**核心功能**：Agent 状态监控、任务队列（自动派发/重试）、项目管理（端口分配）、会议状态机、实时推送。

## Commands

```bash
# 后端
npm install             # 安装依赖
npm start               # 启动生产服务 (node src/index.js, 端口 3001)
npm run dev             # 开发模式 (--watch 热重载)

# 前端 (Next.js)
cd web && pnpm dev      # 启动前端开发服务器 (端口 3000)
cd web && pnpm build    # 构建前端

# 测试 (Node.js 内置 test runner)
node --test tests/unit/agent-registry.test.js          # 单个单元测试
node --test tests/unit/*.test.js                        # 所有单元测试
node --test tests/integration/api.test.js               # 集成测试 (需先 npm start)
```

## Architecture

```
Agent ──(hook)──→ POST /api/chat/status
       ──(skill)─→ POST /api/chat/message
       ──(task)──→ POST /api/tasks/claim|start|complete|fail
                     │
                     ├──→ ChatRoom ──→ Socket.io ──→ Next.js Frontend
                     ├──→ TaskQueue (自动派发)
                     ├──→ ProjectManager (项目+端口管理)
                     └──→ MeetingStateMachine
```

两个前端入口：
- **`http://localhost:3000`** — Next.js 16 前端（主界面，shadcn/ui + TanStack Query + Socket.io）
- **`http://localhost:3001`** — 后端 API + 旧版 HTML 前端（`public/` 目录）

## Key Modules

### Backend (`src/`)

- **`src/index.js`** — 入口。初始化 Fastify、Socket.io、ChatRoom、MeetingStateMachine、TaskQueue、ProjectManager、MessageRouter。所有事件桥接到 Socket.io。
- **`src/services/chat-room.js`** — 聊天室核心。Agent 接入/状态/消息管理。EventEmitter，心跳超时 60s，自动颜色分配。
- **`src/services/task-queue.js`** — **任务队列核心**。任务生命周期：queued → dispatched → running → completed/failed。Agent idle 时自动派发，失败自动重试（maxAttempts），并发控制（maxConcurrentTasks），JSON 文件持久化。
- **`src/services/project-manager.js`** — 项目 CRUD + 目录扫描导入。支持 `port` 字段（端口号分配）。JSON 文件持久化。
- **`src/meeting-state.js`** — 会议状态机。start/end 事件，批量更新 Agent 状态。
- **`src/services/message-router.js`** — 双向消息路由，支持 OpenClaw/Hermes 适配器。

### Task API Endpoints

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/tasks` | GET | 任务列表（支持 agentId/status 过滤） |
| `/api/tasks/stats` | GET | 任务统计 |
| `/api/tasks` | POST | 创建任务 |
| `/api/tasks/claim` | POST | Agent 认领任务（pull 模式） |
| `/api/tasks/:id` | GET | 任务详情 |
| `/api/tasks/:id/start` | POST | Agent 开始执行 |
| `/api/tasks/:id/progress` | POST | Agent 上报进度 |
| `/api/tasks/:id/complete` | POST | Agent 完成任务 |
| `/api/tasks/:id/fail` | POST | Agent 任务失败 |
| `/api/tasks/:id` | DELETE | 取消任务 |

### Chat API Endpoints

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/chat/join` | POST | Agent 加入 |
| `/api/chat/leave` | POST | Agent 离开 |
| `/api/chat/status` | POST | Agent 状态更新 |
| `/api/chat/message` | POST | Agent 发言 |
| `/api/chat/agents` | GET | 在线 Agent 列表 |
| `/api/chat/messages` | GET | 最近消息 |

### System API Endpoints

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/system/stats` | GET | CPU/内存/磁盘 |
| `/api/system/ports` | GET | 端口扫描 + 冲突检测 |
| `/api/config/agents` | GET | OpenClaw Agent 配置 |

### Frontend (`web/`)

Next.js 16 + Tailwind CSS 4 + shadcn/ui + TanStack Query + Socket.io。

**页面路由：**
- `/` — 概览仪表盘（Agent 状态 + 任务 + 系统资源）
- `/agents` — Agent 列表（卡片 + 筛选 + 搜索）
- `/tasks` — 任务管理（看板 5 列 + 列表 + 创建弹窗）
- `/projects` — 项目管理（表格 + 端口内联编辑 + 创建弹窗）
- `/system` — 系统监控（CPU/内存/磁盘 + 端口总览 + 冲突检测）
- `/meeting` — 会议室（待实现）
- `/settings` — 设置（待实现）

**核心文件：**
- `web/src/lib/api.ts` — API 客户端，对接后端所有端点
- `web/src/lib/queries.ts` — TanStack Query options + mutations
- `web/src/lib/socket.ts` — Socket.io 实时事件 → Query 刷新
- `web/src/lib/types.ts` — TypeScript 类型定义
- `web/src/components/sidebar.tsx` — 侧边栏导航
- `web/src/components/providers.tsx` — QueryClient + Socket.io Provider

**环境变量**（`web/.env.local`）：
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Legacy Frontend (`public/`)

旧版 HTML 前端仍可通过 `http://localhost:3001` 访问：
- 像素风会议室（`/pixel/meeting.html`，Phaser 3）
- 聊天室主页面（`/index.html`）

## Important Patterns

- **ESM**: `"type": "module"`，所有 import 用 `.js` 扩展名
- **任务调度**: Agent idle 时自动派发排队任务。Push（WebSocket 通知）+ Pull（`/api/tasks/claim`）
- **前端双架构**: Next.js (3000) 为新主界面，旧 HTML (3001) 保留兼容
- **颜色一致性**: 前后端同 hash 算法（`COLOR_PALETTE[Math.abs(hash) % 10]`）
- **Agent 状态**: idle | working | meeting | away | speaking。心跳 60s 超时标记 away
- **暗色主题**: HTML 根元素加 `dark` class，使用 shadcn CSS 变量（`text-foreground`/`text-muted-foreground`/`bg-card` 等）

## Environment Variables

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3001 | 后端服务端口 |
| `NEXT_PUBLIC_API_URL` | — | 前端 API 地址（必须配置） |

## Design Documents

- `SPEC.md` — 项目规范
- `TEST.md` — 测试计划
- `ARCHITECTURE.md` — 架构设计
- `SPRINT.md` / `TASKS.md` — Sprint 规划
- `design/` — 设计文档目录
