import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  ArrowLeft, CheckCircle, XCircle, Clock, Send,
  FileText, Code, Activity, TestTube, Search,
  Bot, FolderOpen, Link2, Radio,
} from "lucide-react";

/* ═══ 常量映射 ════════════════════════════════════════════ */
const TYPE_LABELS: Record<string, string> = {
  code: "代码", document: "文档", analysis: "分析",
  test_result: "测试结果", review: "审查",
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
function fmtTime(iso?: string) {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("zh-CN");
}

/* ═══ 主组件 ══════════════════════════════════════════════ */
export default function ArtifactDetail() {
  const { id } = useParams<{ id: string }>();
  const [art, setArt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [comment, setComment] = useState("");

  // 关联数据
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.listProjects().then((list: any[]) => setProjects(list.map((p: any) => ({ id: p.id, name: p.name })))).catch(() => {});
    api.listAgents().then((list: any[]) => setAgents(list.map((a: any) => ({ id: a.id, name: a.name })))).catch(() => {});
  }, []);

  // 加载详情
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getArtifact(id)
      .then((data: any) => setArt(data))
      .catch(() => setArt(null))
      .finally(() => setLoading(false));
  }, [id]);

  // 操作
  const handleAction = async (action: "submit" | "accept" | "reject") => {
    if (!art) return;
    setActing(action);
    try {
      if (action === "submit") await api.submitArtifact(art.id);
      else if (action === "accept") await api.acceptArtifact(art.id, comment || undefined);
      else if (action === "reject" && comment) await api.rejectArtifact(art.id, comment);
      // 重新加载
      const data = await api.getArtifact(art.id);
      setArt(data);
      setRejectMode(false);
      setComment("");
    } catch { /* 静默 */ }
    setActing(null);
  };

  if (loading) {
    return <div className="p-6 text-sm" style={{ color: "var(--muted)" }}>加载中...</div>;
  }

  if (!art) {
    return (
      <div className="p-6">
        <Link to="/artifacts" className="flex items-center gap-1 text-xs mb-4" style={{ color: "var(--muted)" }}>
          <ArrowLeft size={14} /> 返回产出物列表
        </Link>
        <div className="agents-empty">
          <div className="agents-empty-body">
            <p className="agents-empty-title">产出物未找到</p>
            <p className="agents-empty-sub">该产出物不存在或已被删除</p>
          </div>
        </div>
      </div>
    );
  }

  const sc = STATUS_CFG[art.status] ?? STATUS_CFG.draft;
  const proj = projects.find((p) => p.id === art.project_id);
  const agent = agents.find((a) => a.id === art.agent_id);

  return (
    <div className="p-6" style={{ maxWidth: 900 }}>
      {/* ═══ 面包屑 ═══ */}
      <div className="flex items-center mb-4">
        <Link to="/artifacts" className="flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
          <ArrowLeft size={14} /> 返回产出物列表
        </Link>
      </div>

      {/* ═══ 标题 + 状态 + 类型 ═══ */}
      <div className="flex items-start gap-3 mb-6">
        <div className="flex-1">
          <h1 className="page-title">{art.title || art.id}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`status-pill ${sc.pill}`}>
              {STATUS_LABELS[art.status] ?? art.status}
            </span>
            <span className="tech-badge mono" style={{ fontSize: 10 }}>
              {TYPE_LABELS[art.artifact_type] ?? art.artifact_type}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ 摘要 ═══ */}
      {art.summary && (
        <div className="mb-6">
          <h3 className="section-title mb-3">摘要</h3>
          <div className="content-card" style={{ padding: 16 }}>
            <p className="text-sm" style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {art.summary}
            </p>
          </div>
        </div>
      )}

      {/* ═══ 内容 ═══ */}
      {art.content && (
        <div className="mb-6">
          <h3 className="section-title mb-3">内容</h3>
          <div className="content-card" style={{ padding: 0, overflow: "hidden" }}>
            <pre className="mono" style={{
              fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)",
              padding: "14px 16px", whiteSpace: "pre-wrap", wordBreak: "break-word",
              maxHeight: 400, overflowY: "auto", margin: 0,
            }}>
              {typeof art.content === "string" ? art.content : JSON.stringify(art.content, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* ═══ 关联对象 ═══ */}
      <h3 className="section-title mb-3">关联对象</h3>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {proj && (
          <Link to={`/projects/${proj.id}`} className="content-card no-underline" style={{ padding: 12 }}>
            <div className="flex items-center gap-2">
              <FolderOpen size={14} style={{ color: "var(--accent)" }} />
              <div>
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>项目</div>
                <div className="text-sm" style={{ color: "var(--text)" }}>{proj.name}</div>
              </div>
            </div>
          </Link>
        )}
        {agent && (
          <Link to={`/agents/${agent.id}`} className="content-card no-underline" style={{ padding: 12 }}>
            <div className="flex items-center gap-2">
              <Bot size={14} style={{ color: "var(--accent)" }} />
              <div>
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>Agent</div>
                <div className="text-sm" style={{ color: "var(--text)" }}>{agent.name}</div>
              </div>
            </div>
          </Link>
        )}
        {art.task_id && (
          <Link to={`/tasks/${art.task_id}`} className="content-card no-underline" style={{ padding: 12 }}>
            <div className="flex items-center gap-2">
              <Link2 size={14} style={{ color: "var(--accent)" }} />
              <div>
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>任务</div>
                <div className="text-sm mono" style={{ color: "var(--text)" }}>
                  {art.task_id.length > 16 ? art.task_id.slice(0, 8) + "…" : art.task_id}
                </div>
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* ═══ 审查动作区 ═══ */}
      <h3 className="section-title mb-3">审查</h3>
      <div className="content-card" style={{ padding: 16 }}>
        {art.status === "draft" && (
          <button type="button" className="button" disabled={acting === "submit"}
            onClick={() => handleAction("submit")}
            style={{ borderColor: "var(--info)", color: "var(--info)" }}>
            <Send size={13} /> {acting === "submit" ? "提交中…" : "提交审查"}
          </button>
        )}

        {art.status === "submitted" && !rejectMode && (
          <div className="flex items-center gap-2">
            <button type="button" className="button" disabled={acting === "accept"}
              onClick={() => handleAction("accept")}
              style={{ borderColor: "var(--success)", color: "var(--success)" }}>
              <CheckCircle size={13} /> {acting === "accept" ? "处理中…" : "接受"}
            </button>
            <button type="button" className="button"
              onClick={() => setRejectMode(true)}
              style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
              <XCircle size={13} /> 退回
            </button>
          </div>
        )}

        {art.status === "submitted" && rejectMode && (
          <div>
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: "var(--muted)" }}>
                退回理由
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="请填写退回理由…"
                style={{
                  width: "100%", minHeight: 80, fontSize: 13, padding: "8px 12px",
                  background: "var(--paper-strong)", border: "1px solid var(--line)",
                  borderRadius: "var(--radius-sm)", color: "var(--text)",
                  resize: "vertical", fontFamily: "inherit",
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="button"
                disabled={!comment || acting === "reject"}
                onClick={() => handleAction("reject")}
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                <XCircle size={13} /> {acting === "reject" ? "处理中…" : "确认退回"}
              </button>
              <button type="button" className="button"
                onClick={() => { setRejectMode(false); setComment(""); }}>
                取消
              </button>
            </div>
          </div>
        )}

        {(art.status === "accepted" || art.status === "rejected") && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`status-pill ${sc.pill}`}>
                {STATUS_LABELS[art.status]}
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                已处理
              </span>
            </div>
            {art.review_comment && (
              <div style={{
                background: "var(--paper-strong)", border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)", padding: "10px 14px",
                fontSize: 13, color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
              }}>
                <div className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: "var(--muted)" }}>
                  审查意见
                </div>
                {art.review_comment}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ 时间信息 ═══ */}
      <h3 className="section-title mb-3 mt-6">时间信息</h3>
      <div className="content-card" style={{ padding: 16 }}>
        <div className="grid grid-cols-2 gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          <div>
            <span style={{ color: "var(--muted)" }}>创建时间：</span>{fmtTime(art.created_at)}
          </div>
          <div>
            <span style={{ color: "var(--muted)" }}>审查时间：</span>{fmtTime(art.reviewed_at)}
          </div>
        </div>
      </div>
    </div>
  );
}
