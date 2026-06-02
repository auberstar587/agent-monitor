import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  ArrowLeft,
  FolderKanban,
  Edit3,
  Check,
  X,
  GitBranch,
  FileOutput,
  Cpu,
  Clock,
  Hash,
  Target,
  MapPin,
  Layers,
} from "lucide-react";

/* ── Relative time helper ── */
function relTime(iso?: string) {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/* ── Status channel colours ── */
function statusStyle(status: string) {
  switch (status) {
    case "active":
      return { color: "var(--success)", label: "ACTIVE", code: "01" };
    case "paused":
      return { color: "var(--warning)", label: "PAUSED", code: "02" };
    case "archived":
      return { color: "var(--muted)", label: "ARCHIVED", code: "00" };
    default:
      return {
        color: "var(--muted)",
        label: (status ?? "UNKNOWN").toUpperCase(),
        code: "??",
      };
  }
}

/* ── Direction label map ── */
const DIR_LABEL: Record<string, string> = {
  analysis: "分析",
  implementation: "实现",
  decision: "决策",
  review: "审查",
  question: "提问",
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [relations, setRelations] = useState<any[]>([]);
  const [outputs, setOutputs] = useState<any[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getProject(id),
      api.getRelations(id).catch(() => []),
      api.listOutputs({ project_id: id }).catch(() => []),
    ]).then(([p, r, o]) => {
      setProject(p);
      setRelations(r);
      setOutputs(o);
    });
  }, [id]);

  // 1 Hz heartbeat for relative timestamps
  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  if (!project)
    return (
      <div className="pd-loading">
        <span className="mono">ACQUIRING SIGNAL…</span>
      </div>
    );

  const ch = statusStyle(project.status);
  const techCount = (project.tech_stack || []).length;
  const goalCount = (project.goals || []).length;

  const startEdit = (field: string, value: string) => {
    setEditing(field);
    setEditVal(value);
  };
  const saveEdit = async (field: string) => {
    if (!editVal.trim()) {
      setEditing(null);
      return;
    }
    await api.updateProject(project.id, { [field]: editVal });
    setProject({ ...project, [field]: editVal });
    setEditing(null);
  };
  const cancelEdit = () => setEditing(null);

  return (
    <div className="pd-page">
      {/* ═══ Telemetry bar ═══ */}
      <div className="pd-telemetry">
        <div className="pd-telem-cell">
          <span className="pd-telem-label">
            <Hash size={11} /> PROJECT
          </span>
          <span className="pd-telem-value mono">
            {project.id?.slice(0, 8).toUpperCase()}
          </span>
        </div>
        <div className="pd-telem-cell">
          <span className="pd-telem-label" style={{ color: ch.color }}>
            <FolderKanban size={11} /> STATUS
          </span>
          <span className="pd-telem-value mono" style={{ color: ch.color }}>
            {ch.label}
          </span>
        </div>
        <div className="pd-telem-cell">
          <span className="pd-telem-label">
            <GitBranch size={11} /> RELATIONS
          </span>
          <span className="pd-telem-value mono">
            {String(relations.length).padStart(3, "0")}
          </span>
        </div>
        <div className="pd-telem-cell">
          <span className="pd-telem-label">
            <FileOutput size={11} /> OUTPUTS
          </span>
          <span className="pd-telem-value mono">
            {String(outputs.length).padStart(3, "0")}
          </span>
        </div>
        <div className="pd-telem-spacer" />
        <div className="pd-telem-cell">
          <span className="pd-telem-label">
            <Clock size={11} /> UPTIME
          </span>
          <span className="pd-telem-value mono">
            {relTime(project.last_activity || project.updated_at)}
          </span>
        </div>
        <div className="pd-telem-cell">
          <span className="pd-telem-label">SIGNAL</span>
          <span
            className="pd-telem-value mono"
            style={{ color: "var(--success)" }}
          >
            LOCKED
          </span>
        </div>
      </div>

      {/* ═══ Back nav ═══ */}
      <Link to="/projects" className="pd-back">
        <ArrowLeft size={13} />
        <span className="mono">BACK · PROJECT INDEX</span>
      </Link>

      {/* ═══ Header card with status rail ═══ */}
      <div className="pd-header-card" style={{ "--ch": ch.color } as any}>
        <div className="pd-header-rail" />
        <div className="pd-header-body">
          {/* Name */}
          <div className="pd-header-head">
            <span className="pd-header-index mono">
              PRJ{project.id?.slice(0, 3).toUpperCase()}
            </span>
            <span className="pd-header-channel mono" style={{ color: ch.color }}>
              · {ch.code}
            </span>
            <span className="pd-header-status mono" style={{ color: ch.color }}>
              {ch.label}
            </span>
          </div>

          {editing === "name" ? (
            <div className="pd-edit-row">
              <input
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                className="pd-edit-input"
                autoFocus
              />
              <button onClick={() => saveEdit("name")} className="icon-btn">
                <Check size={14} />
              </button>
              <button onClick={cancelEdit} className="icon-btn">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="pd-title-row">
              <h1 className="pd-title">{project.name}</h1>
              <button
                onClick={() => startEdit("name", project.name)}
                className="icon-btn"
                title="编辑名称"
              >
                <Edit3 size={12} />
              </button>
            </div>
          )}

          {/* Path + status pill */}
          <div className="pd-path-row">
            <MapPin size={11} style={{ color: "var(--muted)" }} />
            <span className="mono pd-path-text">{project.path}</span>
          </div>
        </div>
      </div>

      {/* ═══ Meta grid ═══ */}
      <div className="pd-meta-grid">
        {/* Description */}
        <div className="pd-meta-card">
          <div className="pd-meta-label">
            <Layers size={11} /> DESCRIPTION
          </div>
          {editing === "description" ? (
            <div className="pd-edit-col">
              <textarea
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                className="pd-edit-textarea"
                rows={3}
                autoFocus
              />
              <div className="pd-edit-actions">
                <button
                  onClick={() => saveEdit("description")}
                  className="icon-btn"
                >
                  <Check size={14} />
                </button>
                <button onClick={cancelEdit} className="icon-btn">
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="pd-desc-body">
              <p
                className="pd-desc-text"
                style={{
                  color: project.description ? "var(--text)" : "var(--muted)",
                }}
              >
                {project.description || "NO DESCRIPTION ON FILE"}
              </p>
              <button
                onClick={() =>
                  startEdit("description", project.description || "")
                }
                className="icon-btn"
                title="编辑"
              >
                <Edit3 size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Tech Stack */}
        <div className="pd-meta-card">
          <div className="pd-meta-label">
            <Cpu size={11} /> TECH STACK ·{" "}
            <span className="mono">{String(techCount).padStart(2, "0")}</span>
          </div>
          <div className="pd-tech-list">
            {(project.tech_stack || []).length > 0 ? (
              (project.tech_stack || []).map((t: string) => (
                <span key={t} className="tech-badge mono">
                  {t}
                </span>
              ))
            ) : (
              <span className="mono pd-empty">NOT DETECTED</span>
            )}
          </div>
        </div>

        {/* Goals */}
        <div className="pd-meta-card">
          <div className="pd-meta-label">
            <Target size={11} /> GOALS ·{" "}
            <span className="mono">{String(goalCount).padStart(2, "0")}</span>
          </div>
          {(project.goals || []).length > 0 ? (
            <div className="pd-goals-list">
              {(project.goals || []).map((g: string, i: number) => (
                <div key={i} className="pd-goal-item">
                  <span className="pd-goal-index mono">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="pd-goal-dash">╌</span>
                  <span className="pd-goal-text">{g}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="mono pd-empty">NO GOALS SET</span>
          )}
        </div>

        {/* Timestamps */}
        <div className="pd-meta-card">
          <div className="pd-meta-label">
            <Clock size={11} /> TIMELINE
          </div>
          <div className="pd-time-list">
            <div className="pd-time-row">
              <span className="pd-time-key mono">CREATED</span>
              <span className="pd-time-val">
                {new Date(project.created_at).toLocaleString("zh-CN")}
              </span>
            </div>
            <div className="pd-time-row">
              <span className="pd-time-key mono">UPDATED</span>
              <span className="pd-time-val">
                {new Date(project.updated_at).toLocaleString("zh-CN")}
              </span>
            </div>
            {project.last_activity && (
              <div className="pd-time-row">
                <span className="pd-time-key mono">ACTIVE</span>
                <span className="pd-time-val">
                  {new Date(project.last_activity).toLocaleString("zh-CN")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Relations ═══ */}
      <section className="pd-section">
        <h3 className="pd-section-title">
          RELATIONS
          <span className="pd-section-count mono">
            {String(relations.length).padStart(3, "0")}
          </span>
        </h3>
        {relations.length === 0 ? (
          <div className="pd-section-empty">
            <span className="mono">NO LINKED PROJECTS</span>
          </div>
        ) : (
          <div className="pd-relations-list">
            {relations.map((r: any) => (
              <div key={r.id} className="pd-relation-row">
                <span className="pd-rel-id mono">
                  {r.target_id?.slice(0, 8) || r.id?.slice(0, 8)}
                </span>
                <span className="type-badge type-context">
                  {r.relation_type}
                </span>
                {r.description && (
                  <span className="pd-rel-desc">{r.description}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ Outputs ═══ */}
      <section className="pd-section">
        <h3 className="pd-section-title">
          OUTPUTS
          <span className="pd-section-count mono">
            {String(outputs.length).padStart(3, "0")}
          </span>
        </h3>
        {outputs.length === 0 ? (
          <div className="pd-section-empty">
            <span className="mono">NO OUTPUTS RECORDED</span>
          </div>
        ) : (
          <div className="pd-outputs-list">
            {outputs.slice(0, 10).map((o: any) => (
              <div key={o.id} className="pd-output-row">
                <span className={`pd-output-source mono source-${o.source}`}>
                  {o.source}
                </span>
                <span className={`type-badge type-${o.direction}`}>
                  {DIR_LABEL[o.direction] || o.direction}
                </span>
                <span className="pd-output-title">{o.title}</span>
                <span className="pd-output-time mono">
                  {new Date(o.created_at).toLocaleDateString("zh-CN")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
