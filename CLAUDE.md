# CLAUDE.md — 项目协作规则

> 本文件记录项目的协作规范，所有参与者须遵守。

---

## 1. 文档更新记录规则

**每次更新项目文档后，必须在更新记录中注明作者。**

格式：

```markdown
| 日期 | 版本 | 作者 | 变更 |
|------|------|------|------|
```

适用范围：
- `SPEC.md` — 项目规范
- `COLLABORATION-MODEL.md` — 协作模型
- `docs/PRODUCT-REQUIREMENTS.md` — 需求文档
- `docs/DESIGN.md` — 设计文档
- 其他 `.md` 文档（按需补充）

**作者名规范**：
- Claude → `Claude`
- Codex → `Codex`
- Nox → `Nox`
- 用户本人 → `Auber`

**禁止事项**：
- 不允许使用 `hanyongfeng@sinosoft.com.cn` 邮箱
- 不在公开场合暴露内部邮箱

---

## 2. Git 提交规范

- 提交信息使用中文，简洁描述变更内容
- 涉及文档更新时，commit message 应注明
- 推荐使用 Conventional Commits 类型前缀：
  - `feat:` 新功能（如新增 EngineAdapter 适配）
  - `fix:` 修复 bug
  - `docs:` 文档更新（SPEC / MEMORY / CLAUDE）
  - `refactor:` 重构（不改行为）
  - `test:` 测试相关
  - `chore:` 杂项（依赖、配置）

---

## 3. 项目概要

- **定位**：本地 AI 工作流运行控制层，统一收口代码逻辑、Agent 决策处理、Prompt/Skill 工程
- **核心能力**：项目注册 + 关系图、Intent Router（Service + Router Agent）、DecisionRequest、ProjectSkill/PromptPack、Agent 输出归集、ExecutionTrace、共享记忆、多 Agent 协同
- **技术栈**：Fastify 5 + TypeScript（后端）、Vite + React 19 + Tailwind v4（前端）
- **存储**：PostgreSQL 17（独立数据库 `agent_monitor`）
- **前端风格 / 布局规范**：见 `MEMORY.md` 末尾"前端约定"小节（不在此重复，避免漂移）
- **当前进度**：多引擎适配、原生 session resume、快捷任务执行 guard 已验证；前端整改 Phase 1-8 已完成（Phase 7 Blueprint 暂缓）
- **下一阶段**：IntentRouterService + Router Agent + DecisionRequest + ProjectSkill/PromptPack

### 3.1 借鉴与方向（SPEC v2.4.2 锁定）

- **借鉴项目**：
  - Multica（基座：项目管理 / 12+ CLI daemon / Autopilots）
  - HiveWard（Blueprint 多 Agent 决策编排）
  - PilotDeck（白盒跨工具记忆 + Always-on 离线执行）
  - WeSight（EngineAdapter 协议 + Provider 路由 + 运行时 5 指标）
- **当前阶段目标**：**Agent 工作流运行控制层**
  - ✅ 抽 `EngineAdapter` interface（5 方法：`detectInstalled` / `run` / `approve` / `cancel` / `cost`）
  - ✅ 落地 `claude-code.ts` / `codex.ts` / `hermes.ts` / `reasonix.ts` 适配器 + `multica.ts` 改造
  - ✅ `providers.ts` 抽象层（8 个 Provider：Anthropic / OpenAI / DeepSeek / Ollama / Gemini / Qwen / Moonshot / 自定义 OpenAI 兼容）
  - ✅ ExecutionTrace 补齐 5 指标（TTFT / output-phase TPS / estimated model TPS / tool latency / agent steps）
  - ✅ 原生 session resume：Claude Code session_id / Codex thread_id 可跨任务续跑
  - ✅ 执行型任务 guard：无工具活动或可审查产物时不得标记 completed
  - 🟡 待实现 Intent Router：代码侧 IntentRouterService 负责状态/安全/校验，Router Agent 负责自然语言语义判断
  - 🟡 Router Agent engine 必须可配置：`workflow.router_engine_id` / `AGENT_MONITOR_ROUTER_ENGINE`，不能写死 Claude Code
  - 🟡 待实现 DecisionRequest：执行中需要用户选 A/B 时进入 waiting_user，用户响应后用 native session resume
  - 🟡 待实现 ProjectSkill/PromptPack：项目级 prompt、checklist、workflow、policy 注入 Agent 执行上下文
  - ✅ server 72 测试全绿
- **暂缓**：飞书 IM 网关 / SkillHub 市场 / Studio 视图 / Redux slice 切分
- **保持基座**：Multica 不变（局部移植 WeSight 协议，不切基座）

