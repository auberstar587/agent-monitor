import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { query } from "../db/client.js";

// 合法 status 集合，避免脏数据
const VALID_STATUS = new Set([
  "running",
  "waiting_user",
  "completed",
  "failed",
  "idle",
]);

// 合法 platform 集合
const VALID_PLATFORM = new Set(["openclaw", "engine", "manual"]);

// 列表过滤支持：agent_id / project_id / status
export async function agentSessionRoutes(fastify: FastifyInstance) {
  // GET /api/agent-sessions — 列表（支持 agent_id / project_id / status 过滤）
  fastify.get("/api/agent-sessions", async (req: FastifyRequest) => {
    const { agent_id, project_id, status } = req.query as {
      agent_id?: string;
      project_id?: string;
      status?: string;
    };

    const where: string[] = [];
    const params: any[] = [];
    if (agent_id) {
      params.push(agent_id);
      where.push(`agent_id = $${params.length}`);
    }
    if (project_id) {
      params.push(project_id);
      where.push(`project_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    const sql = `
      SELECT * FROM agent_sessions
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY last_interaction_at DESC NULLS LAST
      LIMIT 200
    `;
    const rows = await query<any>(sql, params);
    return rows;
  });

  // GET /api/agent-sessions/:id — 详情
  fastify.get(
    "/api/agent-sessions/:id",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const rows = await query<any>("SELECT * FROM agent_sessions WHERE id = $1", [id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: "agent session not found" });
      }
      return rows[0];
    },
  );

  // POST /api/agent-sessions — 创建会话（必填：agent_id）
  fastify.post(
    "/api/agent-sessions",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as {
        agent_id?: string;
        project_id?: string;
        task_id?: string;
        platform?: string;
        status?: string;
        last_output?: string;
        source_ref?: string;
        can_reply?: boolean;
        can_pause?: boolean;
        can_stop?: boolean;
        metadata?: Record<string, unknown>;
      };

      if (!body?.agent_id) {
        return reply.code(400).send({ error: "agent_id is required" });
      }
      if (body.platform && !VALID_PLATFORM.has(body.platform)) {
        return reply.code(400).send({
          error: `invalid platform, must be one of: ${[...VALID_PLATFORM].join(", ")}`,
        });
      }
      if (body.status && !VALID_STATUS.has(body.status)) {
        return reply.code(400).send({
          error: `invalid status, must be one of: ${[...VALID_STATUS].join(", ")}`,
        });
      }

      const rows = await query<any>(
        `INSERT INTO agent_sessions (
           agent_id, project_id, task_id, platform, status,
           last_output, source_ref, can_reply, can_pause, can_stop, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          body.agent_id,
          body.project_id ?? null,
          body.task_id ?? null,
          body.platform ?? null,
          body.status ?? "running",
          body.last_output ?? null,
          body.source_ref ?? null,
          body.can_reply ?? false,
          body.can_pause ?? false,
          body.can_stop ?? false,
          JSON.stringify(body.metadata ?? {}),
        ],
      );
      return reply.code(201).send(rows[0]);
    },
  );

  // POST /api/agent-sessions/:id/reply — 回复（更新 last_interaction_at + last_output）
  fastify.post(
    "/api/agent-sessions/:id/reply",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { message?: string };

      // 简单的非空校验
      const message = body?.message?.trim();
      if (!message) {
        return reply.code(400).send({ error: "message is required" });
      }

      const rows = await query<any>(
        `UPDATE agent_sessions
         SET last_output = $1,
             last_interaction_at = now(),
             status = CASE WHEN status = 'waiting_user' THEN 'running' ELSE status END,
             updated_at = now()
         WHERE id = $2
         RETURNING *`,
        [message, id],
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: "agent session not found" });
      }
      return rows[0];
    },
  );

  // POST /api/agent-sessions/:id/pause — 暂停（status → idle）
  fastify.post(
    "/api/agent-sessions/:id/pause",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const rows = await query<any>(
        `UPDATE agent_sessions
         SET status = 'idle',
             last_interaction_at = now(),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id],
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: "agent session not found" });
      }
      return rows[0];
    },
  );

  // POST /api/agent-sessions/:id/stop — 停止（status → completed，记录 completed_at）
  fastify.post(
    "/api/agent-sessions/:id/stop",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const rows = await query<any>(
        `UPDATE agent_sessions
         SET status = 'completed',
             completed_at = now(),
             last_interaction_at = now(),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id],
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: "agent session not found" });
      }
      return rows[0];
    },
  );
}
