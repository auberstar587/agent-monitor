import { useEffect } from "react";
import { useStore } from "../stores";
import { Link } from "react-router-dom";
import { Bot } from "lucide-react";

export default function Agents() {
  const { agents, fetchAgents } = useStore();

  useEffect(() => { fetchAgents(); }, []);

  const onlineCount = agents.filter((a: any) => a.status !== "offline").length;

  const handleClick = (id: string) => {
    window.location.href = `/agents/${id}`;
  };

  return (
    <div>
      {agents.length === 0 ? (
        <div className="empty-state">
          <Bot size={32} style={{ color: "var(--muted)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>暂无 Agent</p>
            <p className="text-xs mt-1">Agent 会随 Adapter 配置自动出现</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {agents.map((agent: any) => (
            <Link key={agent.id} to={`/agents/${agent.id}`} className="content-card p-4 no-underline block hover:border-[var(--line-strong)] transition-colors">
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--brand-soft)", border: "1px solid rgba(167,139,250,0.15)" }}
                >
                  <Bot size={18} style={{ color: "var(--brand)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{agent.name}</p>
                  <span className={`status-pill status-${agent.status}`}>
                    {agent.status === "online" ? "在线" :
                     agent.status === "busy" ? "忙碌" : "离线"}
                  </span>
                </div>
              </div>

              {/* Info Grid */}
              <div
                className="grid grid-cols-2 gap-3 pt-3 border-t"
                style={{ borderColor: "var(--line)" }}
              >
                <div>
                  <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--muted)" }}>平台</p>
                  <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{agent.platform}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--muted)" }}>角色</p>
                  <p className="text-xs font-medium capitalize" style={{ color: "var(--text-secondary)" }}>{agent.role}</p>
                </div>
                {agent.currentTaskId && (
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--muted)" }}>当前任务</p>
                    <p className="text-xs mono truncate" style={{ color: "var(--accent)" }}>{agent.currentTaskId}</p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
