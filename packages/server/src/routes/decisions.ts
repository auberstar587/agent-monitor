import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { assessRisk } from '../services/decision-engine.js';

export async function decisionRoutes(fastify: FastifyInstance) {
  // Assess risk of an action
  fastify.post('/api/decisions/assess-risk', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as any;
    if (!body) return reply.code(400).send({ error: 'action description required' });
    return assessRisk({
      action: body.action || 'code_change',
      files: body.files || [],
      modules: body.modules || [],
      summary: body.summary,
    });
  });
}
