# Agent Monitor 开会展示系统 - 人形形象与动画设计方案

## 1. 四个 Agent 拟人形象设计

### 设计原则
- **简洁几何风**：用基础几何图形组合，易于 CSS/SVG 实现
- **一眼可辨认**：每个角色有独特的轮廓、配色、体态
- **AI 主题感**：头部可带光环/数据流/电路等元素
- **情绪可见**：通过颜色/姿态传达工作状态

---

### 🟢 canmou（监听者）
**角色定位**：监控型 Agent，实时感知环境

| 元素 | 描述 |
|------|------|
| 轮廓 | 圆形头部 + 三角身形（警觉姿态） |
| 头部 | 圆脸中央有一只"眼睛"（扫描雷达风格） |
| 配色 | 主色 `#00D9A5`（科技绿），深灰 `#1A1A2E` |
| 配饰 | 头顶环形天线 / 耳侧微型雷达波纹 |
| 特色 | 整体像一只"数据猫头鹰"，眼睛会旋转扫描 |

**SVG 简化结构**：
```
头部：circle（圆）
眼睛：circle + 旋转的弧线
身体：polygon（三角形）
天线：line + 圆点
```

---

### 🔵 creator（创作者）
**角色定位**：生成型 Agent，创意输出者

| 元素 | 描述 |
|------|------|
| 轮廓 | 方形头部 + 矩形身形（建筑师/画家感） |
| 头部 | 方形脸，眼睛是"灯泡"形状（灵感之眼） |
| 配色 | 主色 `#4A9EFF`（创造蓝），暖白 `#F5F5F5` |
| 配饰 | 手持画笔 / 头顶粒子光环 |
| 特色 | 像个穿西装的"创意精灵"，灯泡眼睛会闪烁发光 |

**SVG 简化结构**：
```
头部：rect（圆角方形）
眼睛：两个灯泡形状 path
身体：rect
手臂：line + 小圆（持笔）
光环：多个 floating circles
```

---

### 🟠 yunying（运营者）
**角色定位**：协调型 Agent，进度把控

| 元素 | 描述 |
|------|------|
| 轮廓 | 椭圆形头部 + 梯形身形（管理者/秘书感） |
| 头部 | 椭圆脸，表情是两个"仪表盘"眼睛 |
| 配色 | 主色 `#FF9F43`（活力橙），深灰 `#2D3436` |
| 配饰 | 领带/领结 + 手持平板/记事本 |
| 特色 | 像一个"数字管家"，随时在看数据面板 |

**SVG 简化结构**：
```
头部：ellipse（椭圆）
眼睛：两个小仪表盘 rect+needle
身体：path 画梯形
配饰：rect（记事本）
表情：简单弧线（微笑嘴角）
```

---

### 🟣 evolver（进化者）
**角色定位**：学习型 Agent，自我优化

| 元素 | 描述 |
|------|------|
| 轮廓 | 水滴形头部 + 流动身形（变形感） |
| 头部 | 上宽下窄的水滴形，头上有"进化光环"（多层圆环） |
| 配色 | 主色 `#A855F7`（进化紫），渐变 `#7C3AED → #A855F7` |
| 配饰 | 身体边缘有流动的"代码流"线条 |
| 特色 | 形态不固定，像在不断生长迭代，是最"有机"的一个 |

**SVG 简化结构**：
```
头部：path（水滴形 bezierCurve）
光环：多个同心圆环（粗细不一）
身体：path + 动画流动效果
代码流：dashed line + 动画位移
```

---

## 2. 动画方案设计

### 2.1 状态定义

| 状态 | 视觉含义 |
|------|----------|
| `idle` | 空闲/待命，基础呼吸动画 |
| `working` | 工作中，活跃动画 + 状态图标 |
| `speaking` | 发言中，嘴型动画 + 语音波 |
| `moving` | 移动中，平滑位移动画 |
| `in-meeting` | 会议室，特殊背景 + 就座姿态 |

### 2.2 各状态动画细节

#### 🟢 canmou（监听者）动画
| 状态 | 动画描述 | 实现方式 |
|------|----------|----------|
| idle | "眼睛"缓慢旋转扫描，周期 4s | CSS `rotate` + `animation` |
| working | 眼睛快速旋转，天线波纹扩散 | `animation-duration` 加快到 0.8s |
| speaking | 眼睛变为发射状波纹，嘴巴打开 | 切换 SVG 图形 + `scale` 动画 |
| moving | 整体左右摇摆，像猫头鹰转头 | `translateX` + `rotate` 组合 |

#### 🔵 creator（创作者）动画
| 状态 | 动画描述 | 实现方式 |
|------|----------|----------|
| idle | 灯泡眼睛微微闪烁，粒子光环浮动 | `opacity` 闪烁 + `translateY` 浮动 |
| working | 灯泡全亮，手持画笔快速挥舞 | 画笔 `rotate` 加速 + 光效增强 |
| speaking | 灯泡变成喇叭形状，光线向外射出 | SVG 图形切换 |
| moving | 像纸片人飘动，身体有"飘带"效果 | `transform` + 残影 `opacity` |

#### 🟠 yunying（运营者）动画
| 状态 | 动画描述 | 实现方式 |
|------|----------|----------|
| idle | 仪表盘眼睛指针缓慢摆动，微笑点头 | 指针 `rotate` + 嘴巴 `scale` |
| working | 仪表盘全速转动，手持平板屏幕闪烁 | 动画全部激活 |
| speaking | 手势动画（比划），平板屏幕显示文字 | 手 `rotate` + 文字 `marquee` |
| moving | 走路姿态，身体微微上下起伏 | `translateY` 起伏 + 腿部动画 |

