import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createMeeting, getMeeting, listMeetings, runMeeting,
} from '../services/meeting-service.js';

export async function meetingRoutes(fastify: FastifyInstance) {
  // List all meetings
  fastify.get('/api/meetings', async () => {
    return listMeetings();
  });

  // Create meeting
  fastify.post('/api/meetings', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = req.body as any;
      if (!data || !data.title || !data.participants?.length) {
        return reply.code(400).send({ error: 'title and participants required' });
      }
      return await createMeeting({
        title: data.title,
        blueprint_run_id: data.blueprint_run_id,
        participants: data.participants,
        rounds: data.rounds,
        consensus_rule: data.consensus_rule,
        chairman_agent: data.chairman_agent,
      });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Get meeting detail
  fastify.get('/api/meetings/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const meeting = await getMeeting(id);
    if (!meeting) return reply.code(404).send({ error: 'meeting not found' });
    return meeting;
  });

  // Start meeting execution
  fastify.post('/api/meetings/:id/start', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      return await runMeeting(id);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });
}
