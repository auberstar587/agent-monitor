# 2026-05-21 Cleanup Archive

本目录保存 Agent Monitor 多次变向过程中的历史产物。当前项目根目录保留需求与方案主线：

- `SPEC.md`
- `COLLABORATION-MODEL.md`
- `src/`
- `tests/`
- `web/` 当前 Multica/Next 路线源码

## docs-legacy

归档旧方向文档：早期 OpenClaw Gateway 拉取、CSS/SVG 会议室、旧 sprint/task/test 规划、旧 UX 审计等。它们保留历史价值，但不再代表当前方案。

## validation-scripts

归档一次性验证脚本。正式测试仍保留在项目根目录 `tests/`。

## code-legacy

归档旧静态前端 `frontend/`、旧 `public` 符号链接、`web.20260429.bak/` 备份目录，以及已经被当前协作模型替代的旧服务模块：

- `src-ui/`: 旧 SVG/DOM 头像和气泡渲染
- `src-services/`: 旧 AgentRegistry、MessageCapture、Redis 方案
- `tests/`: 旧 AgentRegistry 单测

## runtime-cache

归档浏览器/构建/系统缓存、旧运行态 JSON、测试导入数据和 `.DS_Store`。根目录验证截图已按要求删除，没有归档。

## design-assets

归档旧设计截图素材。它们是历史 mockup，不再作为当前实现依据。

## 恢复说明

如需恢复某个文件，直接从本归档目录移动回原路径即可。若恢复旧静态前端，还需要把 `public` 符号链接恢复为指向 `frontend`。
