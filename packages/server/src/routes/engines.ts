import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { getRegisteredEngines, getEngine } from '../adapters/registry.js';

export async function routes(fastify: FastifyInstance, options: FastifyPluginOptions): Promise<void> {

  // GET /api/engines — 列出所有已注册的引擎
  fastify.get('/', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const names = getRegisteredEngines();
    const engines = await Promise.all(
      names.map(async (name) => {
        const engine = await getEngine(name);
        return engine ? {
          id: engine.id,
          label: engine.label,
          installed: engine.installed,
        } : null;
      })
    );
    return engines.filter(Boolean);
  });

  // GET /api/engines/:id — 获取引擎详情（含 installed 状态）
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const engine = await getEngine(id);
    if (!engine) {
      reply.code(404).send({ error: `Engine not found: ${id}` });
      return;
    }
    return {
      id: engine.id,
      label: engine.label,
      installed: await engine.detectInstalled(),
    };
  });

}