#### 🟣 evolver（进化者）动画
| 状态 | 动画描述 | 实现方式 |
|------|----------|----------|
| idle | 身体轮廓轻微"呼吸"，代码流缓慢流淌 | `scale` 呼吸 + 流动线 `dashoffset` |
| working | 进化光环加速旋转，身体形态轻微抖动 | `animation` 全部加速 |
| speaking | 光环爆发成多层扩散波，身体轮廓变形 | SVG `filter` 变形 + 扩散动画 |
| moving | 流体式移动，身体像果冻一样 Q 弹变形 | `border-radius` 动态变化 |

### 2.3 场景切换动画

从**工位**切换到**会议室**场景：

```
1. 角色原地缩小 (scale 1 → 0.8, 300ms ease-out)
2. 背景渐变过渡 (filter: blur + brightness, 500ms)
3. 角色飘向新位置 (translate + scale 0.8 → 1, 400ms ease-in-out)
4. 会议室元素淡入 (opacity 0 → 1, 300ms, delay 400ms)
```

---

## 3. 技术实现方案

### 3.1 架构选型

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **纯 CSS + SVG** | 性能好、可缩放、易修改 | 复杂动画编写量大 | ⭐⭐⭐⭐⭐ |
| CSS Keyframes + JS 控制 | 动画可控性强 | 需要 JS 逻辑 | ⭐⭐⭐⭐ |
| Lottie（视频帧） | 动画细腻、设计师友好 | 包体积大、修改不灵活 | ⭐⭐⭐ |
| CSS + 少量 Canvas | 可处理复杂粒子效果 | 学习成本高 | ⭐⭐⭐ |

**推荐：纯 CSS + SVG**，原因：
1. 项目需要 4 个角色 × 5 种状态 = 20 组动画
2. 性能优先（会议室可能有多个 Agent 同屏）
3. 易于动态修改颜色/大小

### 3.2 目录结构建议

```
/projects/agent-monitor/
├── avatars/
│   ├── canmou.svg       # 静态 SVG 图形
│   ├── creator.svg
│   ├── yunying.svg
│   └── evolver.svg
├── css/
│   ├── avatar-base.css  # 基础样式（人形通用）
│   ├── animations.css    # 所有关键帧动画
│   └── states.css        # 各状态样式变体
├── js/
│   ├── avatar-controller.js  # 状态切换逻辑
│   └── scene-manager.js       # 场景管理
└── index.html            # 集成演示
```

### 3.3 CSS 动画性能优化

| 优化项 | 做法 |
|--------|------|
| 使用 `transform` | 位置/缩放用 `transform`，不用 `top/left` |
| 启用 GPU 加速 | 给动画元素加 `will-change: transform` |
| 避免重排 | 颜色/阴影动画用 `opacity` 或 `filter` |
| 合理帧率 | 复杂动画用 30fps（`animation-timing-function: steps()`），简单呼吸用 60fps |
| 懒加载 | 非可视区域的 Agent 暂停动画 |

### 3.4 状态切换 JS 逻辑

```javascript
class AvatarController {
  constructor(svgElement, agentType) {
    this.el = svgElement;
    this.agentType = agentType;
    this.currentState = 'idle';
  }

  setState(newState) {
    if (this.currentState === newState) return;
    
    // 移除旧状态 class
    this.el.classList.remove(`state-${this.currentState}`);
    // 添加新状态 class
    this.el.classList.add(`state-${newState}`);
    this.currentState = newState;
  }

  // 快捷方法
  speak() { this.setState('speaking'); }
  idle() { this.setState('idle'); }
  moveTo(x, y) {
    this.setState('moving');
    // CSS transition 处理移动
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }
}
```

### 3.5 场景切换 JS 逻辑

```javascript
class SceneManager {
  constructor() {
    this.currentScene = 'desk'; // 'desk' | 'meeting'
  }

  switchTo(sceneName) {
    if (this.currentScene === sceneName) return;

    const agents = document.querySelectorAll('.agent-avatar');
    
    // 1. 缩小所有 Agent
    agents.forEach(a => a.classList.add('shrinking'));

    // 2. 背景切换
    setTimeout(() => {
      document.body.classList.replace(
        `scene-${this.currentScene}`,
        `scene-${sceneName}`
      );
    }, 300);

    // 3. Agent 移动到新位置
    setTimeout(() => {
      agents.forEach(a => {
        a.classList.remove('shrinking');
        a.classList.add('positioning');
      });
    }, 500);

    this.currentScene = sceneName;
  }
}
```

---

## 4. 快速参考表

### 配色一览

| Agent | 主色 | 辅色 | 强调色 |
|-------|------|------|--------|
| canmou | `#00D9A5` | `#1A1A2E` | `#00FFB3` |
| creator | `#4A9EFF` | `#F5F5F5` | `#FFD700` |
| yunying | `#FF9F43` | `#2D3436` | `#FF6B6B` |
| evolver | `#A855F7` | `#7C3AED` | `#EC4899` |

### 动画时长建议

| 动画类型 | 时长 | 时序函数 |
|----------|------|----------|
| idle 呼吸 | 2-4s | `ease-in-out` |
| idle 闪烁 | 1-2s | `steps()` |
| speaking 嘴型 | 0.3-0.5s | `linear` |
| 场景切换 | 0.8-1.2s | `cubic-bezier(0.4, 0, 0.2, 1)` |
| 移动位移动画 | 0.5-1s | `ease-out` |

---

*文档版本：v1.0 | 更新日期：2026-03-26*
