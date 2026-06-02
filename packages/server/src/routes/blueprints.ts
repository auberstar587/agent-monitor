import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireUUID } from "./uuid-util.js";
import {
  createBlueprint, getBlueprint, listBlueprints, updateBlueprint, deleteBlueprint,
  cloneBlueprint,
  runBlueprint, getRun, listRuns, cancelRun,
} from '../services/blueprint-engine.js';

export async function blueprintRoutes(fastify: FastifyInstance) {
  // List all blueprints
  fastify.get('/api/blueprints', async () => {
    return listBlueprints();
  });

  // Create blueprint
  fastify.post('/api/blueprints', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = req.body as any;
      if (!data || !data.name) return reply.code(400).send({ error: 'name is required' });
      return await createBlueprint(data);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Get blueprint detail
  fastify.get('/api/blueprints/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const bp = await getBlueprint(id);
    if (!bp) return reply.code(404).send({ error: 'blueprint not found' });
    return bp;
  });

  // Update blueprint
  fastify.put('/api/blueprints/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const data = req.body as any;
    const bp = await updateBlueprint(id, data);
    if (!bp) return reply.code(404).send({ error: 'blueprint not found' });
    return bp;
  });

  // Delete blueprint
  fastify.delete('/api/blueprints/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const ok = await deleteBlueprint(id);
    if (!ok) return reply.code(404).send({ error: 'blueprint not found' });
    return { success: true };
  });

  // Clone blueprint
  fastify.post('/api/blueprints/:id/clone', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const bp = await cloneBlueprint(id);
    if (!bp) return reply.code(404).send({ error: 'blueprint not found' });
    return bp;
  });

  // Run blueprint
  fastify.post('/api/blueprints/:id/run', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    try {
      return await runBlueprint(id);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // List runs for a blueprint
  fastify.get('/api/blueprints/:id/runs', async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    return listRuns(id);
  });

  // Get run detail
  fastify.get('/api/blueprints/runs/:runId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { runId } = req.params as { runId: string };
    if (!requireUUID(runId, reply)) return;
    const run = await getRun(runId);
    if (!run) return reply.code(404).send({ error: 'run not found' });
    return run;
  });

  // Cancel run
  fastify.post('/api/blueprints/runs/:runId/cancel', async (req: FastifyRequest, reply: FastifyReply) => {
    const { runId } = req.params as { runId: string };
    if (!requireUUID(runId, reply)) return;
    await cancelRun(runId);
    return { success: true };
  });

  // Replace nodes/edges for a blueprint
  fastify.put('/api/blueprints/:id/nodes', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!requireUUID(id, reply)) return;
    const { nodes, edges } = req.body as { nodes: any[]; edges: any[] };
    if (!nodes || !edges) return reply.code(400).send({ error: 'nodes and edges required' });

    await import('../db/client.js').then(async ({ query }) => {
      // In a transaction, delete old nodes/edges and insert new ones
      const bp = await import('../services/blueprint-engine.js').then(m => m.getBlueprint(id));
      if (!bp) return reply.code(404).send({ error: 'blueprint not found' });

      // Get existing edge/run refs to validate safety
      const existingRuns = await import('../services/blueprint-engine.js').then(m => m.listRuns(id));
      if (existingRuns.some(r => r.status === 'running')) {
        return reply.code(400).send({ error: 'blueprint has active runs' });
      }

      // Delete old edges and nodes
      await query('DELETE FROM blueprint_edges WHERE blueprint_id = $1', [id]);
      await query('DELETE FROM blueprint_nodes WHERE blueprint_id = $1', [id]);

      // Re-insert with provided data
      const { randomUUID } = await import('node:crypto');
      const nodeIdMap = new Map<string, string>();
      for (const n of nodes) {
        const realId = randomUUID();
        const clientId = n.id || realId;
        nodeIdMap.set(clientId, realId);
        await query(
          `INSERT INTO blueprint_nodes (id, blueprint_id, type, name, config, position_x, position_y)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
          [realId, id, n.type, n.name || n.type, JSON.stringify(n.config || {}), n.position_x || 0, n.position_y || 0],
        );
      }
      for (const e of edges) {
        const src = nodeIdMap.get(e.source_node_id) || e.source_node_id;
        const tgt = nodeIdMap.get(e.target_node_id) || e.target_node_id;
        await query(
          `INSERT INTO blueprint_edges (blueprint_id, source_node_id, target_node_id, condition, label)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, src, tgt, e.condition || null, e.label || null],
        );
      }
    });

    return getBlueprint(id);
  });
}
