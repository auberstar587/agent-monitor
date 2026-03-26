# Agent Monitor + 开会展示系统

> ⚠️ **注意**: 此项目与 [ClawPort](https://github.com/JohnRiceML/clawport-ui) 目标相似。ClawPort 是专门为 OpenClaw Agent 团队设计的开源 Dashboard，包含组织架构图、实时聊天、任务看板、定时任务监控等功能。建议先了解 ClawPort 再决定是否继续自研。

## 项目目标
1. 监控 OpenClaw Agent 状态
2. "开会"展示功能 - 形象展现团队讨论过程

## 与 ClawPort 的关系

**ClawPort** 是 OpenClaw 官方生态的开源产品，提供：
- Visual org map（组织架构图）
- Agent chat（实时聊天）
- Kanban board（任务看板）
- Cron pipeline monitor（定时任务监控）
- Cost dashboard（成本面板）
- Activity console with live log streaming（实时日志）
- Memory browser（记忆浏览器）

**本项目的差异化**：
- 专注开会过程可视化
- 拟人形象 + 气泡对话展示
- 场景动画（工位 ↔ 会议室）

## 系统架构

```
┌─────────────────────────────────────────┐
│           前端展示层 (Web)               │
│  - Agent状态面板                        │
│  - 开会过程可视化（时间线/消息流）       │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│           后端服务层                    │
│  - Agent状态收集器（动态发现）           │
│  - 会议记录器                           │
│  - WebSocket实时推送                    │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│           OpenClaw Gateway API          │
│  - sessions_list (动态发现Agent)         │
│  - sessions_history                     │
│  - Gateway WebSocket                     │
└─────────────────────────────────────────┘
```

## 动态 Agent 发现

Agent 列表通过三级降级策略获取：

1. **OpenClaw Gateway API** - 从 `sessions_list` 自动发现
2. **配置文件** - 从 `agents.json` 读取
3. **默认列表** - 内置的 4 个默认 Agent

### 配置文件格式

```json
{
  "agents": {
    "canmou": {
      "name": "canmou",
      "role": "参谋",
      "color": "#3fb950"
    }
  }
}
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML/CSS/JS + Socket.io Client |
| 后端 | Node.js + Fastify + Socket.io |
| 状态 | Redis + Pub/Sub（可选） |
| 数据 | SQLite（Prisma） |
| 端口 | 3001（默认） |

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 访问
open http://localhost:3001
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3001 | 服务端口 |
| OPENCLAW_GATEWAY_HOST | localhost | Gateway 主机 |
| OPENCLAW_GATEWAY_PORT | 18789 | Gateway 端口 |
| AGENTS_CONFIG | ./agents.json | Agent 配置文件 |
| REDIS_HOST | localhost | Redis 主机 |
| REDIS_PORT | 6379 | Redis 端口 |

## API 端点

- `GET /api/health` - 健康检查
- `GET /api/agents` - 获取所有 Agent 状态
- `GET /api/agents/:id` - 获取单个 Agent 状态
- `GET /api/messages` - 获取最近消息
- `GET /api/stats` - 系统统计

## WebSocket 事件

### 客户端 → 服务端
- `meeting:start` - 开始开会
- `meeting:end` - 结束开会
- `agent:status` - 更新 Agent 状态
- `agent:heartbeat` - 刷新心跳

### 服务端 → 客户端
- `state:init` - 初始化状态
- `state:update` - 状态更新
- `message:new` - 新消息
- `gateway:connected` - Gateway 连接

## Git 分支

```
master - 稳定版本
feature/avatar - 角色SVG
feature/bubble - 气泡UI
feature/backend - 后端服务
```

## 参考

- [ClawPort](https://github.com/JohnRiceML/clawport-ui) - OpenClaw Agent 命令中心
- [OpenClaw Docs](https://docs.openclaw.ai)
