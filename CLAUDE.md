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

示例：

```markdown
| 2026-05-26 | 1.4.0 | Nox | 对比 HiveWard 架构，新增可借鉴方向分析 |
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

## 3. 协作原则

- 项目定位：个人 AI 工具驾驶舱，轻量优先
- 技术栈：Node.js + Fastify + Socket.io（后端），Vite + React + Tailwind CSS v4（前端）
- 存储：JSON 文件起步，后续可升级 SQLite
- 所有 P0 功能须有验收标准
