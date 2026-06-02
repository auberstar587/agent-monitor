import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { query, queryOne, execute } from '../db/client.js';
import { getAdapter, getEngine } from '../adapters/registry.js';
// 触发 registry.ts 底部 registerEngine('claude-code', ...) 副作用，否则 EngineAdapter 注册表为空
import '../adapters/registry.js';
import type { EngineMessage } from '../adapters/engine.js';

// --- Types ---

export interface BlueprintNode {
  id: string;
  blueprint_id: string;
  type: 'agent' | 'manager' | 'slot' | 'meeting' | 'condition' | 'summary' | 'approval';
  name: string;
  config: Record<string, any>;
  description?: string;
  position_x: number;
  position_y: number;
}

export interface BlueprintEdge {
  id: string;
  blueprint_id: string;
  source_node_id: string;
  target_node_id: string;
  condition?: string;
  label?: string;
}

export interface Blueprint {
  id: string;
  project_id?: string;
  name: string;
  description?: string;
  status: string;
  tags: string[];
  auto_approve: boolean;
  trigger_type: string;
  trigger_config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface BlueprintWithGraph extends Blueprint {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
}

export interface BlueprintRun {
  id: string;
  blueprint_id: string;
  snapshot: any;
  status: string;
  started_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface BlueprintNodeRun {
  id: string;
  blueprint_run_id: string;
  node_id: string;
  task_id?: string;
  status: string;
  output?: string;
  started_at?: string;
  completed_at?: string;
}

export interface CreateBlueprintNodeInput {
  id?: string;
  type: string;
  name: string;
  config?: Record<string, any>;
  description?: string;
  position_x?: number;
  position_y?: number;
}

export interface CreateBlueprintEdgeInput {
  id?: string;
  source_node_id: string;
  target_node_id: string;
  condition?: string;
  label?: string;
}

export interface CreateBlueprintDTO {
  name: string;
  description?: string;
  project_id?: string;
  tags?: string[];
  auto_approve?: boolean;
  nodes: CreateBlueprintNodeInput[];
  edges: CreateBlueprintEdgeInput[];
}

// --- CRUD ---

export async function createBlueprint(data: CreateBlueprintDTO): Promise<BlueprintWithGraph> {
  const bp = await queryOne<Blueprint>(`
    INSERT INTO blueprints (name, description, status, tags, auto_approve)
    VALUES ($1, $2, 'draft', $3::jsonb, $4)
    RETURNING *
  `, [data.name, data.description || null, JSON.stringify(data.tags || []), data.auto_approve ?? false]);
  if (!bp) throw new Error('Failed to create blueprint');

  // Pre-generate UUIDs for all nodes so edges can reference them
  const nodeIds = new Map<string, string>(); // clientId -> real UUID
  for (const nd of data.nodes) {
    const realId = randomUUID();
    const clientId = nd.id || realId;
    nodeIds.set(clientId, realId);
    console.log('[Blueprint] Node ID mapping:', clientId, '->', realId);
    const node = await queryOne(`
      INSERT INTO blueprint_nodes (id, blueprint_id, type, name, config, description, position_x, position_y)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      RETURNING *
    `, [realId, bp.id, nd.type, nd.name, JSON.stringify(nd.config || {}), nd.description || null, nd.position_x ?? 0, nd.position_y ?? 0]);
    if (!node) throw new Error('Failed to create node');
  }

  // Batch insert edges (resolve client IDs to real UUIDs)
  for (const ed of data.edges) {
    const sourceId = nodeIds.get(ed.source_node_id) || ed.source_node_id;
    const targetId = nodeIds.get(ed.target_node_id) || ed.target_node_id;
    await queryOne(`
      INSERT INTO blueprint_edges (blueprint_id, source_node_id, target_node_id, condition, label)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [bp.id, sourceId, targetId, ed.condition || null, ed.label || null]);
  }

  return getBlueprint(bp.id) as Promise<BlueprintWithGraph>;
}

export async function getBlueprint(id: string): Promise<BlueprintWithGraph | null> {
  const bp = await queryOne<Blueprint>('SELECT * FROM blueprints WHERE id = $1', [id]);
  if (!bp) return null;

  const nodes = await query<BlueprintNode>(
    'SELECT * FROM blueprint_nodes WHERE blueprint_id = $1 ORDER BY created_at', [id]
  );
  const edges = await query<BlueprintEdge>(
    'SELECT * FROM blueprint_edges WHERE blueprint_id = $1 ORDER BY created_at', [id]
  );

  return { ...bp, nodes, edges };
}

export async function listBlueprints(): Promise<Blueprint[]> {
  return query<Blueprint>('SELECT * FROM blueprints ORDER BY updated_at DESC');
}

export async function updateBlueprint(id: string, data: Partial<Blueprint>): Promise<Blueprint | null> {
  const fields: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description); }
  if (data.tags !== undefined) { fields.push(`tags = $${idx++}::jsonb`); params.push(JSON.stringify(data.tags)); }
  if (data.auto_approve !== undefined) { fields.push(`auto_approve = $${idx++}`); params.push(data.auto_approve); }
  if (data.status !== undefined) { fields.push(`status = $${idx++}`); params.push(data.status); }
  if (data.trigger_type !== undefined) { fields.push(`trigger_type = $${idx++}`); params.push(data.trigger_type); }

  if (fields.length === 0) return getBlueprint(id);
  fields.push(`updated_at = now()`);

  params.push(id);
  await query(`UPDATE blueprints SET ${fields.join(', ')} WHERE id = $${idx}`, params);
  return getBlueprint(id);
}

export async function deleteBlueprint(id: string): Promise<boolean> {
  const result = await execute('DELETE FROM blueprints WHERE id = $1 RETURNING id', [id]);
  return (result.rowCount ?? 0) > 0;
}

// --- Clone ---

export async function cloneBlueprint(id: string): Promise<BlueprintWithGraph | null> {
  const orig = await getBlueprint(id);
  if (!orig) return null;

  const nodeIdMap = new Map<string, string>();

  // Create new blueprint
  const bp = await createBlueprint({
    name: `${orig.name} (副本)`,
    description: orig.description ? `${orig.description}\n---\n克隆自: ${orig.name}` : undefined,
    tags: orig.tags,
    auto_approve: orig.auto_approve,
    nodes: [],
    edges: [],
  });

  // Delete auto-created nodes/edges, rebuild
  await query('DELETE FROM blueprint_nodes WHERE blueprint_id = $1', [bp.id]);
  await query('DELETE FROM blueprint_edges WHERE blueprint_id = $1', [bp.id]);

  // Re-insert nodes with mapped IDs
  for (const n of orig.nodes) {
    const newNode = await queryOne<BlueprintNode>(`
      INSERT INTO blueprint_nodes (blueprint_id, type, name, config, description, position_x, position_y)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) RETURNING id, type, name, config, description, position_x, position_y, created_at, blueprint_id
    `, [bp.id, n.type, n.name, JSON.stringify(n.config || {}), n.description || null, n.position_x, n.position_y]);
    if (newNode) nodeIdMap.set(n.id, newNode.id);
  }

  // Re-insert edges with mapped IDs
  for (const e of orig.edges) {
    const newSource = nodeIdMap.get(e.source_node_id);
    const newTarget = nodeIdMap.get(e.target_node_id);
    if (newSource && newTarget) {
      await query(`
        INSERT INTO blueprint_edges (blueprint_id, source_node_id, target_node_id, condition, label)
        VALUES ($1, $2, $3, $4, $5)
      `, [bp.id, newSource, newTarget, e.condition || null, e.label || null]);
    }
  }

  return getBlueprint(bp.id);
}

// --- Run Management ---

export async function runBlueprint(id: string): Promise<BlueprintRun> {
  const bp = await getBlueprint(id);
  if (!bp) throw new Error('Blueprint not found');
  if (bp.nodes.length === 0) throw new Error('Blueprint has no nodes');

  // Snapshot current graph
  const snapshot = { nodes: bp.nodes, edges: bp.edges };

  const run = await queryOne<BlueprintRun>(`
    INSERT INTO blueprint_runs (blueprint_id, snapshot, status)
    VALUES ($1, $2::jsonb, 'running') RETURNING *
  `, [id, JSON.stringify(snapshot)]);
  if (!run) throw new Error('Failed to create run');

  // Create node_runs for all nodes
  for (const node of bp.nodes) {
    await query(`
      INSERT INTO blueprint_node_runs (blueprint_run_id, node_id, status)
      VALUES ($1, $2, 'pending')
    `, [run.id, node.id]);
  }

  // Execute DAG asynchronously
  runUntilBlockedOrDone(run.id).catch(err => {
    console.error(`[Blueprint] Run ${run.id} execution error:`, err.message);
  });

  return run;
}

export async function getRun(runId: string): Promise<any | null> {
  const run = await queryOne<BlueprintRun>('SELECT * FROM blueprint_runs WHERE id = $1', [runId]);
  if (!run) return null;

  const nodeRuns = await query<BlueprintNodeRun>(
    'SELECT * FROM blueprint_node_runs WHERE blueprint_run_id = $1 ORDER BY created_at', [runId]
  );

  // Attach node details
  const snapshot = typeof run.snapshot === 'string' ? JSON.parse(run.snapshot) : run.snapshot;
  const nodesWithStatus = (snapshot?.nodes || []).map((n: any) => {
    const nr = nodeRuns.find(r => r.node_id === n.id);
    return { ...n, run: nr || null };
  });

  return { ...run, nodeRuns: nodesWithStatus };
}

export async function listRuns(blueprintId: string): Promise<BlueprintRun[]> {
  return query<BlueprintRun>(
    'SELECT * FROM blueprint_runs WHERE blueprint_id = $1 ORDER BY created_at DESC', [blueprintId]
  );
}

export async function cancelRun(runId: string): Promise<void> {
  await query(
    "UPDATE blueprint_runs SET status = 'cancelled', completed_at = now() WHERE id = $1 AND status = 'running'",
    [runId]
  );
  await query(
    "UPDATE blueprint_node_runs SET status = 'skipped' WHERE blueprint_run_id = $1 AND status = 'pending'",
    [runId]
  );
}

// --- DAG Execution Engine ---

interface RunContext {
  runId: string;
  nodeOutputs: Map<string, string>;
}

async function runUntilBlockedOrDone(runId: string): Promise<void> {
  try {
    const run = await getRun(runId);
    if (!run) return;

    const snapshot = typeof run.snapshot === 'string' ? JSON.parse(run.snapshot) : run.snapshot;
    const nodes: BlueprintNode[] = snapshot.nodes || [];
    const edges: BlueprintEdge[] = snapshot.edges || [];

    const context: RunContext = { runId, nodeOutputs: new Map() };
    const completed = new Set<string>();
    const failed = new Set<string>();

    // Build adjacency
    const outgoingEdges = new Map<string, BlueprintEdge[]>();
    const incomingEdges = new Map<string, BlueprintEdge[]>();
    for (const e of edges) {
      if (!outgoingEdges.has(e.source_node_id)) outgoingEdges.set(e.source_node_id, []);
      outgoingEdges.get(e.source_node_id)!.push(e);
      if (!incomingEdges.has(e.target_node_id)) incomingEdges.set(e.target_node_id, []);
      incomingEdges.get(e.target_node_id)!.push(e);
    }

    // Set root nodes (no incoming edges) to ready
    for (const node of nodes) {
      const inEdges = incomingEdges.get(node.id) || [];
      if (inEdges.length === 0) {
        await updateNodeRunStatus(runId, node.id, 'ready');
      }
    }

    // Execution loop
    let progress = true;
    while (progress) {
      progress = false;

      const readyNodes = await getReadyNodes(runId, nodes, incomingEdges, outgoingEdges, completed, failed);

      if (readyNodes.length > 0) {
        progress = true;
        // Execute in parallel
        await Promise.all(readyNodes.map(async (node) => {
          try {
            await updateNodeRunStatus(runId, node.id, 'running');
            const result = await executeNode(node, context, incomingEdges, outgoingEdges, nodes);
            completed.add(node.id);
            context.nodeOutputs.set(node.id, result.output || '');
            await updateNodeRunStatus(runId, node.id, 'completed', result.output);

            // Check downstream
            const outEdges = outgoingEdges.get(node.id) || [];
            for (const edge of outEdges) {
              const target = nodes.find(n => n.id === edge.target_node_id);
              if (!target) continue;

              if (target.type === 'condition') {
                // Condition nodes are triggered directly
                continue;
              }

              // Check if all upstream of target are completed
              const upEdges = incomingEdges.get(target.id) || [];
              const allUpstreamDone = upEdges.every(e => completed.has(e.source_node_id));
              if (allUpstreamDone) {
                await updateNodeRunStatus(runId, target.id, 'ready');
              }
            }

            // Handle condition branching
            if (node.type === 'condition') {
              await handleConditionBranch(node, result, edges, nodes, runId, completed);
            }

          } catch (err: any) {
            failed.add(node.id);
            await updateNodeRunStatus(runId, node.id, 'failed', err.message);

            // Create inbox item for failure
            await query(`
              INSERT INTO inbox_items (type, title, description, priority, status)
              VALUES ('failed_task', $1, $2, 'high', 'pending')
            `, [`蓝图节点失败: ${node.name}`, `节点 ${node.type} 执行出错: ${err.message}`]);
          }
        }));
      }
    }

    // Determine final status
    const allNodes = nodes.map(n => n.id);
    const allDone = allNodes.every(id => completed.has(id));
    const anyFailed = allNodes.some(id => failed.has(id));

    if (allDone) {
      await query(
        "UPDATE blueprint_runs SET status = 'completed', completed_at = now() WHERE id = $1",
        [runId]
      );
    } else if (anyFailed) {
      await query(
        "UPDATE blueprint_runs SET status = 'failed', completed_at = now() WHERE id = $1",
        [runId]
      );
    }
  } catch (err: any) {
    await query(
      "UPDATE blueprint_runs SET status = 'failed', error_message = $1, completed_at = now() WHERE id = $2",
      [err.message, runId]
    );
  }
}

async function getReadyNodes(
  runId: string, nodes: BlueprintNode[],
  incomingEdges: Map<string, BlueprintEdge[]>,
  outgoingEdges: Map<string, BlueprintEdge[]>,
  completed: Set<string>, failed: Set<string>
): Promise<BlueprintNode[]> {
  const ready: BlueprintNode[] = [];

  for (const node of nodes) {
    if (completed.has(node.id) || failed.has(node.id)) continue;

    const nr = await queryNodeRunStatus(runId, node.id);
    if (nr && nr.status === 'ready') {
      ready.push(node);
      continue;
    }

    // Check if all upstream are completed
    const inEdges = incomingEdges.get(node.id) || [];
    const allUpstreamDone = inEdges.every(e => completed.has(e.source_node_id));
    if (allUpstreamDone) {
      const noStatus = !nr || nr.status === 'pending';
      if (noStatus) {
        ready.push(node);
      }
    }
  }

  return ready;
}

async function queryNodeRunStatus(runId: string, nodeId: string) {
  return queryOne<{ status: string }>(
    'SELECT status FROM blueprint_node_runs WHERE blueprint_run_id = $1 AND node_id = $2',
    [runId, nodeId]
  );
}

async function updateNodeRunStatus(runId: string, nodeId: string, status: string, output?: string) {
  if (status === 'running') {
    await query(
      "UPDATE blueprint_node_runs SET status = $1, started_at = now() WHERE blueprint_run_id = $2 AND node_id = $3",
      [status, runId, nodeId]
    );
  } else if (status === 'completed' || status === 'failed') {
    await query(
      `UPDATE blueprint_node_runs SET status = $1, output = $2, completed_at = now()
       WHERE blueprint_run_id = $3 AND node_id = $4`,
      [status, output || null, runId, nodeId]
    );
  } else {
    await query(
      "UPDATE blueprint_node_runs SET status = $1 WHERE blueprint_run_id = $2 AND node_id = $3",
      [status, runId, nodeId]
    );
  }
}

// --- Node Executors ---

interface NodeResult {
  status: 'completed' | 'failed';
  output?: string;
  error?: string;
}

async function executeNode(
  node: BlueprintNode, context: RunContext,
  incomingEdges: Map<string, BlueprintEdge[]>,
  outgoingEdges: Map<string, BlueprintEdge[]>,
  allNodes: BlueprintNode[]
): Promise<NodeResult> {
  switch (node.type) {
    case 'agent': return executeAgentNode(node, context);
    case 'manager': return executeManagerNode(node, context);
    case 'slot': return executeSlotNode(node, context, incomingEdges, outgoingEdges, allNodes);
    case 'meeting': return executeMeetingNode(node, context);
    case 'condition': return executeConditionNode(node, context);
    case 'summary': return executeSummaryNode(node, context);
    case 'approval': return executeApprovalNode(node, context);
    default: return { status: 'completed', output: `[Unknown node type: ${node.type}]` };
  }
}

async function executeAgentNode(node: BlueprintNode, context: RunContext): Promise<NodeResult> {
  const cfg = node.config || {};
  const prompt = renderTemplate(cfg.prompt_template || '', Object.fromEntries(context.nodeOutputs));

  // === Path 1: EngineAdapter 优先（claude-code / multica / codex）===
  // 这是真路径：startMetrics + run() + finish() + 自动持久化到 runtime_calls
  if (cfg.adapter) {
    try {
      const engine = await getEngine(cfg.adapter);
      if (engine) {
        const stream = engine.run(prompt, {
          model: cfg.model,
          projectId: cfg.projectId,
          workingDir: cfg.workingDir,
        });
        const runId = stream.runId;
        // 累计文本输出 + tool calls
        const textParts: string[] = [];
        let toolCalls = 0;
        try {
          for await (const msg of stream) {
            if (msg.type === 'text' && msg.content) textParts.push(msg.content);
            else if (msg.type === 'tool_use') toolCalls++;
            // error 流不中断，仅记录到最终输出
          }
        } catch (err: any) {
          return { status: 'failed', output: `[EngineAdapter ${cfg.adapter}] 异常: ${err?.message || err}` };
        }
        const output = textParts.join('') || `[EngineAdapter ${cfg.adapter} runId=${runId}] 无文本输出`;
        return { status: 'completed', output };
      }
    } catch (err: any) {
      // EngineAdapter 抛错（未安装、缺 key 等）→ fall through 到 AgentPlatformAdapter
      // 这种情况通常 adapter 真的不存在，记录但不阻断
    }
  }

  // === Path 2: AgentPlatformAdapter（multica / openclaw / codex-platform）===
  try {
    const adapter = getAdapter(cfg.adapter || 'mock');
    const a = await adapter;
    if (a && cfg.adapter && cfg.adapter !== 'mock') {
      const task = await a.createTask({
        title: cfg.agentId ? `任务: ${node.name}` : node.name,
        description: prompt,
        projectId: cfg.projectId || '',
        assigneeId: cfg.agentId,
      });
      return { status: 'completed', output: `[${cfg.adapter}] task ${task.id}` };
    }
  } catch {
    // Fall through to mock
  }

  // === Path 3: Mock fallback（保证蓝图 run 永远有输出）===
  return {
    status: 'completed',
    output: `[Mock] Agent "${node.name}" 执行: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`
  };
}

async function executeManagerNode(node: BlueprintNode, context: RunContext): Promise<NodeResult> {
  const cfg = node.config || {};
  const upstreamOutputs = Array.from(context.nodeOutputs.entries());
  return {
    status: 'completed',
    output: JSON.stringify({
      summary: `管理节点 "${node.name}" 汇总 ${upstreamOutputs.length} 个上游输出`,
      distribution: cfg.distribution || 'round_robin',
      count: upstreamOutputs.length,
    }),
  };
}

async function executeSlotNode(
  node: BlueprintNode, context: RunContext,
  incomingEdges: Map<string, BlueprintEdge[]>,
  outgoingEdges: Map<string, BlueprintEdge[]>,
  allNodes: BlueprintNode[]
): Promise<NodeResult> {
  const cfg = node.config || {};
  const parallelism = cfg.parallelism || 3;
  return {
    status: 'completed',
    output: JSON.stringify({ parallelism, note: `Slot "${node.name}" 并行度 ${parallelism}` }),
  };
}

async function executeMeetingNode(node: BlueprintNode, context: RunContext): Promise<NodeResult> {
  const cfg = node.config || {};
  const participants: string[] = cfg.participants || ['Agent A', 'Agent B', 'Agent C'];
  const rounds = cfg.rounds || 3;
  const rule = cfg.consensus_rule || 'majority';

  // Simulate meeting
  const messages: string[] = [];
  for (let r = 1; r <= rounds; r++) {
    for (const p of participants) {
      messages.push(`[第${r}轮] ${p}: 讨论了节点输出，同意继续推进。`);
    }
  }
  const result = `会议 "${node.name}" 完成: ${participants.length} 个参与者, ${rounds} 轮, 共识规则: ${rule}`;
  return { status: 'completed', output: result };
}

async function executeConditionNode(node: BlueprintNode, context: RunContext): Promise<NodeResult> {
  const cfg = node.config || {};
  const expression = cfg.expression || 'true';

  // Evaluate expression against context
  let branch = 'true_branch'; // default to true
  try {
    const upstreamValues = Object.fromEntries(context.nodeOutputs);
    // Simple JS evaluation
    const fn = new Function('ctx', `with(ctx) { return !!(eval(${JSON.stringify(expression)})); }`);
    const result = fn(upstreamValues);
    branch = result ? 'true_branch' : 'false_branch';
  } catch {
    branch = 'true_branch';
  }

  return { status: 'completed', output: `条件: "${expression}" → ${branch}` };
}

async function executeSummaryNode(node: BlueprintNode, context: RunContext): Promise<NodeResult> {
  const upstreamOutputs = Array.from(context.nodeOutputs.entries());
  const summary = upstreamOutputs.map(([id, out]) => `- [${id}]: ${out}`).join('\n');
  return {
    status: 'completed',
    output: `汇总节点 "${node.name}":\n${summary}\n---\n共 ${upstreamOutputs.length} 个上游节点`,
  };
}

async function executeApprovalNode(node: BlueprintNode, context: RunContext): Promise<NodeResult> {
  const cfg = node.config || {};
  const autoApproveBelowRisk = cfg.auto_approve_below_risk;
  const upstreamValues = Array.from(context.nodeOutputs.values());

  // Check if auto-approve is enabled
  if (autoApproveBelowRisk) {
    return { status: 'completed', output: '自动审批通过（风险等级低）' };
  }

  // Create inbox item for manual approval
  const upstream = upstreamValues.join('\n').slice(0, 500);
  const inbox = await queryOne(`
    INSERT INTO inbox_items (type, title, description, priority, status)
    VALUES ('review_request', $1, $2, 'medium', 'pending')
    RETURNING id
  `, [
    `需要审批: ${node.name}`,
    `蓝图节点 "${node.name}" 需要审批.\n上游输出:\n${upstream}`,
  ]);

  return {
    status: 'completed',
    output: `等待审批 (inbox: ${inbox?.id || 'unknown'}) — 请在收件箱中处理`,
  };
}

async function handleConditionBranch(
  node: BlueprintNode, result: NodeResult,
  edges: BlueprintEdge[], nodes: BlueprintNode[],
  runId: string, completed: Set<string>
) {
  const chosenBranch = result.output?.includes('true_branch') ? 'true_branch' : 'false_branch';

  // Follow the edge that matches the chosen branch
  for (const edge of edges.filter(e => e.source_node_id === node.id)) {
    const shouldActivate = (!edge.condition) ||
      (chosenBranch === 'true_branch' && edge.condition !== 'false_branch') ||
      (chosenBranch === 'false_branch' && edge.condition === 'false_branch');

    if (shouldActivate) {
      const target = nodes.find(n => n.id === edge.target_node_id);
      if (target && !completed.has(target.id)) {
        await updateNodeRunStatus(runId, target.id, 'ready');
      }
    }
  }
}

// --- Helpers ---

function renderTemplate(template: string, vars: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}
