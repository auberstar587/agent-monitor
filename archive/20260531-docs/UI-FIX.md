# Agent Monitor v2 — 前端样式调整清单

> ⚠️ 已完成 — 本文档中的样式调整已在 Phase 2 中由 Claude 实施完毕
> 保留文档仅供参考，不需要再执行
> 日期: 2026-05-31 | 完成日期: 2026-05-31

---

## 参照标准

- **multica**: `oklch` 色彩空间、`ring-1 ring-foreground/10` 卡片边框、Inter 字体、圆角 10px、status badge 用 `bg-info/5` 半透明底色
- **HiveWard**: 暗色模式 `#090b0f` 底色、amber 强调色、`box-shadow` 层次感、按钮 hover `translateY(-1px)` 微动效、status pill 28px 高度

---

## 需要修改的文件

```
packages/ui/src/index.css              — 全局样式变量
packages/ui/src/components/Layout.tsx   — 侧边栏
packages/ui/src/pages/Dashboard.tsx     — 仪表盘
packages/ui/src/pages/Projects.tsx      — 项目页
packages/ui/src/pages/Agents.tsx        — Agent 页
packages/ui/src/pages/Outputs.tsx       — 输出时间线
packages/ui/src/pages/Memory.tsx        — 记忆页
packages/ui/src/pages/Inbox.tsx         — 收件箱
```

---

## 1. 全局样式 (`index.css`)

### 1.1 色彩系统 — 改用 oklch

当前用 hex，对比度不好控制。改为 multica 风格的 oklch：

```css
:root {
  /* 背景层次 — 三级灰度（HW 风格 paper 分层） */
  --bg-primary:   oklch(0.11 0.01 260);    /* 最深底色 */
  --bg-secondary: oklch(0.14 0.01 260);    /* 侧边栏 */
  --bg-card:      oklch(0.17 0.01 260);    /* 卡片背景 */
  --bg-hover:     oklch(0.22 0.01 260);    /* 悬停态 */
  --bg-raised:    oklch(0.20 0.01 260);    /* 弹出层/tooltip */

  /* 边框 — 要比背景明显区分 */
  --border:        oklch(0.25 0.01 260);
  --border-bright: oklch(0.35 0.01 260);

  /* 文字 — 保证 WCAG AA 对比度 */
  --text-primary:   oklch(0.95 0 0);       /* 主文字 */
  --text-secondary: oklch(0.72 0.015 260); /* 次要文字 */
  --text-muted:     oklch(0.55 0.015 260); /* 辅助文字 */

  /* 强调色 */
  --accent-cyan:    oklch(0.72 0.14 220);
  --accent-violet:  oklch(0.68 0.16 300);
  --accent-amber:   oklch(0.78 0.16 75);
  --accent-emerald: oklch(0.65 0.18 155);
  --accent-rose:    oklch(0.65 0.2 15);

  /* 圆角 — multica 用 10px 基准 */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 14px;
  --radius-pill: 9999px;

  /* 阴影 — HW 风格多层次 */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.25);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.3);
}
```

### 1.2 卡片通用样式

当前卡片边框太淡几乎看不见。改为 multica 的 `ring` 风格 + HW 的阴影：

```css
/* 卡片基础样式 */
.card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.card:hover {
  border-color: var(--border-bright);
  box-shadow: var(--shadow-md);
}
```

### 1.3 按钮样式增强

```css
/* 主按钮 */
.btn-primary {
  background: var(--accent-cyan);
  color: oklch(0.15 0.01 260);
  font-weight: 500;
  border-radius: var(--radius-md);
  padding: 6px 14px;
  font-size: 13px;
  transition: all 0.15s;
}
.btn-primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);  /* HW 微动效 */
  box-shadow: 0 4px 12px rgba(34,211,238,0.2);
}

/* 次要按钮 */
.btn-secondary {
  background: var(--bg-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 6px 14px;
  font-size: 13px;
  transition: all 0.15s;
}
.btn-secondary:hover {
  background: var(--border);
  color: var(--text-primary);
  transform: translateY(-1px);
}
```

### 1.4 Status pill 样式 (HW 风格)

```css
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.status-online  { background: rgba(34,211,153,0.12); color: var(--accent-emerald); }
.status-busy    { background: rgba(251,191,36,0.12); color: var(--accent-amber); }
.status-offline { background: rgba(138,138,150,0.12); color: var(--text-muted); }

/* 状态圆点要有 glow */
.status-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
}
.status-dot.online  { background: var(--accent-emerald); box-shadow: 0 0 6px var(--accent-emerald); }
.status-dot.busy    { background: var(--accent-amber); box-shadow: 0 0 6px var(--accent-amber); animation: pulse-dot 2s infinite; }
.status-dot.offline { background: var(--text-muted); }
```

