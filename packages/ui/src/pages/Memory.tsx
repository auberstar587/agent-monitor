import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import CustomSelect from "../components/CustomSelect";
import {
  Brain, Search, Plus, Trash2, Sparkles, BarChart3,
  X, Pin, PinOff, Pencil, Check, AlertTriangle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const MEM_TYPES = ["decision", "rule", "context", "preference", "experience"] as const;
type MemType = (typeof MEM_TYPES)[number];

const TYPE_LABELS: Record<string, string> = {
  decision: "决策", rule: "规则", context: "上下文",
  preference: "偏好", experience: "经验",
};
const MEMORY_TYPE_OPTIONS = MEM_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] }));

const TYPE_COLORS: Record<MemType, { color: string; bg: string; border: string }> = {
  decision:   { color: "var(--accent)",  bg: "var(--accent-soft)",  border: "rgba(18, 215, 255, 0.22)" },
  rule:       { color: "var(--brand)",   bg: "var(--brand-soft)",   border: "rgba(167, 139, 250, 0.22)" },
  context:    { color: "var(--success)", bg: "var(--success-bg)",   border: "rgba(40, 224, 111, 0.22)" },
  preference: { color: "var(--warning)", bg: "var(--warning-bg)",   border: "rgba(251, 191, 36, 0.22)" },
  experience: { color: "var(--danger)",  bg: "var(--danger-bg)",    border: "rgba(251, 113, 133, 0.22)" },
};

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Memory {
  id: string;
  project_id?: string | null;
  type: MemType;
  content: string;
  source?: string;
  importance: number;
  status: "active" | "pinned" | "archived" | "deprecated";
  tags?: string[];
  created_at: string;
}

