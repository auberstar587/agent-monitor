import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";
import {
  FolderKanban, Plus, Trash2, MapPin, Folder, FolderOpen,
  Home, Briefcase, Monitor, Download, FileText, X, ChevronUp,
  CornerDownLeft, Search, Clock, Hash, Cpu, Radio, Zap, Filter,
  AlertTriangle, Activity,
} from "lucide-react";

/* ── Relative time helper ── */
function relTime(iso?: string) {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 86_400_000 * 30) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function channelStyle(status: string) {
  switch (status) {
    case "active":   return { color: "var(--success)", label: "ACTIVE",   code: "01" };
    case "paused":   return { color: "var(--warning)", label: "PAUSED",   code: "02" };
    case "archived": return { color: "var(--muted)",   label: "ARCHIVED", code: "00" };
    default:         return { color: "var(--muted)",   label: (status ?? "UNKNOWN").toUpperCase(), code: "??" };
  }
}

const STATUS_LABEL: Record<string, string> = {
  active: "活跃",
  paused: "暂停",
  archived: "归档",
};

const SHORTCUT_ICON: Record<string, any> = {
  home: Home,
  desktop: Monitor,
  documents: FileText,
  downloads: Download,
  cwd: Briefcase,
};

/* ════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════ */
const STATUS_FILTERS = [
  { key: "",          label: "ALL",      color: "var(--muted)" },
  { key: "active",    label: "ACTIVE",   color: "var(--success)" },
  { key: "paused",    label: "PAUSED",   color: "var(--warning)" },
  { key: "archived",  label: "ARCHIVED", color: "var(--muted)" },
] as const;