### 1.5 Badge 标签样式

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
}
/* 不同来源的颜色 */
.badge-claude-code { background: rgba(34,211,238,0.1); color: var(--accent-cyan); }
.badge-openclaw    { background: rgba(167,139,250,0.1); color: var(--accent-violet); }
.badge-codex       { background: rgba(52,211,153,0.1); color: var(--accent-emerald); }
.badge-doubao      { background: rgba(251,191,36,0.1); color: var(--accent-amber); }
.badge-yuanbao     { background: rgba(251,113,133,0.1); color: var(--accent-rose); }
.badge-workbuddy   { background: rgba(240,171,252,0.1); color: #f0abfc; }
.badge-manual      { background: var(--bg-hover); color: var(--text-muted); }
```

---

## 2. Layout.tsx — 侧边栏

### 问题
- 侧边栏宽度过窄（230px），品牌区域缺乏存在感
- 导航项间距太小，选中态不够明显
- 底部 "System Online" 太简陋

### 调整方向

```tsx
// 1. 侧边栏宽度 230px → 240px
// 2. 品牌区域：加大 icon + 增加微光效果
<div className="flex items-center gap-3 px-5 py-5">
  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
    style={{ background: 'rgba(34,211,238,0.1)' }}>
    <Activity size={20} style={{ color: 'var(--accent-cyan)' }} />
  </div>
  <div>
    <h1 className="text-[15px] font-semibold">Agent Monitor</h1>
    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>v2.0.0</p>
  </div>
</div>

// 3. 导航项：增加圆角 (rounded-lg)、增加 py (py-2.5)、选中态加左侧指示条
// 参照 HW: 选中态用 box-shadow 实现
<Link className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all ${
  active ? 'bg-[var(--bg-hover)] font-medium shadow-sm' : 'hover:bg-[var(--bg-hover)]'
}`}
  style={{
    color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
    borderLeft: active ? '3px solid var(--accent-cyan)' : '3px solid transparent',
  }}>

// 4. 底部区域：改为显示连接状态 + adapter 信息
<div className="p-4 border-t border-[var(--border)]">
  <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(52,211,153,0.06)' }}>
    <div className="w-1.5 h-1.5 rounded-full status-dot online" />
    <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Connected · mock</span>
  </div>
</div>
```

---

## 3. Dashboard.tsx

### 问题
- 统计卡片太空旷，只有数字没有上下文
- "Recent Outputs" 列表占满宽度但信息密度低
- Agent 列表和输出列表之间的视觉关联弱

### 调整方向

```tsx
// 1. 统计卡片：增加趋势指示 + 底部分隔线
<div className="group rounded-xl border border-[var(--border)] p-5 hover:border-[var(--border-bright)] hover:shadow-md transition-all"
  style={{ background: 'var(--bg-card)' }}>
  {/* 图标容器 — 用 HW 的 accent-soft 背景色 */}
  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
    style={{ background: `${color}12` }}>
    <Icon size={18} style={{ color }} />
  </div>
  <p className="text-2xl font-semibold mb-0.5">{value}</p>
  <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{label}</p>
</div>

// 2. 输出列表行：增加左侧颜色条标识来源
<div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
  style={{ borderLeft: `3px solid ${sourceColor}` }}>
  ...
</div>

// 3. Agent 卡片：增加背景色分区
// 在卡片左侧加一条 3px 的状态颜色条
<div className="rounded-xl border border-[var(--border)] overflow-hidden"
  style={{ background: 'var(--bg-card)' }}>
  <div className="flex">
    <div className="w-1 shrink-0" style={{ background: agent.status === 'online' ? 'var(--accent-emerald)' : agent.status === 'busy' ? 'var(--accent-amber)' : 'var(--text-muted)' }} />
    <div className="flex-1 flex items-center gap-3 px-4 py-3">
      ...
    </div>
  </div>
</div>
```

---

## 4. Projects.tsx

### 问题
- 项目卡片右侧太多空白
- 状态标签不够醒目
- 缺少编辑/详情入口

### 调整方向

```tsx
// 1. 项目卡片改为更紧凑的表格行风格（multica 的 list-item）
<div className="flex items-center gap-4 rounded-xl border border-[var(--border)] px-5 py-4 hover:border-[var(--border-bright)] hover:shadow-sm transition-all"
  style={{ background: 'var(--bg-card)' }}>
  {/* 左侧图标 */}
  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
    style={{ background: 'rgba(34,211,238,0.08)' }}>
    <FolderKanban size={18} style={{ color: 'var(--accent-cyan)' }} />
  </div>
  {/* 中间信息 */}
  <div className="flex-1 min-w-0">
    <p className="text-[14px] font-medium">{p.name}</p>
    <p className="text-[12px] mono truncate" style={{ color: 'var(--text-secondary)' }}>{p.path}</p>
  </div>
  {/* 技术栈 badge — 用 pill 样式 */}
  <div className="flex gap-1.5 shrink-0">
    {p.tech_stack.map(t => (
      <span key={t} className="badge badge-claude-code">{t}</span>
    ))}
  </div>
  {/* 状态 pill */}
  <span className="status-pill status-online">
    <span className="status-dot online" />
    Active
  </span>
  {/* 操作 */}
  <button className="p-2 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
    <MoreHorizontal size={16} />
  </button>
</div>

// 2. 注册表单 — 更好的输入框样式
<input className="w-full text-[13px] px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] outline-none transition-colors focus:border-[var(--accent-cyan)] focus:ring-1 focus:ring-[var(--accent-cyan)]/30"
  style={{ color: 'var(--text-primary)' }} />

// 3. 注册按钮 — 改为实心主按钮
<button className="btn-primary">Register</button>
```

---

## 5. Agents.tsx

### 问题
- 卡片内部 Platform/Role 用网格布局间距过大
- 缺少操作入口
- 整体信息密度偏低

### 调整方向

```tsx
// 1. 卡片改为紧凑列表风格（参照 HW agent list）
<div className="rounded-xl border border-[var(--border)] overflow-hidden hover:border-[var(--border-bright)] hover:shadow-sm transition-all"
  style={{ background: 'var(--bg-card)' }}>
  <div className="flex items-center gap-4 px-4 py-3.5">
    {/* 头像/图标 */}
    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: 'rgba(167,139,250,0.1)' }}>
      <Bot size={18} style={{ color: 'var(--accent-violet)' }} />
    </div>
    {/* 名称 + 状态 pill */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-[14px] font-medium">{agent.name}</p>
        <span className="status-pill status-{agent.status}">
          <span className="status-dot {agent.status}" />
          {agent.status}
        </span>
      </div>
      <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
        {agent.platform} · {agent.role}
      </p>
    </div>
    {/* 当前任务 */}
    {agent.currentTaskId && (
      <div className="text-right">
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Current task</p>
        <p className="text-[12px] mono font-medium">{agent.currentTaskId}</p>
      </div>
    )}
  </div>
</div>

// 2. 顶部统计改为 HW 的 summary bar
<div className="flex items-center gap-4 mb-4 px-1">
  <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
    <span className="font-semibold text-[var(--text-primary)]">{activeAgents}</span> active
  </span>
  <span style={{ color: 'var(--border)' }}>·</span>
  <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
    <span className="font-semibold text-[var(--text-primary)]">{agents.length}</span> total
  </span>
</div>
```

---

## 6. Outputs.tsx

### 问题
- 列表行太扁平，没有时间线引导感
- 过滤器用原生 select 不够美观
- 展开后内容没有代码高亮区分

### 调整方向

```tsx
// 1. 过滤器改为 pill tabs（参照 HW 的 tab 切换）
<div className="flex items-center gap-2 mb-4">
  {['all', ...SOURCE_LIST].map(s => (
    <button key={s} className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
      sourceFilter === (s === 'all' ? '' : s) ? 'bg-[var(--accent-cyan)] text-[oklch(0.15_0.01_260)]' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
    }`}>
      {s === 'all' ? 'All' : s}
    </button>
  ))}
