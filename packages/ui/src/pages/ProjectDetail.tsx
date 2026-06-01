import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowLeft, MapPin, Edit3, Check, X, FolderKanban } from "lucide-react";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [relations, setRelations] = useState<any[]>([]);
  const [outputs, setOutputs] = useState<any[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

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

  if (!project) return <div className="p-6 text-sm" style={{ color: "var(--muted)" }}>加载中...</div>;

  const startEdit = (field: string, value: string) => {
    setEditing(field);
    setEditVal(value);
  };

  const saveEdit = async (field: string) => {
    if (!editVal.trim()) { setEditing(null); return; }
    await api.updateProject(project.id, { [field]: editVal });
    setProject({ ...project, [field]: editVal });
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  return (
    <div className="p-6 max-w-4xl">
      <Link to="/projects" className="flex items-center gap-1 text-xs mb-4" style={{ color: "var(--muted)" }}>
        <ArrowLeft size={14} /> 返回项目列表
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-soft)" }}>
          <FolderKanban size={16} style={{ color: "var(--accent)" }} />
        </div>
        <div className="flex-1">
          {editing === "name" ? (
            <div className="flex items-center gap-1">
              <input value={editVal} onChange={(e) => setEditVal(e.target.value)}
                className="config-input text-sm font-semibold" style={{ width: 300 }} autoFocus />
              <button onClick={() => saveEdit("name")} className="icon-btn"><Check size={14} /></button>
              <button onClick={cancelEdit} className="icon-btn"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="page-title">{project.name}</h1>
              <button onClick={() => startEdit("name", project.name)} className="icon-btn" title="编辑名称">
                <Edit3 size={12} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <MapPin size={11} style={{ color: "var(--muted)" }} />
            <span className="text-xs" style={{ color: "var(--muted)" }}>{project.path}</span>
            <span className={`status-pill status-${project.status === 'active' ? 'active' : 'paused'}`}>
              {project.status === 'active' ? '活跃' : project.status}
            </span>
          </div>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="content-card p-4">
          <div className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color: "var(--muted)" }}>描述</div>
          {editing === "description" ? (
            <div className="flex items-start gap-1">
              <textarea value={editVal} onChange={(e) => setEditVal(e.target.value)}
                className="config-input text-xs" rows={3} autoFocus />
              <button onClick={() => saveEdit("description")} className="icon-btn mt-1"><Check size={14} /></button>
              <button onClick={cancelEdit} className="icon-btn mt-1"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="text-sm" style={{ color: project.description ? "var(--text)" : "var(--muted)" }}>
                {project.description || "暂无描述"}
              </p>
              <button onClick={() => startEdit("description", project.description || "")} className="icon-btn shrink-0" title="编辑">
                <Edit3 size={12} />
              </button>
            </div>
          )}
        </div>
        <div className="content-card p-4">
          <div className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color: "var(--muted)" }}>技术栈</div>
          <div className="flex flex-wrap gap-1.5">
            {(project.tech_stack || []).map((t: string) => (
              <span key={t} className="tech-badge">{t}</span>
            ))}
            {(project.tech_stack || []).length === 0 && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>未检测到</span>
            )}
          </div>
        </div>
        <div className="content-card p-4">
          <div className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color: "var(--muted)" }}>目标</div>
          {(project.goals || []).length > 0 ? (
            <ul className="text-xs space-y-1" style={{ color: "var(--text-secondary)" }}>
              {(project.goals || []).map((g: string, i: number) => <li key={i}>• {g}</li>)}
            </ul>
          ) : (
            <span className="text-xs" style={{ color: "var(--muted)" }}>暂无目标</span>
          )}
        </div>
        <div className="content-card p-4">
          <div className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color: "var(--muted)" }}>时间</div>
          <div className="text-xs space-y-1" style={{ color: "var(--text-secondary)" }}>
            <div>创建: {new Date(project.created_at).toLocaleString("zh-CN")}</div>
            <div>更新: {new Date(project.updated_at).toLocaleString("zh-CN")}</div>
            {project.last_activity && <div>活跃: {new Date(project.last_activity).toLocaleString("zh-CN")}</div>}
          </div>
        </div>
      </div>

      {/* Relations */}
      <div className="mb-6">
        <h3 className="section-title mb-3">项目关系 ({relations.length})</h3>
        {relations.length === 0 ? (
          <div className="text-xs" style={{ color: "var(--muted)" }}>暂无关联项目</div>
        ) : (
          <div className="space-y-1.5">
            {relations.map((r: any) => (
              <div key={r.id} className="list-row">
                <span className="text-xs" style={{ color: "var(--text)" }}>{r.target_id?.slice(0, 8) || r.id?.slice(0, 8)}</span>
                <span className="type-badge type-context">{r.relation_type}</span>
                {r.description && <span className="text-xs" style={{ color: "var(--muted)" }}>{r.description}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Outputs */}
      <div>
        <h3 className="section-title mb-3">最近输出 ({outputs.length})</h3>
        {outputs.length === 0 ? (
          <div className="text-xs" style={{ color: "var(--muted)" }}>暂无输出</div>
        ) : (
          <div className="space-y-1.5">
            {outputs.slice(0, 10).map((o: any) => (
              <div key={o.id} className="list-row">
                <span className={`text-xs font-semibold source-${o.source}`}>{o.source}</span>
                <span className={`type-badge type-${o.direction}`}>
                  {({analysis:"分析",implementation:"实现",decision:"决策",review:"审查",question:"提问"} as Record<string, string>)[o.direction] || o.direction}
                </span>
                <span className="text-sm flex-1 truncate" style={{ color: "var(--text)" }}>{o.title}</span>
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {new Date(o.created_at).toLocaleDateString("zh-CN")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


