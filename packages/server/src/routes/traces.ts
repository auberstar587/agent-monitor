import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireUUID } from "./uuid-util.js";
import { query, queryOne } from "../db/client.js";

export async function traceRoutes(fastify: FastifyInstance) {
  fastify.get("/api/traces", async (req: FastifyRequest) => {
    const { project_id, status, agent_id, limit } = req.query as {
      project_id?: string; status?: string; agent_id?: string; limit?: string;
    };
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (project_id) { conditions.push(`project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (agent_id) { conditions.push(`agent_id = $${idx++}`); params.push(agent_id); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const lim = limit ? parseInt(limit, 10) : 50;

    return query(
      `SELECT * FROM execution_traces ${where} ORDER BY created_at DESC LIMIT ${lim}`,
      params,
    );
  });

  fastify.get("/api/traces/:taskId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { taskId } = req.params as { taskId: string };
    if (!requireUUID(taskId, reply)) return;
    let trace = await queryOne(
      "SELECT * FROM execution_traces WHERE task_id = $1", [taskId],
    );
    if (!trace) return reply.code(404).send({ error: "trace not found" });

    const task = await queryOne<{ status: string }>(
      "SELECT status FROM tasks WHERE id = $1",
      [taskId],
    );
    if (
      task &&
      ["completed", "failed", "cancelled"].includes(task.status) &&
      (trace as any).status === "running"
    ) {
      const reconciledStatus = task.status === "completed" ? "completed" : "failed";
      trace = await queryOne(
        `UPDATE execution_traces
            SET status = $1,
                completed_at = COALESCE(completed_at, now()),
                error_message = CASE
                  WHEN $1 = 'failed' AND error_message IS NULL THEN 'Task reached terminal state before trace finalization completed.'
                  ELSE error_message
                END,
                updated_at = now()
          WHERE task_id = $2
          RETURNING *`,
        [reconciledStatus, taskId],
      );
    }

    const toolCalls = await query(
      "SELECT * FROM trace_tool_calls WHERE task_id = $1 ORDER BY seq", [taskId],
    );

    return { ...trace, tool_calls: toolCalls };
  });

  fastify.get("/api/inbox", async (req: FastifyRequest) => {
    const { status, project_id } = req.query as { status?: string; project_id?: string };
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (project_id) { conditions.push(`project_id = $${idx++}`); params.push(project_id); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    return query(
      `SELECT * FROM inbox_items ${where} ORDER BY created_at DESC LIMIT 100`,
      params,
    );
  });

  fastify.post("/api/inbox/:id/resolve", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { resolved_by } = req.body as { resolved_by?: string };
    const row = await queryOne(
      `UPDATE inbox_items SET status = 'resolved', resolved_by = $1, resolved_at = now(), updated_at = now()
       WHERE id = $2 RETURNING *`,
      [resolved_by || "user", id],
    );
    if (!row) return reply.code(404).send({ error: "inbox item not found" });
    return row;
  });

  // 类型化动作 API：批准
  // inbox_items.status 是 TEXT，可写 'approved'/'rejected' 等值
  fastify.post("/api/inbox/:id/approve", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { note } = (req.body ?? {}) as { note?: string };
    const row = await queryOne(
      `UPDATE inbox_items
          SET status = 'approved',
              resolved_by = 'user',
              resolved_at = now(),
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [id],
    );
    if (!row) return reply.code(404).send({ error: "inbox item not found" });
    // note 暂不持久化（inbox_items 当前无 metadata JSONB 字段），仅在响应中回显给前端
    return { ...(row as Record<string, unknown>), note: note ?? null };
  });

  // 类型化动作 API：拒绝
  fastify.post("/api/inbox/:id/reject", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { note } = (req.body ?? {}) as { note?: string };
    const row = await queryOne(
      `UPDATE inbox_items
          SET status = 'rejected',
              resolved_by = 'user',
              resolved_at = now(),
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [id],
    );
    if (!row) return reply.code(404).send({ error: "inbox item not found" });
    return { ...(row as Record<string, unknown>), note: note ?? null };
  });

  // 类型化动作 API：重试（标记为 resolved，具体任务重试由调用方发起）
  fastify.post("/api/inbox/:id/retry", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const row = await queryOne(
      `UPDATE inbox_items
          SET status = 'resolved',
              resolved_by = 'user',
              resolved_at = now(),
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [id],
    );
    if (!row) return reply.code(404).send({ error: "inbox item not found" });
    return row;
  });
}