</div>

// 2. 输出列表行 — 增加左侧来源色条 + 更好的时间格式
<div className="flex rounded-xl border border-[var(--border)] overflow-hidden mb-1.5 hover:border-[var(--border-bright)] transition-all"
  style={{ background: 'var(--bg-card)' }}>
  {/* 左侧色条 */}
  <div className="w-1 shrink-0" style={{ background: sourceColorMap[o.source] }} />
  <div className="flex-1">
    <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-hover)] transition-colors">
      <span className="badge badge-{o.source}">{o.source}</span>
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] capitalize" style={{ color: 'var(--text-secondary)' }}>
        {o.direction}
      </span>
      <span className="text-[13px] flex-1 truncate">{o.title}</span>
      <span className="text-[11px] mono shrink-0" style={{ color: 'var(--text-muted)' }}>
        {formatRelativeTime(o.created_at)}
      </span>
    </button>
    {/* 展开内容 */}
    {isOpen && (
      <div className="px-4 pb-4 border-t border-[var(--border)]">
        <pre className="text-[12px] whitespace-pre-wrap break-words p-3 rounded-lg bg-[var(--bg-primary)] mono leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}>
          {o.content}
        </pre>
      </div>
    )}
  </div>
</div>
```

---

## 7. Memory.tsx

### 问题
- 搜索框设计单调
- 类型标签颜色单一（应按类型分配不同颜色）
- 列表项之间间距不够

### 调整方向

```tsx
// 1. 搜索框 — 增加 icon + focus 动效
<div className="relative flex-1">
  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
  <input className="w-full text-[13px] pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] outline-none transition-all focus:border-[var(--accent-cyan)] focus:ring-2 focus:ring-[var(--accent-cyan)]/20"
    style={{ color: 'var(--text-primary)' }} />
