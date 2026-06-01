import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  scheduleBlueprint, unscheduleBlueprint, listScheduled,
} from '../services/scheduler.js';

export async function schedulerRoutes(fastify: FastifyInstance) {
  // List all scheduled jobs
  fastify.get('/api/scheduler', async () => {
    return listScheduled();
  });

  // Schedule a blueprint
  fastify.post('/api/scheduler', async (req: FastifyRequest, reply: FastifyReply) => {
    const { blueprint_id, cron } = req.body as { blueprint_id: string; cron: string };
    if (!blueprint_id || !cron) {
      return reply.code(400).send({ error: 'blueprint_id and cron are required' });
    }
    try {
      return await scheduleBlueprint(blueprint_id, cron);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Unschedule a blueprint
  fastify.delete('/api/scheduler/:blueprintId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { blueprintId } = req.params as { blueprintId: string };
    await unscheduleBlueprint(blueprintId);
    return { success: true };
  });
}