interface Banner {
  kind: "success" | "error" | "info";
  text: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function Memory() {
  const [items, setItems] = useState<Memory[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | MemType>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<MemType>("decision");
  const [newContent, setNewContent] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [newImportance, setNewImportance] = useState(5);
  const [projects, setProjects] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [dreaming, setDreaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editImportance, setEditImportance] = useState(5);
  const [banner, setBanner] = useState<Banner | null>(null);
  const bannerTimer = useRef<number | null>(null);
  const addFormRef = useRef<HTMLDivElement>(null);

  /* ---- Data loading ---- */

  const loadAll = (type?: string) => {
    const filter = type && type !== "all" ? { type } : undefined;
    api.listMemory(filter).then((rows: Memory[]) => setItems(rows));
  };
  const loadStats = () => api.memoryStats().then(setStats);
  const loadProjects = () => api.listProjects().then(setProjects);

  useEffect(() => { loadAll(); loadStats(); loadProjects(); }, []);

  /* ---- Keyboard shortcuts ---- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showAdd) { setShowAdd(false); return; }
      if (editing) { setEditing(null); return; }
      if (confirmingDelete) { setConfirmingDelete(null); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAdd, editing, confirmingDelete]);

  /* Auto-focus content textarea when add form opens */
  useEffect(() => {
    if (showAdd && addFormRef.current) {
      addFormRef.current.querySelector("textarea")?.focus();
    }
  }, [showAdd]);

  /* ---- Helpers ---- */

  const flash = (kind: Banner["kind"], text: string) => {
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    setBanner({ kind, text });
    bannerTimer.current = window.setTimeout(() => setBanner(null), 4000);
  };

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of projects) m[p.id] = p.name;
    return m;
  }, [projects]);

  const projectCount = useMemo(() => {
    const ids = new Set<string>();
    for (const it of items) if (it.project_id) ids.add(it.project_id);
    return ids.size;
  }, [items]);

  /* ---- Handlers ---- */

  const handleSearch = async () => {
    if (!query.trim()) { loadAll(typeFilter); return; }
    setItems(await api.searchMemory(query));
  };

  const handleFilter = (type: string) => {
    const t = type as "all" | MemType;
    setTypeFilter(t);
    loadAll(t);
  };

  const handleAdd = async (keepOpen = false) => {
    if (!newContent.trim()) return;
    try {
      await api.createMemory({
        type: newType, content: newContent,
        importance: newImportance,
        project_id: newProjectId || undefined,
      });
      flash("success", "已添加记忆");
      setNewContent("");
      if (!keepOpen) setShowAdd(false);
      loadAll(typeFilter);
      loadStats();
    } catch (e: any) {
      flash("error", `添加失败：${e?.message ?? e}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMemory(id);
      setConfirmingDelete(null);
      flash("success", "已删除");
      loadAll(typeFilter);
      loadStats();
    } catch (e: any) {
      flash("error", `删除失败：${e?.message ?? e}`);
    }
  };

  const handleTogglePin = async (m: Memory) => {
    const next = m.status === "pinned" ? "active" : "pinned";
    setItems((prev) => prev.map((it) => it.id === m.id ? { ...it, status: next as Memory["status"] } : it));
    flash("info", next === "pinned" ? "已置顶" : "已取消置顶");
  };

  const handleStartEdit = (m: Memory) => {
    setEditing(m.id);
    setEditContent(m.content);
    setEditImportance(m.importance);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editContent.trim()) return;
    try {
      await api.updateMemory(id, { content: editContent, importance: editImportance });
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, content: editContent, importance: editImportance } : it));
      setEditing(null);
      flash("success", "已更新");
    } catch (e: any) {
      flash("error", `更新失败：${e?.message ?? e}`);
    }
  };

  const handleDream = async () => {
    setDreaming(true);
    try {
      const result = await api.triggerDream();
      flash("success", `Dream 完成：合并 ${result.merged ?? 0} 条，降权 ${result.degraded ?? 0} 条，归档 ${result.archived ?? 0} 条`);
      loadAll(typeFilter);
      loadStats();
    } catch (e: any) {
      flash("error", `Dream 失败：${e?.message ?? e}`);
    } finally {
      setDreaming(false);
    }
  };

  /* ---- Importance badge helper ---- */

  const importanceBadge = (value: number) => {
    if (value >= 7) return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-md importance-high">重要 {value}/10</span>
    );
    if (value <= 3) return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{
        color: "var(--muted)", background: "rgba(110,116,144,0.08)", border: "1px solid var(--line)",
      }}>低优先 {value}/10</span>
    );
    return <span className="text-[10px]" style={{ color: "var(--muted)" }}>{value}/10</span>;
  };

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  return (
    <div className="memory-scroll">
      {/* ---- Page actions (rendered into header via page-header-actions) ---- */}
      <div className="flex items-center gap-2 -mt-1 mb-0">
        <button className="button" onClick={handleDream} disabled={dreaming}
          title="自动合并重复 / 降权过期 / 归档低价值记忆">
          <Sparkles size={13} style={{ color: dreaming ? "var(--muted)" : "var(--warning)" }} />
          {dreaming ? "整理中…" : "Dream"}
        </button>
        <button className="button button-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? <X size={14} /> : <Plus size={14} />}
          {showAdd ? "取消" : "添加记忆"}
        </button>
      </div>

      {/* ---- Banner ---- */}
      {banner && (
        <div className={`toast toast-${banner.kind}`} role="status">
          {banner.kind === "success" && <Check size={14} />}
          {banner.kind === "error" && <AlertTriangle size={14} />}
          {banner.kind === "info" && <Sparkles size={14} />}
          <span className="text-xs flex-1">{banner.text}</span>
          <button className="icon-btn" onClick={() => setBanner(null)} title="关闭"><X size={12} /></button>
        </div>
      )}

      {/* ---- Toolbar: stats + search + filters in one card ---- */}
      <div className="content-card" style={{ padding: "14px 18px" }}>
        {/* Stats row */}
        {stats && (
          <div className="flex items-center gap-5 flex-wrap" style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
            <div className="flex items-center gap-2">
              <BarChart3 size={13} style={{ color: "var(--muted)" }} />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                <strong style={{ color: "var(--text)", fontSize: 14 }}>{stats.active}</strong> 条活跃
              </span>
            </div>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              覆盖 <strong style={{ color: "var(--text)" }}>{projectCount}</strong> 个项目
            </span>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              均重 <strong style={{ color: "var(--text)" }}>{stats.avgImportance}</strong>/10
            </span>
            <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
              已归档 {stats.archived} 条
            </span>
          </div>
        )}

        {/* Search row */}
        <div className="flex gap-2" style={{ marginBottom: 10 }}>
          <div className="flex-1 relative" style={{ height: 34 }}>
            <input type="text" placeholder="搜索记忆内容..." value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="form-input w-full text-sm h-full pl-3 pr-8" />
            <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--muted)" }} />
          </div>
          <button onClick={handleSearch} className="button" style={{ flexShrink: 0 }}>搜索</button>
        </div>

        {/* Type filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {(["all", ...MEM_TYPES] as const).map((t) => {
            const active = typeFilter === t;
            return (
              <button key={t} onClick={() => handleFilter(t)}
                className="text-xs px-3 py-1.5 rounded-md transition-colors"
                style={{
                  background: active ? "var(--bg-card-hover)" : "transparent",
                  color: active ? "var(--text)" : "var(--muted)",
                  border: `1px solid ${active ? "var(--line-strong)" : "var(--line)"}`,
                  fontWeight: active ? 600 : 500,
                }}>
                {t === "all" ? "全部" : TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Add Form (collapsible) ---- */}
      {showAdd && (
        <div className="content-card" style={{ padding: 16 }} ref={addFormRef}>
          {/* Row 1: type + project */}
          <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 12 }}>
            <div>
              <label className="form-label">类型</label>
              <CustomSelect
                value={newType}
                onChange={(value) => setNewType(value as MemType)}
                options={MEMORY_TYPE_OPTIONS}
                className="w-full"
              />
            </div>
            <div>
              <label className="form-label">项目（可选）</label>
              <CustomSelect
                value={newProjectId}
                onChange={setNewProjectId}
                options={[
                  { value: "", label: "— 跨项目 —" },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
                className="w-full"
              />
            </div>
          </div>

          {/* Row 2: importance */}
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">
              重要度 <span style={{ color: newImportance >= 7 ? "var(--warning)" : "var(--muted)" }}>{newImportance}/10</span>
            </label>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={10} value={newImportance}
                onChange={(e) => setNewImportance(parseInt(e.target.value, 10))}
                className="form-range" style={{ maxWidth: 200 }} />
              <div className="flex gap-1">
                {[3, 5, 7, 9].map((v) => (
                  <button key={v} type="button" onClick={() => setNewImportance(v)}
                    className="text-[10px] px-1.5 py-1 rounded"
                    style={{
                      background: newImportance === v ? "var(--accent-soft)" : "transparent",
                      color: newImportance === v ? "var(--accent)" : "var(--muted)",
                      border: "1px solid var(--line)",
                    }}>{v}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Textarea */}
          <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)}
            placeholder="输入记忆内容（Enter 保存，Shift+Enter 换行）..." rows={3}
            className="form-input w-full text-sm px-3 py-2 resize-none"
            style={{ marginBottom: 12 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(true); }
            }} />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button onClick={() => handleAdd(false)} className="button button-primary"
              disabled={!newContent.trim()}>保存</button>
            <button onClick={() => handleAdd(true)} className="button"
              disabled={!newContent.trim()}>保存并继续</button>
            <span className="text-[10px] ml-auto" style={{ color: "var(--muted)" }}>Esc 取消</span>
          </div>
        </div>
      )}

      {/* ---- Memory List ---- */}
      {items.length === 0 ? (
        <div className="empty-state">
          <Brain size={32} style={{ color: "var(--muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>暂无记忆</p>
          <p className="text-xs mt-1">点击「添加记忆」沉淀你的第一条决策、规则或经验</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((m) => {
            const palette = TYPE_COLORS[m.type] ?? TYPE_COLORS.decision;
            const isEditing = editing === m.id;
            const isConfirming = confirmingDelete === m.id;

            return (
              <div key={m.id} className="list-row items-start group"
                style={m.status === "pinned" ? { borderColor: "var(--accent-line)" } : undefined}>

                {/* Type badge */}
                <span className="type-badge shrink-0 mt-0.5" style={{
                  color: palette.color, background: palette.bg, borderColor: palette.border,
                }}>
                  {TYPE_LABELS[m.type] || m.type}
                </span>

                {/* Content area */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <>
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                        rows={2} className="form-input w-full text-sm px-3 py-2 resize-none"
                        style={{ marginBottom: 8 }} />
                      <div className="flex items-center gap-2">
                        <span className="text-[10px]" style={{ color: "var(--muted)" }}>重要度</span>
                        <input type="range" min={1} max={10} value={editImportance}
                          onChange={(e) => setEditImportance(parseInt(e.target.value, 10))}
                          className="form-range" style={{ maxWidth: 160 }} />
                        <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{editImportance}/10</span>
                        <button onClick={() => handleSaveEdit(m.id)}
                          className="button button-primary text-[11px] py-1 px-2 ml-auto"
                          disabled={!editContent.trim()}>
                          <Check size={12} /> 保存
                        </button>
                        <button onClick={() => setEditing(null)}
                          className="button text-[11px] py-1 px-2">取消</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm break-words" style={{ color: "var(--text)" }}>{m.content}</p>
                      {/* Metadata line */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {m.source && (
                          <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                            来源: {m.source}
                          </span>
                        )}
                        <span className="text-[10px] mono" style={{ color: "var(--muted)" }}>
                          {new Date(m.created_at).toLocaleDateString("zh-CN")}
                        </span>
                        {importanceBadge(m.importance)}
                        {m.project_id && projectMap[m.project_id] && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{
                            color: "var(--text-secondary)", background: "var(--paper-raised)",
                            border: "1px solid var(--line)",
                          }}>
                            {projectMap[m.project_id]}
                          </span>
                        )}
                        {m.status === "pinned" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{
                            color: "var(--accent)", background: "var(--accent-soft)",
                            border: "1px solid var(--accent-line)",
                          }}>
                            <Pin size={9} style={{ display: "inline", marginRight: 2, marginTop: -2 }} />已置顶
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Action buttons (hover-revealed) */}
                {!isEditing && !isConfirming && (
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleStartEdit(m)} className="icon-btn" title="编辑">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => handleTogglePin(m)} className="icon-btn"
                      title={m.status === "pinned" ? "取消置顶" : "置顶"}>
                      {m.status === "pinned" ? <PinOff size={12} /> : <Pin size={12} />}
                    </button>
                    <button onClick={() => setConfirmingDelete(m.id)} className="icon-btn danger" title="删除">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}

                {/* Delete confirm bar */}
                {isConfirming && (
                  <div className="flex items-center gap-2 shrink-0" style={{ color: "var(--danger)" }}>
                    <AlertTriangle size={13} />
                    <span className="text-xs">确认删除？</span>
                    <button onClick={() => handleDelete(m.id)} className="button text-[11px] py-1 px-2" style={{
                      background: "var(--danger-bg)", borderColor: "rgba(251,113,133,0.3)", color: "var(--danger)",
                    }}>删除</button>
                    <button onClick={() => setConfirmingDelete(null)} className="button text-[11px] py-1 px-2">取消</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
