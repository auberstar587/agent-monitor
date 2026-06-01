import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { FolderKanban, Plus, Trash2, MapPin } from "lucide-react";

export default function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const load = () => api.listProjects().then(setProjects);

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!path) return;
    await api.registerProject(path, name || undefined);
    setPath("");
    setName("");
    setShowAdd(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除这个项目？此操作无法撤销。")) return;
    await api.deleteProject(id);
    load();
  };

  return (
    <div>
      {/* Actions */}
      <div className="flex items-center justify-end">
        <button className="button button-primary" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={14} />
          注册项目
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="content-card mb-5 p-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              placeholder="项目路径（如 /Users/xxx/AI/project）"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="form-input col-span-2 text-sm px-3 py-2"
            />
            <input
              type="text"
              placeholder="名称（留空自动检测）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input text-sm px-3 py-2"
            />
            <button onClick={handleAdd} className="button button-primary">
              注册
            </button>
          </div>
        </div>
      )}

      {/* Project List */}
      {projects.length === 0 ? (
        <div className="empty-state">
          <FolderKanban size={32} style={{ color: "var(--muted)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>暂无项目</p>
            <p className="text-xs mt-1">点击上方「注册项目」添加你的第一个项目</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id} className="list-row cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--accent-soft)", border: "1px solid rgba(18,215,255,0.15)" }}
              >
                <FolderKanban size={16} style={{ color: "var(--accent)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{p.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <MapPin size={10} style={{ color: "var(--muted)" }} />
                  <span className="text-[11px] mono truncate" style={{ color: "var(--muted)" }}>
                    {p.path}
                  </span>
                </div>
                {p.tech_stack?.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {p.tech_stack.map((t: string) => (
                      <span key={t} className="tech-badge">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <span className={`status-pill status-${p.status}`}>
                {p.status === "active" ? "活跃" :
                 p.status === "paused" ? "暂停" : "归档"}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                className="icon-btn danger"
                title="删除"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
