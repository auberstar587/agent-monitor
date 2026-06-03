import { query, queryOne, execute } from "../db/client.js";
import { updateAgentQuality } from "./agent-registry.js";

export interface Task {
  id: string;
  external_id?: string;
  project_id?: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  priority: string;
  assignee_id?: string;
  reviewer_id?: string;
  labels: string[];
  trace_id?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["in_progress", "cancelled"],
  in_progress: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["in_progress"],
  cancelled: ["in_progress"],
};

export async function createTask(input: {
  title: string; description?: string; type?: string; priority?: string;
  project_id?: string; assignee_id?: string; labels?: string[]; external_id?: string;
}): Promise<Task | null> {
  return queryOne<Task>(
    `INSERT INTO tasks (title, description, type, priority, project_id, assignee_id, labels, external_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) RETURNING *`,
    [input.title, input.description || null, input.type || "general",
     input.priority || "medium", input.project_id || null, input.assignee_id || null,
     JSON.stringify(input.labels || []), input.external_id || null],
  );
}

export async function listTasks(filter?: Record<string, string>): Promise<Task[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (filter?.project_id) { conds.push(`project_id = $${idx++}`); params.push(filter.project_id); }
  if (filter?.status) { conds.push(`status = $${idx++}`); params.push(filter.status); }
  if (filter?.assignee_id) { conds.push(`assignee_id = $${idx++}`); params.push(filter.assignee_id); }
  if (filter?.priority) { conds.push(`priority = $${idx++}`); params.push(filter.priority); }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  return query<Task>(`SELECT * FROM tasks ${where} ORDER BY priority DESC, created_at DESC`, params);
}

export async function getTask(id: string): Promise<Task | null> {
  return queryOne<Task>("SELECT * FROM tasks WHERE id = $1", [id]);
}

export async function updateTask(id: string, updates: Partial<Pick<Task, "title" | "description" | "type" | "priority" | "assignee_id" | "labels" | "project_id">>): Promise<Task | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (updates.title !== undefined) { sets.push(`title = $${idx++}`); params.push(updates.title); }
  if (updates.description !== undefined) { sets.push(`description = $${idx++}`); params.push(updates.description); }
  if (updates.type !== undefined) { sets.push(`type = $${idx++}`); params.push(updates.type); }
  if (updates.priority !== undefined) { sets.push(`priority = $${idx++}`); params.push(updates.priority); }
  if (updates.assignee_id !== undefined) { sets.push(`assignee_id = $${idx++}`); params.push(updates.assignee_id); }
  if (updates.labels !== undefined) { sets.push(`labels = $${idx++}::jsonb`); params.push(JSON.stringify(updates.labels)); }
  if (updates.project_id !== undefined) { sets.push(`project_id = $${idx++}`); params.push(updates.project_id); }
  if (sets.length === 0) return getTask(id);
  sets.push("updated_at = now()");
  params.push(id);
  return queryOne<Task>(`UPDATE tasks SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, params);
}

export async function transitionTask(id: string, newStatus: string): Promise<Task | null> {
  const task = await getTask(id);
  if (!task) return null;
  const allowed = VALID_TRANSITIONS[task.status] || [];
  if (!allowed.includes(newStatus)) throw new Error(`invalid transition: ${task.status} → ${newStatus}`);

  const extraSets: string[] = ["status = $1", "updated_at = now()"];
  const params: unknown[] = [newStatus];
  if (newStatus === "in_progress" && !task.started_at) {
    extraSets.push("started_at = now()");
  }
  if (["completed", "failed", "cancelled"].includes(newStatus)) {
    extraSets.push("completed_at = now()");
  }
  params.push(id);
  const updated = await queryOne<Task>(`UPDATE tasks SET ${extraSets.join(", ")} WHERE id = $2 RETURNING *`, params);

  // P8-11: 任务进入终止态（completed/failed）时，自动更新指派 Agent 的 quality 指标
  if (updated && (newStatus === "completed" || newStatus === "failed") && task.assignee_id) {
    const durationMs = task.started_at
      ? Date.now() - new Date(task.started_at).getTime()
      : 0;
    try {
      await updateAgentQuality(task.assignee_id, newStatus === "completed", durationMs);
    } catch (err) {
      // 质量更新失败不影响主流程
      console.warn("[task-manager] updateAgentQuality failed:", err);
    }
  }

  return updated;
}

export async function deleteTask(id: string): Promise<boolean> {
  const result = await execute("DELETE FROM tasks WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
