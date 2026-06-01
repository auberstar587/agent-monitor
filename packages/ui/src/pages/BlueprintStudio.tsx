import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api } from "../lib/api";
import {
  ArrowLeft, Save, Play, Bot, Crown, LayoutGrid,
  MessageSquare, GitBranch, Filter, Shield, History, Timer,
} from "lucide-react";

// --- Node type palette ---
const NODE_TYPES = [
  { type: "agent", label: "Agent 执行", color: "var(--accent)", icon: Bot, desc: "单 Agent 任务" },
  { type: "manager", label: "管理分发", color: "var(--brand)", icon: Crown, desc: "任务分配路由" },
  { type: "slot", label: "并行槽", color: "#34d399", icon: LayoutGrid, desc: "并行执行" },
  { type: "meeting", label: "会议", color: "#f97316", icon: MessageSquare, desc: "多 Agent 讨论" },
  { type: "condition", label: "条件分支", color: "#fbbf24", icon: GitBranch, desc: "条件判断" },
  { type: "summary", label: "汇总", color: "#22d3ee", icon: Filter, desc: "聚合上游输出" },
  { type: "approval", label: "审批", color: "#fb7185", icon: Shield, desc: "人工审批门" },
];

const DEFAULT_CONFIGS: Record<string, any> = {
  agent: { adapter: "mock", prompt_template: "请执行: {{input}}" },
  manager: { distribution: "round_robin" },
  slot: { parallelism: 3 },
  meeting: { participants: ["Agent A", "Agent B"], rounds: 3, consensus_rule: "majority" },
  condition: { expression: "true" },
  summary: { template: "合并上游输出" },
  approval: { auto_approve_below_risk: false },
};

let counter = 0;
const uid = () => `n${++counter}_${Date.now()}`;