---

## 4. 开发命令

```bash
# 启动后端 + 前端
pnpm dev

# 单独启动
pnpm dev:server    # Fastify on http://127.0.0.1:3002
pnpm dev:ui        # Vite on http://localhost:5173

# 构建
pnpm build

# 类型检查
pnpm typecheck

# 测试
pnpm test
```

---

## 5. 配置

配置文件位于 `~/.agent-monitor/config.yaml`，首次启动自动生成。

---

## 6. 协作原则

- 所有 P0 功能须有验收标准
- 本地优先，不依赖外部云服务
- Adapter 模式接入不同 Agent 平台（`EngineAdapter` 协议：5 方法），核心服务不直接依赖外部 API
- 文档必须区分“已实施”和“已验证通过”，不要把功能骨架写成稳定完成态
- 不倒车造轮子：能用基座（Multica / HiveWard / PilotDeck / WeSight）的用基座，精力花在差异化

## 7. 文档索引

| 文档 | 职责 |
|------|------|
| `SPEC.md` | 项目规范（定位 / 技术战略 / 借鉴 / 信息架构 / 核心对象 / 功能需求 / 开发阶段 / 更新记录） |
| `docs/GRAPHIFY-WORKFLOW.md` | Graphify 项目图谱更新规则（干净副本、噪音排除、update/extract 节奏、交接使用方式） |
| `MEMORY.md` | 项目长期记忆 + 前端 CSS 约定 |
| `COLLABORATION-MODEL.md` | 协作模型（角色 / 流程 / 决策机制） |
| `docs/AGENT-SYSTEM-REDESIGN.md` | Agent 系统重构设计（Runtime→Agent→Presence 模型，借鉴 Multica） |
| `docs/DATABASE-SCHEMA.md` | 数据库 Schema 参考（14 张表） |
| `docs/PHASE-8-MODULE-POLISH.md` | Phase 8 核心工作流 + 模块补齐（22/23 完成） |
| `docs/DEVELOPMENT-WORKFLOW.md` | 中大型需求工作流规范 |
| `docs/MULTICA-INTEGRATION.md` | Multica HTTP/WS 协议参考 |
| `docs/TASK-CORE-MGMT.md` | 项目/Agent/任务管理优化方案 |
| `.workbuddy/memory/YYYY-MM-DD.md` | 每日工作日志（append-only） |
| `.workbuddy/memory/MEMORY.md` | 跨项目长期记忆（仅 Auber 视角） |

> **不重复原则**：CLAUDE.md 只放"协作合同 + 索引"，不重复 SPEC 的规格、不重复 MEMORY 的具体约定。重复会漂移。

## 8. Graphify 项目图谱

项目分析、交接、跨模块依赖判断前，优先参考 Graphify 项目图谱工作流：

- 规则：`docs/GRAPHIFY-WORKFLOW.md`
- 更新脚本：`scripts/update-graphify.sh`
- 默认输出：`/private/tmp/agent-monitor-graphify/raw/graphify-out/`
- 交接首读：`/private/tmp/agent-monitor-graphify/raw/graphify-out/GRAPH_REPORT.md`

常规代码变化后运行：

```bash
GRAPHIFY_MODE=update scripts/update-graphify.sh
```

文档、`SPEC.md`、架构或模块边界变化后运行：

```bash
GEMINI_API_KEY=... GRAPHIFY_MODE=extract scripts/update-graphify.sh
```

不要提交 Graphify 输出或 API key，除非用户明确要求。

## 9. 已知陷阱（持续追加）

- **sandbox 限制 kill**：dev server 旧 node 进程无法 kill（PID 50530 卡死案例），重启需换端口或绕过
- **端口冲突**：5173 Vite dev 默认（IPv6 only，本机需用 `[::1]:5173`）/ 5174 经常 502 / 3002 Fastify / 3001 Multica / 18789 OpenClaw / 18791
- **TypeScript 声明同步**：`lib/api.ts` 加新方法必须先声明，否则 UI 编译过不了（`Property 'xxx' does not exist`）
- **agent-browser 截图**：dev server 端口冲突时需用 `[::1]:5173` 访问，不要用 `localhost:5173`
- **Adapter 命名**：EngineAdapter 实现文件用 kebab-case（`claude-code.ts`），避免与 Claude Code CLI 名字冲突
- **CSS 渐变硬编码**：`packages/ui/src/index.css` 里的 `linear-gradient(...rgba(...))` 必须走 CSS 变量（`--bg-app` 等），否则浅色模式失效
