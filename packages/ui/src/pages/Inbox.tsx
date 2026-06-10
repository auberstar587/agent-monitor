import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  Inbox as InboxIcon,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  XCircle,
  Shield,
  ArrowRightLeft,
  Eye,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  ClipboardList,
  UserCheck,
  ExternalLink,
  Radio,
  Filter,
} from "lucide-react";

/* ═══ 类型 & 常量 ══════════════════════════════════════════ */

interface InboxItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  project_id?: string;
  task_id?: string;
  agent_id?: string;
  source?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

const TYPE_LABELS: Record<string, string> = {
  decision_required: "决策请求",
  permission_request: "权限请求",
  blocked_task: "阻塞任务",
  review_request: "审查请求",
  failed_task: "失败任务",
  handoff_needed: "需交接",
};

const TYPE_COLORS: Record<string, string> = {
  decision_required: "var(--warning)",
  permission_request: "var(--info)",
  blocked_task: "var(--danger)",
  review_request: "var(--accent)",
  failed_task: "var(--danger)",
  handoff_needed: "var(--muted)",
};

const TYPE_ICONS: Record<string, any> = {
  failed_task: XCircle,
  blocked_task: AlertTriangle,
  decision_required: HelpCircle,
  review_request: Eye,
  permission_request: Shield,
  handoff_needed: ArrowRightLeft,
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "var(--danger)",
  high: "var(--warning)",
  medium: "var(--accent)",
  low: "var(--muted)",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  resolved: "已处理",
  approved: "已批准",
  rejected: "已拒绝",
};

const STATUS_PILLS: Record<string, string> = {
  pending: "status-queued",
  resolved: "status-succeeded",
  approved: "status-succeeded",
  rejected: "status-failed",
};

/* ═══ 动作定义 ══════════════════════════════════════════════ */

interface ActionDef {
  key: string;
  label: string;
  icon: any;
  color?: string;
  /** 用 resolveInbox 作为 fallback */
  action: "approve" | "reject" | "retry" | "resolve" | "link";
  /** 跳转路径模板，支持 :id */
  linkTo?: string;
  /** 功能未就绪时禁用 */
  disabled?: boolean;
  tooltip?: string;
}

function getActions(type: string): ActionDef[] {
  switch (type) {
    case "decision_required":
      return [
        { key: "approve", label: "批准", icon: ThumbsUp, color: "var(--success)", action: "approve" },
        { key: "reject", label: "拒绝", icon: ThumbsDown, color: "var(--danger)", action: "reject" },
        { key: "link", label: "打开任务", icon: ExternalLink, action: "link", linkTo: "/tasks/:task_id" },
      ];
    case "permission_request":
      return [
        { key: "approve", label: "允许", icon: ThumbsUp, color: "var(--success)", action: "approve" },
        { key: "reject", label: "拒绝", icon: ThumbsDown, color: "var(--danger)", action: "reject" },
      ];
    case "blocked_task":
      return [
        { key: "link", label: "打开任务", icon: ExternalLink, action: "link", linkTo: "/tasks/:task_id" },
        { key: "retry", label: "重试", icon: RotateCcw, color: "var(--warning)", action: "retry" },
        { key: "handoff", label: "交接", icon: ClipboardList, action: "resolve", disabled: true, tooltip: "功能开发中" },
      ];
    case "review_request":
      return [
        { key: "view", label: "查看产物", icon: Eye, action: "link", disabled: true, tooltip: "功能开发中" },
        { key: "approve", label: "接受", icon: ThumbsUp, color: "var(--success)", action: "approve" },
        { key: "reject", label: "要求修改", icon: ThumbsDown, color: "var(--warning)", action: "reject" },
      ];
    case "failed_task":
      return [
        { key: "link", label: "查看轨迹", icon: ExternalLink, action: "link", linkTo: "/traces/:task_id" },
        { key: "retry", label: "重试", icon: RotateCcw, color: "var(--warning)", action: "retry" },
        { key: "handoff", label: "交接", icon: ClipboardList, action: "resolve", disabled: true, tooltip: "功能开发中" },
      ];
    case "handoff_needed":
      return [
        { key: "view", label: "查看摘要", icon: Eye, action: "link", disabled: true, tooltip: "功能开发中" },
        { key: "assign", label: "分配 Agent", icon: UserCheck, action: "resolve", disabled: true, tooltip: "功能开发中" },
      ];
    default:
      return [
        { key: "resolve", label: "已处理", icon: CheckCircle, color: "var(--success)", action: "resolve" },
        { key: "link", label: "打开关联", icon: ExternalLink, action: "link", linkTo: "/tasks/:task_id" },
      ];
  }
}

