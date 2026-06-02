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

- **定位**：本地 Agent 中心，统一收口多 Agent 工具的输出、协作和记忆
- **核心能力**：项目注册 + 关系图、Agent 输出归集、蓝图 DAG 引擎、共享记忆、多 Agent 协同
- **技术栈**：Fastify 5 + TypeScript（后端）、Vite + React 19 + Tailwind v4（前端）
- **存储**：PostgreSQL 17（独立数据库 `agent_monitor`）
- **前端风格 / 布局规范**：见 `MEMORY.md` 末尾"前端约定"小节（不在此重复，避免漂移）
- **当前进度**：v2 功能骨架已实施，类型检查通过，测试与端到端验收仍在收口

### 3.1 借鉴与方向（SPEC v2.3.0 锁定）

- **借鉴项目**：
  - Multica（基座：项目管理 / 12+ CLI daemon / Autopilots）
  - HiveWard（Blueprint 多 Agent 决策编排）
  - PilotDeck（白盒跨工具记忆 + Always-on 离线执行）
  - WeSight（EngineAdapter 协议 + Provider 路由 + 运行时 5 指标）
- **当前阶段目标**：**Phase 6 — 多引擎适配层**
  - 抽 `EngineAdapter` interface（5 方法：`detectInstalled` / `run` / `approve` / `cancel` / `cost`）
  - 落地 `claude-code.ts` 适配器 + `multica.ts` 改造
  - `providers.ts` 抽象层（OpenAI / Anthropic / Gemini / DeepSeek / Qwen / Moonshot / Ollama / 自定义 OpenAI 兼容）
  - ExecutionTrace 补齐 5 指标（TTFT / output-phase TPS / estimated model TPS / tool latency / agent steps）
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
| `MEMORY.md` | 项目长期记忆 + 前端 CSS 约定 |
| `COLLABORATION-MODEL.md` | 协作模型（角色 / 流程 / 决策机制） |
| `archive/20260529-old-requirements/` | 旧版需求 / 设计文档（不再维护） |
| `.workbuddy/memory/YYYY-MM-DD.md` | 每日工作日志（append-only） |
| `.workbuddy/memory/MEMORY.md` | 跨项目长期记忆（仅 Auber 视角） |

> **不重复原则**：CLAUDE.md 只放"协作合同 + 索引"，不重复 SPEC 的规格、不重复 MEMORY 的具体约定。重复会漂移。

## 8. 已知陷阱（持续追加）

- **sandbox 限制 kill**：dev server 旧 node 进程无法 kill（PID 50530 卡死案例），重启需换端口或绕过
- **端口冲突**：5173 Vite dev 默认（IPv6 only，本机需用 `[::1]:5173`）/ 5174 经常 502 / 3002 Fastify / 3001 Multica / 18789 OpenClaw / 18791
- **TypeScript 声明同步**：`lib/api.ts` 加新方法必须先声明，否则 UI 编译过不了（`Property 'xxx' does not exist`）
- **agent-browser 截图**：dev server 端口冲突时需用 `[::1]:5173` 访问，不要用 `localhost:5173`
- **Adapter 命名**：EngineAdapter 实现文件用 kebab-case（`claude-code.ts`），避免与 Claude Code CLI 名字冲突
- **CSS 渐变硬编码**：`packages/ui/src/index.css` 里的 `linear-gradient(...rgba(...))` 必须走 CSS 变量（`--bg-app` 等），否则浅色模式失效
