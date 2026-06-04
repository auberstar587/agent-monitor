import Fastify from "fastify";
import cors from "@fastify/cors";
import fs from "fs";
import path from "path";
import { closePool } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { loadConfig } from "./config.js";
import { getAdapter } from "./adapters/registry.js";
import { listProjects, registerProject } from "./services/project-registry.js";
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
import { fsRoutes } from "./routes/fs.js";
import { routes as engineRoutes } from "./routes/engines.js";
import { routes as chatRoutes } from "./routes/chat.js";
import { routes as skillApiRoutes } from "./routes/skill-api.js";
import { agentSessionRoutes } from "./routes/agent-sessions.js";
import { artifactRoutes } from "./routes/artifacts.js";
import { initScheduler, stopAllSchedulers } from "./services/scheduler.js";
import { syncRuntimes, startHealthCheck, stopHealthCheck } from "./services/runtime-service.js";
import { syncAgentsFromRuntimes } from "./services/agent-registry.js";

const config = loadConfig();

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: config.corsOrigins ?? true,
  credentials: true,
});

// Database migration
await migrate();
console.log("[server] database migrations applied");

// Bootstrap the current workspace so a fresh local install is not an empty shell.
try {
  const projects = await listProjects();
  if (projects.length === 0) {
    const workspaceRoot = findWorkspaceRoot(process.cwd());
    const project = await registerProject(
      workspaceRoot,
      path.basename(workspaceRoot),
      "Auto-registered local workspace",
    );
    console.log(`[server] bootstrapped current project: ${project.name} (${project.path})`);
  }
} catch (err) {
  console.warn("[server] project bootstrap skipped:", err);
}

// --- Adapter setup ---
console.log(`[server] using adapter: ${config.adapter}`);
const adapter = await getAdapter(config.adapter);
if (adapter) {
  console.log(`[server] adapter "${adapter.name}" initialized, capabilities:`, adapter.capabilities);
} else {
  console.warn(`[server] adapter "${config.adapter}" not found, available: manual, multica`);
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
await fastify.register(engineRoutes, { prefix: "/api/engines" });
await fastify.register(chatRoutes, { prefix: "/api/chat" });
await fastify.register(skillApiRoutes);

// Initialize scheduler
await initScheduler();

// v2.4.0: 启动时先 sync runtimes（detectInstalled），再 sync agents
try {
  const runtimeCount = await syncRuntimes();
  const agentCount = await syncAgentsFromRuntimes();
  console.log(`[server] boot: synced ${runtimeCount} runtimes, ${agentCount} engine agents`);
} catch (err) {
  console.warn("[server] runtime/agent sync on boot failed:", err);
}

// 启动 30s 周期 runtime 健康检查
startHealthCheck();

// --- Register agent routes (replaces inline agent endpoints) ---
await fastify.register(agentRoutes);
await fastify.register(taskRoutes);
await fastify.register(fsRoutes);
await fastify.register(agentSessionRoutes);
await fastify.register(artifactRoutes);

// --- Adapter-backed routes (legacy) ---
if (adapter) {
  fastify.get("/api/adapter/tasks", async (req) => {
    const { project_id } = req.query as { project_id?: string };
    return adapter.getTasks(project_id);
  });
  fastify.get("/api/adapter/tasks/:taskId/messages", async (req) => {
    const { taskId } = req.params as { taskId: string };
    return adapter.getTaskMessages(taskId);
  });
}

// Health check
fastify.get("/api/health", async () => ({
  status: "ok",
  version: "2.3.0",
  adapter: config.adapter,
  engines: ["multica", "claude-code"],
  timestamp: Date.now(),
}));

// Graceful shutdown
const shutdown = () => {
  console.log("[server] shutting down...");
  stopAllSchedulers();
  stopHealthCheck();
  closePool();
  fastify.close().then(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start
try {
  await fastify.listen({ port: config.port, host: config.host });
  console.log(`[server] agent-monitor v2.3.0 running on http://${config.host}:${config.port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

function findWorkspaceRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    if (
      fs.existsSync(path.join(current, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(current, ".git"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}