/* ═══ 工具函数 ══════════════════════════════════════════════ */

function relTime(iso?: string) {
  if (!iso) return "--";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s 前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m 前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h 前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

/* ═══ 主组件 ══════════════════════════════════════════════ */
export default function Inbox() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  // 筛选状态
  const [filterStatus, setFilterStatus] = useState("pending");
  const [filterType, setFilterType] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  // 关联数据（名称映射）
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  // 加载关联数据
  useEffect(() => {
    api.listProjects().then((list: any[]) => setProjects(list.map((p: any) => ({ id: p.id, name: p.name })))).catch(() => {});
    api.listAgents().then((list: any[]) => setAgents(list.map((a: any) => ({ id: a.id, name: a.name })))).catch(() => {});
  }, []);

  // 加载 inbox 列表
  const loadItems = () => {
    setLoading(true);
    const statusParam = filterStatus || undefined;
    api.listInbox(statusParam)
      .then((list: any[]) => setItems(list))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadItems(); }, [filterStatus]);

  // 筛选后的列表
  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filterType && item.type !== filterType) return false;
      if (filterPriority && item.priority !== filterPriority) return false;
      return true;
    });
  }, [items, filterType, filterPriority]);

  // 选中项
  const selected = selectedId ? filtered.find((i) => i.id === selectedId) ?? null : null;

  // 统计
  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, resolved: 0, approved: 0, rejected: 0 };
    // counts 基于全量 items（不含 type/priority 筛选），只按 status 分
    for (const item of items) {
      const s = item.status || "pending";
      if (s in c) c[s]++;
      else c[s] = 1;
    }
    return c;
  }, [items]);

  /* ═══ 动作处理 ══════════════════════════════════════════ */

  const handleAction = async (item: InboxItem, action: ActionDef) => {
    if (action.disabled) return;
    setActing(action.key);
    try {
      switch (action.action) {
        case "approve":
          // TODO: 切换为 api.approveInbox(item.id) 后端就绪后
          await api.resolveInbox(item.id, "approved");
          break;
        case "reject":
          // TODO: 切换为 api.rejectInbox(item.id) 后端就绪后
          await api.resolveInbox(item.id, "rejected");
          break;
        case "retry":
          // TODO: 切换为 api.retryInbox(item.id) 后端就绪后
          await api.resolveInbox(item.id, "retry");
          break;
        case "resolve":
          await api.resolveInbox(item.id);
          break;
        case "link":
          // 链接类型不需要 API 调用，直接跳转
          break;
      }
      // 重新加载列表
      await loadItems();
      setSelectedId(null);
    } catch {
      // 错误静默处理
    } finally {
      setActing(null);
    }
  };

  const resolveLink = (template: string, item: InboxItem) => {
    return template
      .replace(":task_id", item.task_id || item.id)
      .replace(":project_id", item.project_id || "")
      .replace(":agent_id", item.agent_id || "");
  };

  /* ═══ 渲染 ══════════════════════════════════════════════ */

  return (
    <div className="tasks-page inbox-scroll">
      {/* ═══ Telemetry bar ═══ */}
      <div className="agents-telemetry">
        <div className="agents-telem-cell">
          <span className="agents-telem-label"><InboxIcon size={11} /> 全部</span>
          <span className="agents-telem-value mono">{String(items.length).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--warning)" }}><HelpCircle size={11} /> 待处理</span>
          <span className="agents-telem-value mono" style={{ color: "var(--warning)" }}>{String(counts.pending).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--success)" }}><CheckCircle size={11} /> 已处理</span>
          <span className="agents-telem-value mono" style={{ color: "var(--success)" }}>{String(counts.resolved + counts.approved).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--danger)" }}><XCircle size={11} /> 已拒绝</span>
          <span className="agents-telem-value mono" style={{ color: "var(--danger)" }}>{String(counts.rejected).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-spacer" />
      </div>

      {/* ═══ 筛选栏 ═══ */}
      <div className="projects-actions">
        <span className="projects-actions-meta">
          <span className="projects-actions-dot" />
          收件箱 · {filtered.length} 条事项
        </span>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="projects-add-input"
          style={{ width: 120, height: 28, fontSize: 11 }}
        >
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="resolved">已处理</option>
          <option value="approved">已批准</option>
          <option value="rejected">已拒绝</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="projects-add-input"
          style={{ width: 130, height: 28, fontSize: 11 }}
        >
          <option value="">全部类型</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="projects-add-input"
          style={{ width: 110, height: 28, fontSize: 11 }}
        >
          <option value="">全部优先级</option>
          {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {(filterType || filterPriority || filterStatus) && (
          <button
            type="button"
            onClick={() => { setFilterType(""); setFilterPriority(""); setFilterStatus(""); }}
            className="button"
            style={{ fontSize: 11, padding: "0 10px", height: 28 }}
          >
            清除筛选
          </button>
        )}
      </div>

      {/* ═══ 分栏主体 ═══ */}
      {loading ? (
        <div className="dashboard-feed-empty" style={{ minHeight: 200 }}>
          <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>加载中…</span>
        </div>
      ) : items.length === 0 && !filterStatus ? (
        /* 全部已处理 */
        <div className="agents-empty">
          <div className="agents-empty-grid" />
          <div className="agents-empty-body">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={14} style={{ color: "var(--success)" }} />
              <span className="agents-eyebrow">全部处理完毕</span>
            </div>
            <p className="agents-empty-title">所有事项已处理</p>
            <p className="agents-empty-sub">没有待处理的事项，一切正常</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, minHeight: 400 }}>
          {/* ─── 左列：事项列表 (40%) ─── */}
          <div style={{ width: "40%", flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.length === 0 ? (
              <div className="content-card" style={{ padding: "24px 16px", textAlign: "center" }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {filterStatus === "pending" ? "全部处理完毕，没有待处理的事项" : "没有匹配的事项"}
                </span>
              </div>
            ) : (
              filtered.map((item) => {
                const isSelected = selectedId === item.id;
                const priColor = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.low;
                const typeColor = TYPE_COLORS[item.type] || "var(--muted)";
                const proj = projects.find((p) => p.id === item.project_id);

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      display: "flex",
                      alignItems: "stretch",
                      gap: 0,
                      border: `1px solid ${isSelected ? "var(--accent-line)" : "var(--line)"}`,
                      borderRadius: "var(--radius-lg)",
                      background: isSelected ? "var(--accent-soft)" : "var(--bg-card)",
                      cursor: "pointer",
                      transition: "all 160ms var(--ease)",
                      overflow: "hidden",
                    }}
                  >
                    {/* 优先级色条 */}
                    <div style={{
                      width: 3,
                      flexShrink: 0,
                      background: priColor,
                      opacity: isSelected ? 1 : 0.6,
                    }} />
                    <div style={{ flex: 1, padding: "10px 14px", minWidth: 0 }}>
                      {/* 第一行：type badge + 优先级 */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="tech-badge" style={{
                          color: typeColor,
                          borderColor: typeColor,
                          background: "transparent",
                          fontSize: 12,
                          padding: "1px 6px",
                        }}>
                          {TYPE_LABELS[item.type] || item.type}
                        </span>
                        {item.priority && (
                          <span className="mono" style={{
                            fontSize: 9,
                            color: priColor,
                            letterSpacing: "0.08em",
                            fontWeight: 600,
                          }}>
                            {PRIORITY_LABELS[item.priority] || item.priority}
                          </span>
                        )}
                      </div>
                      {/* 第二行：标题 */}
                      <p className="text-[13px] font-medium" style={{
                        color: "var(--text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {item.title}
                      </p>
                      {/* 第三行：来源 + 时间 */}
                      <div className="flex items-center gap-3 mt-1" style={{ fontSize: 12, color: "var(--muted)" }}>
                        {proj && <span>📁 {proj.name}</span>}
                        {item.source && <span>{item.source}</span>}
                        <span style={{ marginLeft: "auto" }}>{relTime(item.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ─── 右列：详情 (60%) ─── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!selected ? (
              /* 空详情 */
              <div className="content-card" style={{
                padding: "48px 24px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 300,
              }}>
                <InboxIcon size={28} style={{ color: "var(--muted)", opacity: 0.4, marginBottom: 12 }} />
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  选择左侧事项查看详情
                </span>
              </div>
            ) : (
              <div className="content-card" style={{ padding: "20px 24px" }}>
                {/* 详情头部 */}
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="page-title" style={{ fontSize: 16, margin: 0 }}>{selected.title}</h2>
                </div>
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  {/* type badge */}
                  <span className="tech-badge" style={{
                    color: TYPE_COLORS[selected.type] || "var(--muted)",
                    borderColor: TYPE_COLORS[selected.type] || "var(--muted)",
                    background: "transparent",
                  }}>
                    {TYPE_LABELS[selected.type] || selected.type}
                  </span>
                  {/* priority */}
                  <span style={{
                    fontSize: 11,
                    color: PRIORITY_COLORS[selected.priority] || "var(--muted)",
                    fontWeight: 600,
                  }}>
                    {PRIORITY_LABELS[selected.priority] || selected.priority}
                  </span>
                  {/* status pill */}
                  <span className={`status-pill ${STATUS_PILLS[selected.status] || "status-queued"}`}>
                    {STATUS_LABELS[selected.status] || selected.status}
                  </span>
                </div>

                {/* 描述 */}
                {selected.description && (
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: "var(--muted)" }}>
                      描述
                    </div>
                    <p className="text-sm" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {selected.description}
                    </p>
                  </div>
                )}

                {/* 关联对象 */}
                {(selected.project_id || selected.task_id || selected.agent_id) && (
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: "var(--muted)" }}>
                      关联对象
                    </div>
                    <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 12 }}>
                      {selected.project_id && (() => {
                        const proj = projects.find((p) => p.id === selected.project_id);
                        return (
                          <Link
                            to={`/projects/${selected.project_id}`}
                            className="flex items-center gap-1"
                            style={{ color: "var(--accent)", textDecoration: "none" }}
                          >
                            📁 {proj?.name || selected.project_id}
                          </Link>
                        );
                      })()}
                      {selected.task_id && (
                        <Link
                          to={`/tasks/${selected.task_id}`}
                          className="flex items-center gap-1"
                          style={{ color: "var(--accent)", textDecoration: "none" }}
                        >
                          📋 任务 {selected.task_id.slice(0, 8)}
                        </Link>
                      )}
                      {selected.agent_id && (() => {
                        const agent = agents.find((a) => a.id === selected.agent_id);
                        return (
                          <span style={{ color: "var(--text-secondary)" }}>
                            🤖 {agent?.name || selected.agent_id}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* context / metadata */}
                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: "var(--muted)" }}>
                      上下文
                    </div>
                    <div style={{
                      background: "var(--paper-strong)",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 14px",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      whiteSpace: "pre-wrap",
                      color: "var(--text-secondary)",
                      maxHeight: 200,
                      overflowY: "auto",
                    }}>
                      {JSON.stringify(selected.metadata, null, 2)}
                    </div>
                  </div>
                )}

                {/* 元信息 */}
                <div className="mb-4" style={{ fontSize: 11, color: "var(--muted)" }}>
                  <div className="flex items-center gap-4">
                    <span>创建: {new Date(selected.created_at).toLocaleString("zh-CN")}</span>
                    {selected.updated_at && (
                      <span>更新: {new Date(selected.updated_at).toLocaleString("zh-CN")}</span>
                    )}
                    {selected.source && <span>来源: {selected.source}</span>}
                  </div>
                </div>

                {/* ═══ 动作按钮区 ═══ */}
                <div style={{
                  borderTop: "1px solid var(--line)",
                  paddingTop: 16,
                  marginTop: 8,
                }}>
                  {selected.status !== "pending" ? (
                    /* 已处理的事项显示处理结果 */
                    <div className="flex items-center gap-2">
                      <span className={`status-pill ${STATUS_PILLS[selected.status] || "status-succeeded"}`}>
                        {STATUS_LABELS[selected.status] || selected.status}
                      </span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        已处理
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {getActions(selected.type).map((act) => {
                        const Icon = act.icon;
                        const busy = acting === act.key;
                        const isLink = act.action === "link" && !act.disabled;

                        if (isLink && act.linkTo) {
                          return (
                            <Link
                              key={act.key}
                              to={resolveLink(act.linkTo, selected)}
                              className="button"
                              style={{
                                fontSize: 12,
                                textDecoration: "none",
                                borderColor: act.color || "var(--line)",
                                color: act.color || "var(--text-secondary)",
                              }}
                            >
                              <Icon size={13} /> {act.label}
                            </Link>
                          );
                        }

                        return (
                          <button
                            key={act.key}
                            type="button"
                            className="button"
                            disabled={act.disabled || busy}
                            title={act.tooltip}
                            onClick={() => handleAction(selected, act)}
                            style={{
                              fontSize: 12,
                              borderColor: act.color || "var(--line)",
                              color: act.disabled ? "var(--muted)" : act.color || "var(--text-secondary)",
                              opacity: act.disabled ? 0.5 : 1,
                              cursor: act.disabled ? "not-allowed" : "pointer",
                            }}
                          >
                            {busy ? (
                              <span className="mono" style={{ fontSize: 12 }}>...</span>
                            ) : (
                              <Icon size={13} />
                            )}
                            {act.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
