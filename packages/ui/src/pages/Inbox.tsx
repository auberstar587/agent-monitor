import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Inbox as InboxIcon, CheckCircle, AlertTriangle, HelpCircle, XCircle, Shield } from "lucide-react";

const TYPE_ICONS: Record<string, any> = {
  failed_task: XCircle,
  blocked_task: AlertTriangle,
  decision_required: HelpCircle,
  review_request: CheckCircle,
  approval: Shield,
  handoff_needed: CheckCircle,
};

const TYPE_LABELS: Record<string, string> = {
  failed_task: "任务失败",
  blocked_task: "任务阻塞",
  decision_required: "需要决策",
  review_request: "审查请求",
  approval: "审批请求",
  handoff_needed: "需要交接",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

export default function Inbox() {
  const [items, setItems] = useState<any[]>([]);

  const load = () => api.listInbox("pending").then(setItems);

  useEffect(() => { load(); }, []);

  const handleResolve = async (id: string) => {
    await api.resolveInbox(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{ background: "var(--success-bg)", border: "1px solid rgba(52,211,153,0.2)" }}
          >
            <CheckCircle size={28} style={{ color: "var(--success)" }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>全部处理完毕</p>
            <p className="text-xs mt-1">没有待处理的事项，一切正常</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-w-3xl">
          {items.map((item) => {
            const Icon = TYPE_ICONS[item.type] ?? InboxIcon;
            const isError = item.type === "failed_task";
            return (
              <div key={item.id} className="list-row items-start">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: isError ? "var(--danger-bg)" : "var(--warning-bg)",
                    border: `1px solid ${isError ? "rgba(251,113,133,0.2)" : "rgba(251,191,36,0.2)"}`,
                  }}
                >
                  <Icon size={16} style={{ color: isError ? "var(--danger)" : "var(--warning)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    {item.priority && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                        style={{
                          color: item.priority === "urgent" ? "var(--danger)" : "var(--text-secondary)",
                          background: item.priority === "urgent" ? "var(--danger-bg)" : "var(--paper-raised)",
                          border: `1px solid ${item.priority === "urgent" ? "rgba(251,113,133,0.2)" : "var(--line)"}`,
                        }}
                      >
                        {PRIORITY_LABELS[item.priority] || item.priority}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{item.title}</p>
                  {item.description && (
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{item.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleResolve(item.id)}
                  className="button shrink-0"
                >
                  <CheckCircle size={12} />
                  处理
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
