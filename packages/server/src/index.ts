import Fastify from "fastify";
import cors from "@fastify/cors";
import { closePool } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { loadConfig } from "./config.js";
import { getAdapter } from "./adapters/registry.js";
import { projectRoutes } from "./routes/projects.js";
import { outputRoutes } from "./routes/outputs.js";
import { memoryRoutes } from "./routes/memory.js";
import { traceRoutes } from "./routes/traces.js";
import { blueprintRoutes } from "./routes/blueprints.js";
import { meetingRoutes } from "./routes/meetings.js";
import { schedulerRoutes } from "./routes/scheduler.js";
import { decisionRoutes } from "./routes/decisions.js";
import { agentRoutes } from "./routes/agents.js";
import { taskRoutes } from "./routes/tasks.js";
import { initScheduler, stopAllSchedulers } from "./services/scheduler.js";

const config = loadConfig();

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: config.corsOrigins ?? true,
  credentials: true,
});

// Database migration
await migrate();
console.log("[server] database migrations applied");

// --- Adapter setup ---
console.log(`[server] using adapter: ${config.adapter}`);
const adapter = await getAdapter(config.adapter);
if (adapter) {
  console.log(`[server] adapter "${adapter.name}" initialized, capabilities:`, adapter.capabilities);
} else {
  console.warn(`[server] adapter "${config.adapter}" not found, available: mock, manual, multica`);
}

// --- Register routes ---
await fastify.register(projectRoutes);
await fastify.register(outputRoutes);
await fastify.register(memoryRoutes);
await fastify.register(traceRoutes);
await fastify.register(blueprintRoutes);
await fastify.register(meetingRoutes);
await fastify.register(schedulerRoutes);
await fastify.register(decisionRoutes);

// Initialize scheduler
await initScheduler();

// Sync agents from adapter to DB on startup
if (adapter) {
  const { syncAgentsFromAdapter } = await import("./services/agent-registry.js");
  const count = await syncAgentsFromAdapter(adapter);
  console.log(`[server] synced ${count} agents from adapter`);
}

// --- Register agent routes (replaces inline agent endpoints) ---
await fastify.register(agentRoutes);
await fastify.register(taskRoutes);

// --- Adapter-backed routes ---
fastify.get("/api/adapter/tasks", async (req) => {
  if (!adapter) return [];
  const { project_id } = req.query as { project_id?: string };
  return adapter.getTasks(project_id);
});

fastify.get("/api/adapter/tasks/:taskId/messages", async (req) => {
  if (!adapter) return [];
  const { taskId } = req.params as { taskId: string };
  return adapter.getTaskMessages(taskId);
});

// Health check
fastify.get("/api/health", async () => ({
  status: "ok",
  version: "2.0.0",
  adapter: config.adapter,
  timestamp: Date.now(),
}));

// Graceful shutdown
const shutdown = () => {
  console.log("[server] shutting down...");
  stopAllSchedulers();
  closePool();
  fastify.close().then(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start
try {
  await fastify.listen({ port: config.port, host: config.host });
  console.log(`[server] agent-monitor v2.0.0 running on http://${config.host}:${config.port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
