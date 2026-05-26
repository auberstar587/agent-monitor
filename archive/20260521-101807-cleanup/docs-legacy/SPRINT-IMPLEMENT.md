# Sprint 1 实现计划

*基于 requirements-细化.md + ui-ux-细化.md + architecture-细化.md*

---

## 🎯 Sprint Goal
实现可运行的"开会直播"核心功能：角色移动 + 气泡展示

---

## Must Have 功能

### 1. 会议生命周期
- 会议发起 (`meeting:start`)
- 会议结束 (`meeting:end`)
- 参与者管理

### 2. 角色移动动画
- 工位模式：5角色横向分布
- 会议室模式：椭圆围坐布局
- 移动动画：1200ms 弹性缓动

### 3. 气泡消息展示
- 实时接收消息
- 气泡样式：白色背景 + 角色色边框
- 队列管理：最多显示50条

### 4. 状态机
- 9个状态：idle/working/meeting_invited/meeting_joining/meeting/meeting_speaking/meeting_presenting/away/disconnected
- 状态转换事件

### 5. WebSocket 消息接收
- Gateway WebSocket 连接
- 消息队列处理
- 重连机制

---

## 任务分配

| Task | 负责 | 输出 |
|------|------|------|
| 后端状态机 + WebSocket | yunying | src/meeting-state.js |
| 前端场景 + 动画 | creator | public/scene.js + CSS |
| 气泡组件 | creator | public/bubble.js (更新) |
| 集成 + 测试 | Tim | 集成调试 |

---

## 技术决策

- 前端：原生 HTML/CSS/JS（暂不用 React）
- 动画：CSS + requestAnimationFrame
- WebSocket：Socket.io
- 状态：内存（暂不用 Redis）

---

## 验收标准

- [ ] 发起会议后，角色移动到会议室
- [ ] 发送消息后，气泡显示
- [ ] 结束会议后，角色回到工位
- [ ] 前端无报错
