import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  Activity, CheckCircle, XCircle, Clock, Send, FileText,
  Code, TestTube, Search, Bot, FolderOpen, Radio, FileCheck,
} from "lucide-react";

/* ═══ 常量映射 ════════════════════════════════════════════ */
const TYPE_LABELS: Record<string, string> = {
  code: "代码", document: "文档", analysis: "分析",
  test_result: "测试结果", review: "审查",
};
const TYPE_ICONS: Record<string, typeof Code> = {
  code: Code, document: FileText, analysis: Activity,
  test_result: TestTube, review: Search,
};
const STATUS_LABELS: Record<string, string> = {
  draft: "草稿", submitted: "待审查", accepted: "已接受", rejected: "已退回",
};
const STATUS_CFG: Record<string, { pill: string; color: string }> = {
  draft:     { pill: "status-queued",    color: "var(--muted)" },
  submitted: { pill: "status-running",   color: "var(--info)" },
  accepted:  { pill: "status-succeeded", color: "var(--success)" },
  rejected:  { pill: "status-failed",    color: "var(--danger)" },
};

/* ═══ 工具函数 ════════════════════════════════════════════ */
function relTime(iso?: string) {
  if (!iso) return "--";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s 前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m 前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h 前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

/* ═══ 主组件 ══════════════════════════════════════════════ */
export default function Artifacts() {
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  // 筛选
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterProject, setFilterProject] = useState("");

  // 关联数据
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  // 加载关联列表
  useEffect(() => {
    api.listProjects().then((list: any[]) => setProjects(list.map((p: any) => ({ id: p.id, name: p.name })))).catch(() => {});
    api.listAgents().then((list: any[]) => setAgents(list.map((a: any) => ({ id: a.id, name: a.name })))).catch(() => {});
  }, []);

  // 加载 Artifact 列表
  const load = useCallback(() => {
    setLoading(true);
    const f: Record<string, string> = {};
    if (filterStatus) f.status = filterStatus;
    if (filterType) f.artifact_type = filterType;
    if (filterProject) f.project_id = filterProject;
    api.listArtifacts(Object.keys(f).length > 0 ? f : undefined)
      .then((list: any[]) => setArtifacts(list))
      .catch(() => setArtifacts([]))
      .finally(() => setLoading(false));
  }, [filterStatus, filterType, filterProject]);

  useEffect(() => { load(); }, [load]);

  // 快捷操作
  const handleAction = async (id: string, action: "submit" | "accept") => {
    setActing(id + action);
    try {
      if (action === "submit") await api.submitArtifact(id);
      else await api.acceptArtifact(id);
      await load();
    } catch { /* 静默 */ }
    setActing(null);
  };

  // 统计
  const counts = {
    total: artifacts.length,
    draft: artifacts.filter((a) => a.status === "draft").length,
    submitted: artifacts.filter((a) => a.status === "submitted").length,
    accepted: artifacts.filter((a) => a.status === "accepted").length,
    rejected: artifacts.filter((a) => a.status === "rejected").length,
  };

  return (
    <div className="tasks-page">
      {/* ═══ Telemetry bar ═══ */}
      <div className="agents-telemetry">
        <div className="agents-telem-cell">
          <span className="agents-telem-label"><Activity size={11} /> 全部</span>
          <span className="agents-telem-value mono">{String(counts.total).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--muted)" }}><Clock size={11} /> 草稿</span>
          <span className="agents-telem-value mono" style={{ color: "var(--muted)" }}>{String(counts.draft).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--info)" }}><Send size={11} /> 待审查</span>
          <span className="agents-telem-value mono" style={{ color: "var(--info)" }}>{String(counts.submitted).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--success)" }}><CheckCircle size={11} /> 已接受</span>
          <span className="agents-telem-value mono" style={{ color: "var(--success)" }}>{String(counts.accepted).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-cell">
          <span className="agents-telem-label" style={{ color: "var(--danger)" }}><XCircle size={11} /> 已退回</span>
          <span className="agents-telem-value mono" style={{ color: "var(--danger)" }}>{String(counts.rejected).padStart(3, "0")}</span>
        </div>
        <div className="agents-telem-spacer" />
      </div>

      {/* ═══ 筛选栏 ═══ */}
      <div className="projects-actions">
        <span className="projects-actions-meta">
          <span className="projects-actions-dot" />
          产出物 · {artifacts.length} 条记录
        </span>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="projects-add-input" style={{ width: 120, height: 28, fontSize: 11 }}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="projects-add-input" style={{ width: 120, height: 28, fontSize: 11 }}>
          <option value="">全部类型</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}
          className="projects-add-input" style={{ width: 140, height: 28, fontSize: 11 }}>
          <option value="">全部项目</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(filterStatus || filterType || filterProject) && (
          <button type="button"
            onClick={() => { setFilterStatus(""); setFilterType(""); setFilterProject(""); }}
            className="button" style={{ fontSize: 11, padding: "0 10px", height: 28 }}>
            清除筛选
          </button>
        )}
      </div>

      {/* ═══ 列表 ═══ */}
      {loading ? (
        <div className="dashboard-feed-empty" style={{ minHeight: 200 }}>
          <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>加载中…</span>
        </div>
      ) : artifacts.length === 0 ? (
        <div className="agents-empty">
          <div className="agents-empty-grid" />
          <div className="agents-empty-body">
            <div className="flex items-center gap-2 mb-3">
              <FileCheck size={14} style={{ color: "var(--muted)" }} />
              <span className="agents-eyebrow">暂无产出物</span>
            </div>
            <p className="agents-empty-title">还没有产出物记录</p>
            <p className="agents-empty-sub">Agent 完成任务后将自动产生产出物</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {artifacts.map((art, idx) => {
            const sc = STATUS_CFG[art.status] ?? STATUS_CFG.draft;
            const TypeIcon = TYPE_ICONS[art.artifact_type] ?? FileText;
            const proj = projects.find((p) => p.id === art.project_id);
            const agent = agents.find((a) => a.id === art.agent_id);
            const busy = acting === art.id + "submit" || acting === art.id + "accept";
            return (
              <Link
                key={art.id}
                to={`/artifacts/${art.id}`}
                className="list-row no-underline"
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                {/* 状态 rail */}
                <div style={{
                  width: 3, borderRadius: 2, flexShrink: 0, alignSelf: "stretch",
                  background: sc.color, opacity: 0.6,
                }} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {/* 第一行：序号 + 状态 pill + 标题 + 类型 */}
                  <div className="flex items-center gap-2">
                    <span className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.08em" }}>
                      A{String(idx + 1).padStart(3, "0")}
                    </span>
                    <span className={`status-pill ${sc.pill}`}>
                      {STATUS_LABELS[art.status] ?? art.status}
                    </span>
                    <span className="text-sm" style={{
                      color: "var(--text)", overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {art.title || art.id}
                    </span>
                    <span className="tech-badge mono" style={{ fontSize: 9 }}>
                      <TypeIcon size={9} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />
                      {TYPE_LABELS[art.artifact_type] ?? art.artifact_type}
                    </span>
                  </div>
                  {/* 第二行：来源 + 关联 + 时间 + 快捷操作 */}
                  <div className="flex items-center gap-4" style={{ fontSize: 11, color: "var(--muted)" }}>
                    {agent && (
                      <span className="flex items-center gap-1">
                        <Bot size={10} /> {agent.name}
                      </span>
                    )}
                    {proj && (
                      <span className="flex items-center gap-1">
                        <FolderOpen size={10} /> {proj.name}
                      </span>
                    )}
                    {art.task_id && (
                      <Link to={`/tasks/${art.task_id}`} className="flex items-center gap-1 no-underline"
                        style={{ color: "var(--muted)", fontSize: 11 }}
                        onClick={(e) => e.stopPropagation()}>
                        任务 {art.task_id.length > 8 ? art.task_id.slice(0, 8) + "…" : art.task_id}
                      </Link>
                    )}
                    <span style={{ marginLeft: "auto" }}>{relTime(art.created_at)}</span>
                    {/* 快捷操作 */}
                    {art.status === "draft" && (
                      <button type="button" className="button" disabled={busy}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAction(art.id, "submit"); }}
                        style={{ fontSize: 10, padding: "0 8px", height: 22 }}>
                        {busy ? "…" : <><Send size={10} /> 提交</>}
                      </button>
                    )}
                    {art.status === "submitted" && (
                      <button type="button" className="button" disabled={busy}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAction(art.id, "accept"); }}
                        style={{ fontSize: 10, padding: "0 8px", height: 22, borderColor: "var(--success)", color: "var(--success)" }}>
                        {busy ? "…" : <><CheckCircle size={10} /> 接受</>}
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
