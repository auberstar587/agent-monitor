import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createOutput, getOutput, listOutputs, getOutputTimeline,
} from "../services/agent-output-collector.js";

export async function outputRoutes(fastify: FastifyInstance) {
  fastify.get("/api/outputs", async (req: FastifyRequest) => {
    const { project_id, source, direction, since, limit } = req.query as {
      project_id?: string; source?: string; direction?: string; since?: string; limit?: string;
    };
    return listOutputs({
      project_id,
      source,
      direction,
      since,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  });

  fastify.post("/api/outputs", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      project_id?: string; session_id?: string; source: string;
      direction: string; title: string; content: string;
      summary?: string; tags?: string[]; parent_id?: string;
    };
    if (!body.source || !body.title || !body.content) {
      return reply.code(400).send({ error: "source, title, content are required" });
    }
    return createOutput(body);
  });

  fastify.get("/api/outputs/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const output = await getOutput(id);
    if (!output) return reply.code(404).send({ error: "output not found" });
    return output;
  });

  fastify.get("/api/timeline", async (req: FastifyRequest) => {
    const { project_id, limit } = req.query as { project_id?: string; limit?: string };
    return getOutputTimeline(project_id, limit ? parseInt(limit, 10) : undefined);
  });
}
