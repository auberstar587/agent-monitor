import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireUUID } from "./uuid-util.js";
import { query, queryOne } from "../db/client.js";

/** 列表：支持 project_id / task_id / status / type 过滤 */
export async function artifactRoutes(fastify: FastifyInstance) {
  fastify.get("/api/artifacts", async (req: FastifyRequest) => {
    const { project_id, task_id, status, type } = req.query as {
      project_id?: string; task_id?: string; status?: string; type?: string;
    };
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (project_id) { conditions.push(`project_id = $${idx++}`); params.push(project_id); }
    if (task_id) { conditions.push(`task_id = $${idx++}`); params.push(task_id); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (type) { conditions.push(`type = $${idx++}`); params.push(type); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    return query(
      `SELECT * FROM artifacts ${where} ORDER BY created_at DESC LIMIT 100`,
      params,
    );
  });

  /** 详情 */
  fastify.get("/api/artifacts/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const row = await queryOne("SELECT * FROM artifacts WHERE id = $1", [id]);
    if (!row) return reply.code(404).send({ error: "artifact not found" });
    return row;
  });

  /** 创建（必填：title, type） */
  fastify.post("/api/artifacts", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      project_id?: string; task_id?: string; agent_id?: string;
      source_output_id?: string; type?: string; title?: string;
      content?: string; summary?: string;
      git_branch?: string; git_commit?: string; metadata?: any;
    };
    if (!body.title || !body.type) {
      return reply.code(400).send({ error: "title and type are required" });
    }

    const row = await queryOne(
      `INSERT INTO artifacts
         (project_id, task_id, agent_id, source_output_id, type, title,
          content, summary, git_branch, git_commit, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        body.project_id ?? null,
        body.task_id ?? null,
        body.agent_id ?? null,
        body.source_output_id ?? null,
        body.type,
        body.title,
        body.content ?? null,
        body.summary ?? null,
        body.git_branch ?? null,
        body.git_commit ?? null,
        body.metadata ? JSON.stringify(body.metadata) : null,
      ],
    );
    return row;
  });

  /** 提交审查：draft → submitted */
  fastify.post("/api/artifacts/:id/submit", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;

    // 先校验当前状态
    const existing = await queryOne("SELECT status FROM artifacts WHERE id = $1", [id]);
    if (!existing) return reply.code(404).send({ error: "artifact not found" });
    if ((existing as any).status !== "draft") {
      return reply.code(400).send({ error: "only draft artifacts can be submitted" });
    }

    const row = await queryOne(
      `UPDATE artifacts SET status = 'submitted', updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id],
    );
    return row;
  });

  /** 接受：submitted → accepted */
  fastify.post("/api/artifacts/:id/accept", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const { review_comment, reviewed_by } = (req.body ?? {}) as {
      review_comment?: string; reviewed_by?: string;
    };

    const existing = await queryOne("SELECT status FROM artifacts WHERE id = $1", [id]);
    if (!existing) return reply.code(404).send({ error: "artifact not found" });
    if ((existing as any).status !== "submitted") {
      return reply.code(400).send({ error: "only submitted artifacts can be accepted" });
    }

    const row = await queryOne(
      `UPDATE artifacts
          SET status = 'accepted',
              review_comment = COALESCE($1, review_comment),
              reviewed_by = $2,
              reviewed_at = now(),
              updated_at = now()
        WHERE id = $3 RETURNING *`,
      [review_comment ?? null, reviewed_by ?? "user", id],
    );
    return row;
  });

  /** 退回：submitted → rejected（review_comment 必填） */
  fastify.post("/api/artifacts/:id/reject", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const { review_comment, reviewed_by } = (req.body ?? {}) as {
      review_comment?: string; reviewed_by?: string;
    };

    if (!review_comment) {
      return reply.code(400).send({ error: "review_comment is required when rejecting" });
    }

    const existing = await queryOne("SELECT status FROM artifacts WHERE id = $1", [id]);
    if (!existing) return reply.code(404).send({ error: "artifact not found" });
    if ((existing as any).status !== "submitted") {
      return reply.code(400).send({ error: "only submitted artifacts can be rejected" });
    }

    const row = await queryOne(
      `UPDATE artifacts
          SET status = 'rejected',
              review_comment = $1,
              reviewed_by = $2,
              reviewed_at = now(),
              updated_at = now()
        WHERE id = $3 RETURNING *`,
      [review_comment, reviewed_by ?? "user", id],
    );
    return row;
  });

  /** 删除 */
  fastify.delete("/api/artifacts/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const row = await queryOne(
      "DELETE FROM artifacts WHERE id = $1 RETURNING id",
      [id],
    );
    if (!row) return reply.code(404).send({ error: "artifact not found" });
    return { deleted: true };
  });
}