</div>

// 2. 类型 badge — 每种类型独立颜色
const TYPE_COLORS = {
  decision:   { bg: 'rgba(34,211,238,0.1)',   color: 'var(--accent-cyan)' },
  rule:       { bg: 'rgba(167,139,250,0.1)',  color: 'var(--accent-violet)' },
  context:    { bg: 'rgba(52,211,153,0.1)',   color: 'var(--accent-emerald)' },
  preference: { bg: 'rgba(251,191,36,0.1)',   color: 'var(--accent-amber)' },
  experience: { bg: 'rgba(251,113,133,0.1)',  color: 'var(--accent-rose)' },
};

// 3. 记忆条目 — 增加左侧类型色条 + importance 进度条
<div className="flex rounded-xl border border-[var(--border)] overflow-hidden mb-2 hover:border-[var(--border-bright)] transition-all"
  style={{ background: 'var(--bg-card)' }}>
  <div className="w-1 shrink-0" style={{ background: TYPE_COLORS[m.type]?.color || 'var(--text-muted)' }} />
  <div className="flex-1 px-4 py-3.5">
    <div className="flex items-center gap-2 mb-1.5">
      <span className="badge" style={{ background: TYPE_COLORS[m.type]?.bg, color: TYPE_COLORS[m.type]?.color }}>
        {m.type}
      </span>
      {/* importance 微型进度条 */}
      <div className="w-16 h-1 rounded-full bg-[var(--bg-hover)]">
        <div className="h-full rounded-full" style={{ width: `${m.importance * 10}%`, background: m.importance >= 7 ? 'var(--accent-amber)' : 'var(--text-muted)' }} />
      </div>
    </div>
    <p className="text-[13px] leading-relaxed">{m.content}</p>
    <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
      {m.source && `by ${m.source} · `}{new Date(m.created_at).toLocaleDateString()}
    </p>
  </div>
</div>
```

---

## 8. Inbox.tsx

### 问题
- 空状态图标用 InboxIcon 不好看，颜色与侧边栏选中不一致
- 有内容时列表样式与 Outputs 不统一

### 调整方向

```tsx
// 1. 空状态 — 用 CheckCircle + emerald 色调（正面情绪）
<div className="text-center">
  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
    style={{ background: 'rgba(52,211,153,0.08)' }}>
    <CheckCircle size={28} style={{ color: 'var(--accent-emerald)' }} />
  </div>
  <p className="text-base font-medium mb-1">All clear</p>
  <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>No pending items</p>
</div>

// 2. 有内容时的列表项 — 与 Outputs 统一风格
// 左侧色条 + 类型图标 + 操作按钮
```

---

## 9. 通用原则（全页面适用）

1. **卡片边框**: `border: 1px solid var(--border)` + hover 变亮，当前太淡
2. **圆角**: 统一用 `rounded-xl`（10px），不要混用 `rounded-lg`（8px）
3. **hover 效果**: 所有可交互元素加 `transform: translateY(-1px)` + `shadow` 上浮
4. **间距**: 卡片之间 `gap-3`（12px），列表行 `py-3.5`（14px），不要用 `py-2`/`py-3`
5. **字号**: 正文 `text-[13px]`，标题 `text-[15px]`，辅助 `text-[11px]`，不要用 `text-xs`(12px) 做正文
6. **focus 状态**: 所有输入框加 `focus:ring-2 focus:ring-[accent]/20`
7. **transition**: 统一 `transition-all`，时长 `0.15s` 或 `0.2s`

---

## 10. 颜色映射表（source → color）

```typescript
const SOURCE_COLORS: Record<string, string> = {
  'claude-code': 'var(--accent-cyan)',     // #22d3ee
  'openclaw':    'var(--accent-violet)',   // #a78bfa
  'codex':       'var(--accent-emerald)',  // #34d399
  'doubao':      'var(--accent-amber)',    // #fbbf24
  'yuanbao':     'var(--accent-rose)',     // #fb7185
  'workbuddy':   '#f0abfc',               // pink-purple
  'manual':      'var(--text-muted)',      // neutral
};
```
