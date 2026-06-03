import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { GitBranch, Plus, Play, Copy, Trash2, Timer } from "lucide-react";

export default function BlueprintList() {
  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetch = () => {
    setLoading(true);
    Promise.all([
      api.listBlueprints(),
      api.listScheduled(),
    ]).then(([bps, sched]) => {
      setBlueprints(bps);
      setScheduled(sched);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const handleRun = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const run = await api.runBlueprint(id);
      alert(`运行已启动 (${run.id.slice(0, 8)}…)`);
      fetch();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleClone = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.cloneBlueprint(id);
    fetch();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确认删除此蓝图？")) return;
    await api.deleteBlueprint(id);
    fetch();
  };

  return (
    <div className="blueprints-page">
      {/* 顶栏：fixed 高度，不参与滚动 */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <p className="page-subtitle">DAG 多 Agent 决策编排工作流</p>
        <button
          onClick={() => navigate("/blueprints/new")}
          className="button button-primary"
        >
          <Plus size={14} /> 新建蓝图
        </button>
      </div>

      {/* 列表区：内层独立滚，外框（顶栏）保持不动 */}
      <div className="blueprints-scroll">
        {loading ? (
          <div className="text-sm py-12 text-center" style={{ color: "var(--muted)" }}>加载中...</div>
        ) : blueprints.length === 0 ? (
          <div className="empty-state">
            <GitBranch size={40} className="opacity-20" />
            <p style={{ color: "var(--text-secondary)" }}>暂无蓝图</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>创建你的第一个多 Agent 工作流</p>
          </div>
        ) : (
          <div className="space-y-2">
            {blueprints.map((bp) => (
            <div
              key={bp.id}
              onClick={() => navigate(`/blueprints/${bp.id}`)}
              className="list-row cursor-pointer"
              style={{ minHeight: 48 }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="bp-node-icon" style={{ background: "var(--accent-soft)" }}>
                  <GitBranch size={13} style={{ color: "var(--accent)" }} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
                    {bp.name}
                  </div>
                  {bp.description && (
                    <div className="text-xs truncate mt-0.5" style={{ color: "var(--muted)" }}>
                      {bp.description}
                    </div>
                  )}
                </div>
              </div>
              {scheduled.some((s: any) => s.blueprintId === bp.id) && (
                <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-md" style={{ color: "var(--success)", background: "var(--success-bg)" }}>
                  <Timer size={10} /> 定时
                </span>
              )}
              <span className={`status-pill ${bp.status === 'draft' ? 'status-queued' : 'status-succeeded'}`}>
                {bp.status === 'draft' ? '草稿' : bp.status === 'active' ? '活跃' : bp.status}
              </span>
              <div className="flex items-center gap-0.5 ml-2">
                <button onClick={(e) => handleRun(bp.id, e)} className="icon-btn" title="运行">
                  <Play size={14} />
                </button>
                <button onClick={(e) => handleClone(bp.id, e)} className="icon-btn" title="克隆">
                  <Copy size={14} />
                </button>
                <button onClick={(e) => handleDelete(bp.id, e)} className="icon-btn danger" title="删除">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
