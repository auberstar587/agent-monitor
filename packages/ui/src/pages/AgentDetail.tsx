import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowLeft, Edit3, Check, X, Bot, Activity } from "lucide-react";

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  useEffect(() => {
    if (!id) return;
    setError(null);
    api.getAgent(id)
      .then(setAgent)
      .catch((err) => {
        const msg = err?.message || String(err);
        if (/400|invalid id/i.test(msg)) {
          setError("Agent ID 格式无效");
        } else if (/404|not found/i.test(msg)) {
          setError(`Agent "${id}" 不存在`);
        } else {
          setError(`加载失败: ${msg}`);
        }
      });
  }, [id]);

  if (error) {
    return (
      <div className="p-6 max-w-4xl">
        <Link to="/agents" className="flex items-center gap-1 text-xs mb-4" style={{ color: "var(--muted)" }}>
          <ArrowLeft size={14} /> 返回 Agent 列表
        </Link>
        <div className="text-sm" style={{ color: "var(--danger)" }}>{error}</div>
        <button
          onClick={() => { setError(null); setAgent(null); api.getAgent(id!).then(setAgent).catch(() => {}); }}
          className="mt-3 config-input text-xs"
        >
          重试
        </button>
      </div>
    );
  }

  if (!agent) return <div className="p-6 text-sm" style={{ color: "var(--muted)" }}>加载中...</div>;

  const startEdit = (field: string, value: string) => {
    setEditing(field);
    setEditVal(value);
  };

  const saveEdit = async (field: string) => {
    if (!editVal.trim()) { setEditing(null); return; }
    await api.updateAgent(id!, { [field]: editVal });
    setAgent({ ...agent, [field]: editVal });
    setEditing(null);
  };

  const quality = agent.quality || {};
  const totalOps = (quality.successCount || 0) + (quality.failCount || 0);
  const successRate = totalOps > 0 ? Math.round((quality.successCount / totalOps) * 100) : 0;

  return (
    <div className="p-6 max-w-4xl">
      <Link to="/agents" className="flex items-center gap-1 text-xs mb-4" style={{ color: "var(--muted)" }}>
        <ArrowLeft size={14} /> 返回 Agent 列表
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{
          background: agent.status === 'online' || agent.status === 'busy' ? "var(--success-bg)" : "rgba(110,116,144,0.08)",
        }}>
          <Bot size={16} style={{ color: agent.status === 'online' || agent.status === 'busy' ? "var(--success)" : "var(--muted)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {editing === "name" ? (
              <div className="flex items-center gap-1">
                <input value={editVal} onChange={(e) => setEditVal(e.target.value)}
                  className="config-input text-sm font-semibold" style={{ width: 200 }} autoFocus />
                <button onClick={() => saveEdit("name")} className="icon-btn"><Check size={14} /></button>
                <button onClick={() => setEditing(null)} className="icon-btn"><X size={14} /></button>
              </div>
            ) : (
              <>
                <h1 className="page-title truncate">{agent.name}</h1>
                <button onClick={() => startEdit("name", agent.name)} className="icon-btn"><Edit3 size={12} /></button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`status-pill ${agent.status === 'online' || agent.status === 'busy' ? 'status-' + agent.status : 'status-offline'}`}>
              {agent.status === 'online' ? '在线' : agent.status === 'busy' ? '忙碌' : agent.status === 'offline' ? '离线' : agent.status}
            </span>
            <span className="tech-badge">{agent.platform}</span>
            {editing === "role" ? (
              <div className="flex items-center gap-1">
                <input value={editVal} onChange={(e) => setEditVal(e.target.value)}
                  className="config-input text-xs" style={{ width: 120 }} autoFocus />
                <button onClick={() => saveEdit("role")} className="icon-btn"><Check size={12} /></button>
                <button onClick={() => setEditing(null)} className="icon-btn"><X size={12} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{agent.role}</span>
                <button onClick={() => startEdit("role", agent.role)} className="icon-btn"><Edit3 size={10} /></button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quality cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="metric-card">
          <Activity size={14} style={{ color: "var(--accent)" }} className="mb-1" />
          <p className="text-xl font-semibold" style={{ color: "var(--text)" }}>{totalOps}</p>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>总执行次数</p>
        </div>
        <div className="metric-card">
          <p className="text-xl font-semibold" style={{ color: "var(--success)" }}>{successRate}%</p>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>成功率</p>
        </div>
        <div className="metric-card">
          <p className="text-xl font-semibold" style={{ color: "var(--text)" }}>{quality.successCount || 0}</p>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>成功次数</p>
        </div>
        <div className="metric-card">
          <p className="text-xl font-semibold" style={{ color: quality.failCount > 0 ? "var(--danger)" : "var(--text)" }}>{quality.failCount || 0}</p>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>失败次数</p>
        </div>
      </div>

      {/* Traces */}
      <div>
        <h3 className="section-title mb-3">最近执行记录 ({agent.traces?.length || 0})</h3>
        {(!agent.traces || agent.traces.length === 0) ? (
          <div className="text-xs" style={{ color: "var(--muted)" }}>暂无执行记录</div>
        ) : (
          <div className="space-y-1.5">
            {agent.traces.map((t: any) => (
              <Link key={t.id} to={`/traces/${t.task_id}`} className="list-row no-underline cursor-pointer">
                <span className={`status-pill ${t.status === 'completed' ? 'status-succeeded' : t.status === 'failed' ? 'status-failed' : 'status-running'}`}>
                  {t.status === 'completed' ? '成功' : t.status === 'failed' ? '失败' : t.status === 'running' ? '运行中' : t.status}
                </span>
                <span className="text-sm flex-1 truncate" style={{ color: "var(--text)" }}>{t.title || t.task_id}</span>
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                  {t.input_tokens + t.output_tokens > 0 ? `${t.input_tokens + t.output_tokens} tokens` : ""}
                </span>
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                  {new Date(t.created_at).toLocaleDateString("zh-CN")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
