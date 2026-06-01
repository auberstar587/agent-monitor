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

---

## 3. 项目概要

- **定位**：本地 Agent 中心，统一收口多 Agent 工具的输出、协作和记忆
- **核心能力**：项目注册 + 关系图、Agent 输出归集、蓝图 DAG 引擎、共享记忆、多 Agent 协同
- **技术栈**：Fastify 5 + TypeScript（后端）、Vite + React 19 + Tailwind v4（前端）
- **存储**：PostgreSQL 17（独立数据库 `agent_monitor`）
- **前端风格**：暗色主题，HW layered paper + multica oklch 风格，中文界面
- **布局规范**：大页面嵌套小页面（workspace-shell > page-header + workspace-main > workspace-content）；`.workspace-content > div` 已设 `gap: 20px`，页面组件内顶层区块禁止 `mb-*`；标题由 Layout page-header 统一渲染(24px)，不出现在页面组件内；工具栏合并到 `.content-card`；表单用 2 列 grid
- **当前进度**：v2 功能骨架已实施，类型检查通过，测试与端到端验收仍在收口

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
- Adapter 模式接入不同 Agent 平台，核心服务不直接依赖外部 API
- 文档必须区分“已实施”和“已验证通过”，不要把功能骨架写成稳定完成态
