import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../stores";
import { Link } from "react-router-dom";
import {
  FolderKanban, Bot, Activity, Inbox, Brain,
  ArrowUpRight, Clock, Timer
} from "lucide-react";

export default function Dashboard() {
  const { projects, agents, outputs, inbox, fetchProjects, fetchAgents, fetchOutputs, fetchInbox } = useStore();
  const [memoryStats, setMemoryStats] = useState<any>(null);
  const [scheduled, setScheduled] = useState<any[]>([]);

  useEffect(() => {
    fetchProjects();
    fetchAgents();
    fetchOutputs();
    fetchInbox();
    import("../lib/api").then(({ api }) => {
      api.memoryStats().then(setMemoryStats);
      api.listScheduled().then(setScheduled);
    });
  }, []);

  const activeAgents = agents.filter((a: any) => a.status !== "offline").length;
  const pendingInbox = inbox.filter((i: any) => i.status === "pending").length;

  const stats = [
    { label: "项目", value: projects.length, icon: FolderKanban, color: "var(--accent)", bg: "var(--accent-soft)", link: "/projects" },
    { label: "活跃 Agents", value: `${activeAgents}/${agents.length}`, icon: Bot, color: "var(--success)", bg: "var(--success-bg)", link: "/agents" },
    { label: "输出总数", value: outputs.length, icon: Activity, color: "var(--brand)", bg: "var(--brand-soft)", link: "/outputs" },
    { label: "待处理", value: pendingInbox, icon: Inbox, color: pendingInbox > 0 ? "var(--danger)" : "var(--muted)", bg: pendingInbox > 0 ? "var(--danger-bg)" : "rgba(110,116,144,0.08)", link: "/inbox" },
  ];

  return (
    <div>
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {stats.map(({ label, value, icon: Icon, color, bg, link }) => (
          <Link key={label} to={link} className="metric-card group no-underline">
            <div className="flex items-center justify-between mb-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: bg, border: `1px solid ${color}22` }}
              >
                <Icon size={16} style={{ color }} />
              </div>
              <ArrowUpRight
                size={14}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--muted)" }}
              />
            </div>
            <p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{value}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{label}</p>
          </Link>
        ))}
        {/* Memory stat card */}
        <Link to="/memory" className="metric-card group no-underline">
          <div className="flex items-center justify-between mb-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "var(--brand-soft)", border: "1px solid rgba(167,139,250,0.13)" }}
            >
              <Brain size={16} style={{ color: "var(--brand)" }} />
            </div>
            <ArrowUpRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--muted)" }} />
          </div>
          <p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
            {memoryStats ? memoryStats.active : "—"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            记忆 · {memoryStats ? `平均 ${memoryStats.avgImportance}/10` : "加载中"}
          </p>
        </Link>
      </div>

      {/* Two-column: Recent Outputs + Agents */}
      <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)" }}>
        {/* Recent Outputs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title">最近输出</h3>
            <Link to="/outputs" className="text-xs flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
              查看全部 <ArrowUpRight size={10} />
            </Link>
          </div>
          <div className="content-card overflow-hidden">
            {outputs.length === 0 ? (
              <div className="empty-state" style={{ minHeight: "120px" }}>
                <Activity size={24} style={{ color: "var(--muted)" }} />
                <span className="text-sm">暂无输出</span>
              </div>
            ) : (
              outputs.slice(0, 8).map((o: any) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 px-4 border-b last:border-0 transition-colors"
                  style={{
                    borderColor: "var(--line)",
                    minHeight: "42px",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-raised)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <span className={`text-xs font-semibold w-20 truncate source-${o.source}`}>
                    {o.source}
                  </span>
                  <span className={`type-badge type-${o.direction}`}>
                    {({analysis:"分析",implementation:"实现",decision:"决策",review:"审查",question:"提问"} as Record<string,string>)[o.direction] || o.direction}
                  </span>
                  <span className="text-[13px] flex-1 truncate" style={{ color: "var(--text)" }}>
                    {o.title}
                  </span>
                  <span className="text-[11px] mono shrink-0 flex items-center gap-1" style={{ color: "var(--muted)" }}>
                    <Clock size={10} />
                    {formatRelativeTime(o.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Agent Status */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title">Agent 状态</h3>
            <Link to="/agents" className="text-xs flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
              查看全部 <ArrowUpRight size={10} />
            </Link>
          </div>
          <div className="space-y-2">
            {agents.length === 0 ? (
              <div className="empty-state" style={{ minHeight: "120px" }}>
                <Bot size={24} style={{ color: "var(--muted)" }} />
                <span className="text-sm">暂无 Agent</span>
              </div>
            ) : (
              agents.map((agent: any) => (
                <Link
                  key={agent.id}
                  to="/agents"
                  className="list-row no-underline"
                >
                  <span className={`status-pill status-${agent.status}`}>
                    {agent.status === "online" ? "在线" :
                     agent.status === "busy" ? "忙碌" : "离线"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>{agent.name}</p>
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>{agent.platform} · {agent.role}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Scheduled tasks */}
      {scheduled.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-3">
            <Timer size={14} style={{ color: "var(--accent)" }} />
            <h3 className="section-title">定时任务</h3>
          </div>
          <div className="space-y-1.5">
            {scheduled.map((s: any) => (
              <div key={s.id} className="list-row">
                <span className="status-pill status-running">定时</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm" style={{ color: "var(--text)" }}>{s.blueprintName}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>{s.cronExpression}</span>
                </div>
                <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                  下次: {s.nextRun ? new Date(s.nextRun).toLocaleString("zh-CN") : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}