export default function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [statsMap, setStatsMap] = useState<Record<string, { tasks: Record<string, number>; agents: { assigned: number } }>>({});
  const navigate = useNavigate();

  const load = (status?: string) => {
    const s = status ?? statusFilter;
    return api.listProjects(s || undefined).then(setProjects);
  };

  useEffect(() => { load(""); }, []);
  // 切换状态筛选时重新加载
  useEffect(() => { load(statusFilter); }, [statusFilter]);

  // 加载每个项目的 stats（P8-05 进度看板）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        projects.map(async (p) => {
          try {
            const s = await api.getProjectStats(p.id);
            return [p.id, s] as const;
          } catch { return [p.id, null] as const; }
        }),
      );
      if (cancelled) return;
      const next: typeof statsMap = {};
      for (const [id, s] of entries) if (s) next[id] = s;
      setStatsMap(next);
    })();
    return () => { cancelled = true; };
  }, [projects]);

  // 1 Hz heartbeat
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const counts = useMemo(() => {
    const c = { active: 0, paused: 0, archived: 0 };
    for (const p of projects) {
      if (p.status in c) (c as any)[p.status]++;
    }
    return c;
  }, [projects]);

  const lastUpdate = projects
    .map((p) => p.updated_at || p.last_activity)
    .filter(Boolean)
    .sort()
    .pop();

  const handleAdd = async () => {
    if (!path) return;
    try {
      await api.registerProject(path, name || undefined);
      setPath("");
      setName("");
      setShowAdd(false);
      load();
    } catch (e) {
      alert(`注册失败：${(e as Error).message}`);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("确认删除这个项目？此操作无法撤销。")) return;
    try {
      await api.deleteProject(id);
      load();
    } catch (err) {
      alert(`删除失败：${(err as Error).message}`);
    }
  };

  return (
    <div className="projects-page">
      {/* ═══ Telemetry bar ═══ */}
      <div className="agents-telemetry">
        <div className="agents-telem-cell">
          <span className="agents-telem-label"><FolderKanban size={11} /> NODES</span>
          <span className="agents-telem-value mono">{String(projects.length).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--success)" }}><Zap size={11} /> ACTIVE</span>
          <span className="agents-telem-value mono" style={{ color: "var(--success)" }}>{String(counts.active).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--warning)" }}><Clock size={11} /> PAUSED</span>
          <span className="agents-telem-value mono" style={{ color: "var(--warning)" }}>{String(counts.paused).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--muted)" }}>ARCHIVED</span>
          <span className="agents-telem-value mono" style={{ color: "var(--muted)" }}>{String(counts.archived).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-spacer" />
        <div className="agents-telem-cell">
          <span className="agents-telem-label"><Radio size={11} /> LATEST UPDATE</span>
          <span className="agents-telem-value mono">{relTime(lastUpdate)}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label">UPLINK</span>
          <span className="agents-telem-value mono" style={{ color: "var(--success)" }}>SYNC</span>
        </div>
      </div>

      {/* ═══ Action bar ═══ */}
      <div className="projects-actions">
        <span className="projects-actions-meta">
          <span className="projects-actions-dot" />
          REGISTRY · {projects.length} ENTRIES · SCANNING
        </span>
        {/* 状态筛选器（P8-03） */}
        <div className="agents-filters">
          <Filter size={11} style={{ color: "var(--muted)", marginRight: 4 }} />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              onClick={() => setStatusFilter(f.key)}
              className={`agents-filter-btn ${statusFilter === f.key ? "active" : ""}`}
              style={statusFilter === f.key ? { color: f.color } : undefined}
            >
              {f.label}
            </button>
          ))}
        </div>
        {showAdd ? (
          <button className="button" onClick={() => setShowAdd(false)}>
            <X size={13} /> 取消
          </button>
        ) : null}
        <button
          className="button button-primary"
          onClick={() => setShowAdd((s) => !s)}
        >
          <Plus size={13} /> {showAdd ? "收起表单" : "注册项目"}
        </button>
      </div>

      {/* ═══ Add form (telemetry-style strip) ═══ */}
      {showAdd && (
        <div className="projects-add">
          <div className="projects-add-cell" style={{ gridColumn: "1 / -1" }}>
            <span className="projects-add-label">
              <Hash size={9} style={{ display: "inline", marginRight: 3, verticalAlign: -1 }} />
              PATH · 项目根目录
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="例如 /Users/xxx/AI/project，或点右侧浏览选择"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="projects-add-input flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
              <button
                type="button"
                className="projects-add-browse"
                onClick={() => setBrowseOpen(true)}
                title="浏览目录"
              >
                <FolderOpen size={12} /> 浏览…
              </button>
            </div>
          </div>
          <div className="projects-add-cell">
            <span className="projects-add-label">NAME · 名称（可选）</span>
            <input
              type="text"
              placeholder="留空自动检测"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="projects-add-input"
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
          </div>
          <div className="projects-add-cell" style={{ padding: 0 }}>
            <button
              onClick={handleAdd}
              disabled={!path}
              className="projects-add-submit"
              style={{ width: "100%", height: "100%" }}
            >
              <CornerDownLeft size={12} /> 注册
            </button>
          </div>
        </div>
      )}

      {/* ═══ Project list / empty state ═══ */}
      {projects.length === 0 ? (
        <div className="projects-empty">
          <div className="projects-empty-grid" />
          <div className="projects-empty-body">
            <div className="projects-empty-eyebrow">
              <Radio size={11} /> NO SIGNAL · REGISTRY EMPTY
            </div>
            <p className="projects-empty-title">尚未注册任何项目</p>
            <p className="projects-empty-sub">
              把你本地的代码目录注册进来，Agent Monitor 就能开始追踪它的输出、决策和上下文。
            </p>
            <button
              className="projects-empty-cta"
              onClick={() => { setShowAdd(true); setTimeout(() => setBrowseOpen(true), 100); }}
            >
              <Plus size={13} /> 注册第一个项目
            </button>
          </div>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((p, idx) => {
            const ch = channelStyle(p.status);
            return (
              <div
                key={p.id}
                className="project-card"
                style={{ ["--ch" as any]: ch.color, animationDelay: `${idx * 40}ms` }}
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <div className="project-card-rail" />
                <div className="project-card-body">
                  {/* Meta head */}
                  <div className="project-card-head">
                    <span className="project-card-index mono">PRJ{String(idx + 1).padStart(3, "0")}</span>
                    <span className="project-card-channel mono" style={{ color: ch.color }}>
                      · {ch.code}
                    </span>
                    <span className="project-card-status mono" style={{ color: ch.color }}>
                      {ch.label}
                    </span>
                  </div>

                  {/* Identity */}
                  <div className="project-card-id">
                    <div className="project-icon">
                      <FolderKanban size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="project-name">{p.name}</h3>
                      <p className="project-path">
                        <MapPin size={9} />
                        {p.path}
                      </p>
                    </div>
                    <div className="project-card-actions">
                      <button
                        onClick={(e) => handleDelete(e, p.id)}
                        className="icon-btn danger"
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="project-stats">
                    <div className="project-stat">
                      <span className="project-stat-key">CREATED</span>
                      <span className="project-stat-val">{relTime(p.created_at)}</span>
                    </div>
                    <div className="project-stat">
                      <span className="project-stat-key">UPDATED</span>
                      <span className="project-stat-val">{relTime(p.updated_at)}</span>
                    </div>
                  </div>

                  {/* Tech stack */}
                  {p.tech_stack?.length > 0 ? (
                    <div className="project-tech">
                      {p.tech_stack.map((t: string) => (
                        <span key={t} className="tech-badge mono">{t}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="project-tech-empty">
                      <Cpu size={9} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
                      STACK · NOT DETECTED
                    </span>
                  )}

                  {/* P8-05: 进度看板 */}
                  {(() => {
                    const s = statsMap[p.id];
                    if (!s) return null;
                    const tasks = s.tasks || {};
                    const total = tasks.total || 0;
                    const completed = tasks.completed || 0;
                    const failed = tasks.failed || 0;
                    const active = tasks.in_progress || 0;
                    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                    return (
                      <div className="project-progress">
                        <div className="project-progress-bar">
                          <div
                            className="project-progress-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="project-progress-meta mono">
                          <span className="project-progress-pct" style={{ color: pct >= 80 ? "var(--success)" : pct >= 40 ? "var(--accent)" : "var(--muted)" }}>
                            {total > 0 ? `${pct}%` : "—"}
                          </span>
                          <span className="project-progress-stat" style={{ color: active > 0 ? "var(--info)" : "var(--muted)" }}>
                            <Activity size={9} style={{ display: "inline", verticalAlign: -1, marginRight: 2 }} />
                            {active} active
                          </span>
                          <span className="project-progress-stat" style={{ color: failed > 0 ? "var(--danger)" : "var(--muted)" }}>
                            <AlertTriangle size={9} style={{ display: "inline", verticalAlign: -1, marginRight: 2 }} />
                            {failed} fail
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Browse dialog ═══ */}
      {browseOpen && (
        <FileBrowser
          initialPath={path || undefined}
          onSelect={(selected) => { setPath(selected); setBrowseOpen(false); }}
          onClose={() => setBrowseOpen(false)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   FILE BROWSER DIALOG
   ════════════════════════════════════════════════════════ */
interface FsEntry { name: string; path: string; has_children: boolean }
interface FsBrowse { current: string; parent: string | null; dirs: FsEntry[] }
interface FsShortcut { key: string; label: string; path: string }

function FileBrowser({
  initialPath,
  onSelect,
  onClose,
}: {
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState<string>("");
  const [data, setData] = useState<FsBrowse | null>(null);
  const [shortcuts, setShortcuts] = useState<FsShortcut[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load shortcuts + initial home on first mount
  useEffect(() => {
    api.getCommon()
      .then((res) => setShortcuts(res.shortcuts))
      .catch(() => {});
  }, []);

  // Resolve starting path
  useEffect(() => {
    (async () => {
      let start = initialPath;
      if (!start) {
        try {
          const home = await api.getHome();
          start = home.home;
        } catch {
          start = "/";
        }
      }
      setCurrent(start);
      setSelected(start);
    })();
  }, [initialPath]);

  // Browse on current change
  useEffect(() => {
    if (!current) return;
    setLoading(true);
    setError(null);
    api.browseFs(current)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, [current]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && selected) onSelect(selected);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, onSelect, onClose]);

  const segments = current ? current.split("/").filter(Boolean) : [];

  return (
    <div className="fs-overlay" onClick={onClose}>
      <div className="fs-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="fs-head">
          <div className="flex items-center gap-2 min-w-0">
            <Folder size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <span className="fs-head-eyebrow">FILE BROWSER</span>
            <span className="fs-head-title">选择项目目录</span>
          </div>
          <div className="fs-head-spacer" />
          <button className="fs-head-btn" onClick={onClose} title="关闭 (Esc)">
            <X size={14} />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="fs-breadcrumb">
          <button className="fs-crumb" onClick={() => { setCurrent("/"); }}>
            <Home size={10} /> root
          </button>
          {segments.map((seg, i) => {
            const segPath = "/" + segments.slice(0, i + 1).join("/");
            const isLast = i === segments.length - 1;
            return (
              <span key={segPath} className="flex items-center gap-1">
                <span className="fs-crumb-sep">/</span>
                <button
                  className="fs-crumb"
                  onClick={() => setCurrent(segPath)}
                  style={isLast ? { color: "var(--accent)", background: "var(--accent-soft)" } : undefined}
                >
                  {seg}
                </button>
              </span>
            );
          })}
        </div>

        {/* Body: sidebar + main */}
        <div className="fs-body">
          {/* Sidebar */}
          <div className="fs-side">
            <div className="fs-side-group">
              <span className="fs-side-label">常用位置</span>
              {shortcuts.map((s) => {
                const Icon = SHORTCUT_ICON[s.key] || Folder;
                const active = current === s.path;
                return (
                  <button
                    key={s.key}
                    className={`fs-side-item ${active ? "active" : ""}`}
                    onClick={() => setCurrent(s.path)}
                  >
                    <Icon size={13} />
                    <span className="fs-side-item-label">{s.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="fs-side-group">
              <span className="fs-side-label">快捷操作</span>
              {data?.parent && (
                <button className="fs-side-item" onClick={() => setCurrent(data.parent!)}>
                  <ChevronUp size={13} />
                  <span className="fs-side-item-label">上一级</span>
                </button>
              )}
              <button
                className="fs-side-item"
                onClick={() => { if (current) setCurrent(current); }}
                title="刷新当前目录"
              >
                <Search size={13} />
                <span className="fs-side-item-label">刷新</span>
              </button>
            </div>
          </div>

          {/* Main list */}
          <div className="fs-main">
            <div className="fs-main-head">
              <span className="fs-main-head-label">CONTENTS</span>
              <span className="fs-main-head-count">
                {data ? `${data.dirs.length} DIRS` : "—"}
              </span>
            </div>
            <div className="fs-list">
              {loading ? (
                <div className="fs-loading">
                  <span className="fs-loading-dot" />
                  READING…
                </div>
              ) : error ? (
                <div className="fs-list-empty">
                  <span className="fs-list-empty-eyebrow">ERROR</span>
                  <span>{error}</span>
                </div>
              ) : !data || data.dirs.length === 0 ? (
                <div className="fs-list-empty">
                  <span className="fs-list-empty-eyebrow">EMPTY</span>
                  <span>此目录不包含子文件夹</span>
                </div>
              ) : (
                data.dirs.map((d) => {
                  const isSelected = selected === d.path;
                  return (
                    <div
                      key={d.path}
                      className={`fs-row ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelected(d.path)}
                      onDoubleClick={() => { setCurrent(d.path); setSelected(d.path); }}
                      title="单击选择，双击进入"
                    >
                      <div className="fs-row-icon">
                        <Folder size={15} />
                      </div>
                      <span className="fs-row-name">{d.name}</span>
                      <span className="fs-row-meta">
                        {d.has_children ? "▸" : "·"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="fs-foot">
          <div className="fs-foot-path">
            <span className="fs-foot-path-label">SELECTED</span>
            <span className={`fs-foot-path-text ${!selected ? "fs-foot-path-empty" : ""}`}>
              {selected || "未选择"}
            </span>
          </div>
          <button className="fs-foot-btn fs-foot-cancel" onClick={onClose}>
            取消
          </button>
          <button
            className="fs-foot-btn fs-foot-select"
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
          >
            <CornerDownLeft size={12} /> 选择此文件夹
          </button>
        </div>
      </div>
    </div>
  );
}