// --- Custom ReactFlow node ---
function BlueprintNode({ data, selected }: { data: any; selected: boolean }) {
  const t = NODE_TYPES.find((n) => n.type === data.nodeType) || NODE_TYPES[0];
  const Icon = t.icon;

  return (
    <div className={`bp-node ${selected ? "selected" : ""}`}>
      <div className="bp-node-header">
        <div className="bp-node-icon" style={{ background: `${t.color}18`, color: t.color }}>
          <Icon size={13} />
        </div>
        <span className="bp-node-title">{data.label}</span>
      </div>
      <div className="bp-node-body">
        <div className="bp-node-type-label">{t.desc}</div>
        {data.config && Object.keys(data.config).length > 0 && (
          <div className="mt-1.5 text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {Object.entries(data.config).slice(0, 2).map(([k, v]) => (
              <div key={k}>{k}: {typeof v === "string" ? v.slice(0, 30) : JSON.stringify(v).slice(0, 30)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = Object.fromEntries(NODE_TYPES.map((t) => [t.type, BlueprintNode]));

// --- Page ---
export default function BlueprintStudio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [bpId, setBpId] = useState<string | null>(isNew ? null : id || null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'editor' | 'history'>('editor');
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [scheduled, setScheduled] = useState<any>(null);
  const [cronInput, setCronInput] = useState("0 */6 * * *");
  const [showSchedule, setShowSchedule] = useState(false);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => [
      ...eds,
      { ...c, id: `e_${Date.now()}`, markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 } },
    ]),
    [setEdges],
  );

  const onDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData("application/reactflow", type);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/reactflow");
      if (!type || !DEFAULT_CONFIGS[type]) return;
      const config = DEFAULT_CONFIGS[type];
      const node: Node = {
        id: uid(),
        type,
        position: { x: e.clientX - 360, y: e.clientY - 80 },
        data: { label: `新${NODE_TYPES.find((t) => t.type === type)?.label || type}`, nodeType: type, config },
      };
      setNodes((nds) => [...nds, node]);
    },
    [setNodes],
  );

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  // Keyboard: Delete/Backspace removes selected node
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) => eds.filter((ed) => ed.source !== selectedNode.id && ed.target !== selectedNode.id));
      setSelectedNode(null);
    }
  }, [selectedNode, setNodes, setEdges]);

  const onNodeClick = (_: any, node: Node) => setSelectedNode(node);

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((ed) => ed.source !== selectedNode.id && ed.target !== selectedNode.id));
    setSelectedNode(null);
  };

  // Fetch runs + schedule
  useEffect(() => {
    if (!bpId) return;
    api.listRuns(bpId).then(setRuns);
    api.listScheduled().then((list) => {
      const found = list.find((s: any) => s.blueprintId === bpId);
      if (found) { setScheduled(found); setCronInput(found.cronExpression); }
    });
  }, [bpId]);

  const handleSchedule = async () => {
    if (!bpId) return;
    if (scheduled) {
      await api.unscheduleBlueprint(bpId);
      setScheduled(null);
      setShowSchedule(false);
    } else {
      const result = await api.scheduleBlueprint(bpId, cronInput);
      setScheduled(result);
      setShowSchedule(false);
    }
  };

  // Load
  useEffect(() => {
    if (isNew || !id) return;
    api.getBlueprint(id).then((bp) => {
      setName(bp.name);
      setDesc(bp.description || "");
      setBpId(bp.id);
      setNodes(
        bp.nodes?.map((n: any) => ({
          id: n.id,
          type: n.type,
          position: { x: (n.position_x ?? 0) * 300, y: (n.position_y ?? 0) * 200 },
          data: { label: n.name, nodeType: n.type, config: n.config || {} },
        })) || [],
      );
      setEdges(
        bp.edges?.map((e: any) => ({
          id: e.id || `e_${e.source_node_id}_${e.target_node_id}`,
          source: e.source_node_id,
          target: e.target_node_id,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        })) || [],
      );
    });
  }, [id, isNew, setNodes, setEdges]);

  // Save (persists both metadata and nodes/edges)
  const handleSave = async () => {
    setSaving(true);
    try {
      const bpNodes = nodes.map((n) => ({
        id: n.id,
        type: n.type,
        name: n.data.label,
        config: n.data.config || {},
        position_x: Math.round(n.position.x / 300),
        position_y: Math.round(n.position.y / 200),
      }));
      const bpEdges = edges.map((e) => ({ source_node_id: e.source, target_node_id: e.target }));
      if (isNew || !bpId) {
        const bp = await api.createBlueprint({ name, description: desc, nodes: bpNodes, edges: bpEdges });
        setBpId(bp.id);
        navigate(`/blueprints/${bp.id}`, { replace: true });
      } else {
        await api.updateBlueprint(bpId, { name, description: desc });
        // Save nodes/edges via dedicated nodes endpoint
        await fetch(`/api/blueprints/${bpId}/nodes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodes: bpNodes, edges: bpEdges }),
        });
      }
    } catch (err: any) {
      alert(`保存失败: ${err.message}`);
    }
    setSaving(false);
  };

  const handleRun = async () => {
    if (!bpId) return;
    try {
      const run = await api.runBlueprint(bpId);
      alert(`运行已启动 (${run.id.slice(0, 8)}…)`);
    } catch (err: any) {
      alert(`运行失败: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: "var(--line)", background: "var(--paper-strong)" }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/blueprints")} className="icon-btn" title="返回">
            <ArrowLeft size={16} />
          </button>
          <div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="蓝图名称"
              className="bg-transparent border-0 outline-none text-sm font-semibold"
              style={{ color: "var(--text)", width: 220 }}
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="蓝图描述（可选）"
              className="bg-transparent border-0 outline-none text-[11px] block"
              style={{ color: "var(--muted)", width: 320 }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="button button-primary">
            <Save size={13} /> {saving ? "保存中…" : "保存"}
          </button>
          {bpId && (
            <>
              <button
                onClick={() => setShowSchedule(!showSchedule)}
                className="button"
                style={scheduled ? { background: 'var(--success-bg)', color: 'var(--success)', borderColor: 'rgba(52,211,153,0.2)' } : {}}
                title={scheduled ? `定时: ${scheduled.cronExpression}` : '设置定时'}
              >
                <Timer size={13} /> {scheduled ? '已定时' : '定时'}
              </button>
              <button
                onClick={() => setViewMode(viewMode === 'history' ? 'editor' : 'history')}
                className="button"
                style={viewMode === 'history' ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-line)' } : {}}
              >
                <History size={13} /> 历史 ({runs.length})
              </button>
              <button onClick={handleRun} className="button button-primary">
                <Play size={13} /> 运行
              </button>
            </>
          )}
        </div>
      </div>

      {/* Schedule panel */}
      {showSchedule && bpId && (
        <div className="px-4 py-2.5 border-b flex items-center gap-3" style={{ borderColor: "var(--line)", background: "var(--nav)" }}>
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>定时执行 (cron):</span>
          <input
            value={cronInput}
            onChange={(e) => setCronInput(e.target.value)}
            placeholder="0 */6 * * *"
            className="config-input text-xs"
            style={{ width: 160 }}
          />
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>
            例: "0 */6 * * *" = 每6小时
          </span>
          <button onClick={handleSchedule} className="button button-primary text-xs">
            {scheduled ? "取消定时" : "设置定时"}
          </button>
          {scheduled && (
            <span className="text-[10px]" style={{ color: "var(--success)" }}>
              下次运行: {scheduled.nextRun ? new Date(scheduled.nextRun).toLocaleString("zh-CN") : "—"}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden" tabIndex={0} onKeyDown={onKeyDown}>
        {/* Left: Palette */}
        <aside
          className="w-48 shrink-0 border-r p-3 overflow-auto"
          style={{ borderColor: "var(--line)", background: "var(--nav)" }}
        >
          <div className="text-[10px] uppercase tracking-widest mb-3 font-medium" style={{ color: "var(--muted)" }}>
            节点
          </div>
          <div className="space-y-0.5">
            {NODE_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, t.type)}
                  className="bp-palette-item"
                >
                  <div className="bp-node-icon" style={{ background: `${t.color}18`, color: t.color }}>
                    <Icon size={12} />
                  </div>
                  <div>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text)" }}>{t.label}</div>
                    <div className="text-[10px]" style={{ color: "var(--muted)" }}>{t.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center: Canvas or History */}
        {viewMode === 'history' ? (
          <div className="flex-1 p-6 overflow-auto">
            <h3 className="section-title mb-4">运行历史</h3>
            {runs.length === 0 ? (
              <div className="empty-state" style={{ minHeight: 120 }}>
                <History size={24} style={{ color: "var(--muted)" }} />
                <span className="text-sm">暂无运行记录</span>
              </div>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                    className="list-row cursor-pointer flex-col items-start"
                  >
                    <div className="flex items-center w-full gap-3">
                      <span className={`status-pill status-${run.status === 'completed' ? 'succeeded' : run.status === 'failed' ? 'failed' : 'running'}`}>
                        {run.status === 'completed' ? '成功' : run.status === 'failed' ? '失败' : run.status === 'running' ? '运行中' : run.status}
                      </span>
                      <span className="text-xs mono" style={{ color: "var(--muted)" }}>
                        {new Date(run.started_at).toLocaleString("zh-CN")}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                        {run.id.slice(0, 8)}…
                      </span>
                    </div>
                    {selectedRun?.id === run.id && run.nodeRuns && (
                      <div className="mt-3 w-full pl-2 border-l-2" style={{ borderColor: "var(--line)" }}>
                        {run.nodeRuns.map((nr: any) => (
                          <div key={nr.id} className="flex items-center gap-2 py-1.5 text-xs">
                            <span className={`status-pill ${nr.run ? `status-${nr.run.status === 'completed' ? 'succeeded' : nr.run.status}` : 'status-queued'}`}
                              style={{ minHeight: 18, fontSize: 10 }}>
                              {nr.run?.status === 'completed' ? '✓' : nr.run?.status === 'failed' ? '✗' : nr.run?.status === 'running' ? '…' : '○'}
                            </span>
                            <span style={{ color: "var(--text)" }}>{nr.name}</span>
                            <span className="text-[10px]" style={{ color: "var(--muted)" }}>{nr.type}</span>
                            {nr.run?.output && (
                              <span className="text-[10px] truncate flex-1" style={{ color: "var(--text-secondary)" }}>
                                {nr.run.output.slice(0, 60)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {run.error_message && (
                      <div className="mt-2 text-[10px] text-red-400">{run.error_message}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1" onDrop={onDrop} onDragOver={onDragOver}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
                defaultEdgeOptions={{
                  style: { stroke: "var(--line-strong)", strokeWidth: 2 },
                  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--line-strong)" },
                }}
              >
                <Background color="rgba(255,255,255,0.04)" gap={24} size={1} />
                <Controls
                  style={{
                    background: "var(--paper-raised)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    color: "var(--text-secondary)",
                  }}
                />
                <MiniMap
                  style={{
                    background: "var(--paper-raised)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                  }}
                  nodeColor={() => "rgba(34,211,238,0.3)"}
                  maskColor="rgba(0,0,0,0.6)"
                />
              </ReactFlow>
            </div>

            {/* Right: Config */}
            {selectedNode && (
              <aside className="config-panel">
                <div className="flex items-center justify-between mb-4">
                  <span className="section-title">节点配置</span>
                  <button onClick={handleDeleteNode} className="icon-btn danger" title="删除节点 (Delete)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="config-label">名称</div>
                    <input
                      value={selectedNode.data.label}
                      onChange={(e) => {
                        setNodes((nds) =>
                          nds.map((n) =>
                            n.id === selectedNode.id ? { ...n, data: { ...n.data, label: e.target.value } } : n,
                          ),
                        );
                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, label: e.target.value } });
                      }}
                      className="config-input"
                    />
                  </div>
                  <div>
                    <div className="config-label">类型</div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)", padding: "6px 0" }}>
                      {selectedNode.type}
                    </div>
                  </div>
                  <div>
                    <div className="config-label">配置 (JSON)</div>
                    <textarea
                      value={JSON.stringify(selectedNode.data.config || {}, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          setNodes((nds) =>
                            nds.map((n) =>
                              n.id === selectedNode.id ? { ...n, data: { ...n.data, config: parsed } } : n,
                            ),
                          );
                        } catch { /* editing */ }
                      }}
                      rows={8}
                      className="config-input mono text-[10px]"
                      style={{ fontFamily: "monospace", resize: "vertical" }}
                    />
                  </div>
                </div>
              </aside>
            )}
          </>
        )}
      </div>
    </div>
  );
}
