import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { Server } from 'socket.io';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ChatRoom } from './services/chat-room.js';
import { MeetingStateMachine } from './meeting-state.js';
import { MessageRouter } from './services/message-router.js';
import { AdapterRegistry } from './services/delivery/adapter-registry.js';
import { ProjectManager } from './services/project-manager.js';
import { TaskQueue } from './services/task-queue.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// Initialize Fastify
const fastify = Fastify({ logger: true });

// Register plugins
await fastify.register(cors);
await fastify.register(staticFiles, {
  root: path.join(__dirname, '..', 'public'),
});

// ===== Core Services =====

const chatRoom = new ChatRoom({
  heartbeatTimeout: 60000,
  maxMessages: 200,
});

const meetingSM = new MeetingStateMachine();

const projectManager = new ProjectManager();
projectManager.setChatRoom(chatRoom);
projectManager.load(); // Load persisted projects on startup

// ===== Message Router (bidirectional) =====

const adapterRegistry = new AdapterRegistry({
  openclaw: {
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789',
    gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || '',
  },
  hermes: {
    apiUrl: process.env.HERMES_API_URL || 'http://localhost:8642',
  },
  timeout: parseInt(process.env.DELIVERY_TIMEOUT_MS || '3000', 10),
});

const messageRouter = new MessageRouter({
  chatRoom,
  meetingSM,
  registry: adapterRegistry,
  mode: process.env.MESSAGE_ROUTING_MODE || 'meeting',
});

// MessageRouter events
messageRouter.on('routed', ({ message, targets, results }) => {
  const successCount = results.filter((r) => r.success).length;
  console.log(`[MessageRouter] Routed "${message.agentId}" message to ${successCount}/${targets.length} agents`);
});

messageRouter.on('delivery:failed', ({ agentId, platform, error }) => {
  console.warn(`[MessageRouter] Delivery failed: ${agentId} (${platform}): ${error}`);
});

// ===== Task Queue =====

const taskQueue = new TaskQueue();
taskQueue.setChatRoom(chatRoom);
taskQueue.setMessageRouter(messageRouter);
taskQueue.load();

// Auto-dispatch when agent becomes idle
chatRoom.on('agent:status', ({ agentId, status }) => {
  taskQueue.onAgentStatus(agentId, status);
});

// ===== Socket.io =====

const io = new Server(fastify.server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ---- ChatRoom → Socket.io Bridge ----
chatRoom.on('agent:join', ({ agent }) => {
  io.emit('chat:join', agent);
  io.emit('chat:agents', chatRoom.getAgents());
});

chatRoom.on('agent:leave', ({ agent }) => {
  io.emit('chat:leave', { agentId: agent.agentId });
  io.emit('chat:agents', chatRoom.getAgents());
});

chatRoom.on('agent:status', ({ agent, prevStatus, status }) => {
  io.emit('chat:status', { agentId: agent.agentId, status, prevStatus, agent });
});

chatRoom.on('message:new', (msg) => {
  io.emit('chat:message', msg);
});

// ---- TaskQueue → Socket.io Bridge ----
taskQueue.on('task:created', ({ task }) => io.emit('task:created', task));
taskQueue.on('task:dispatched', ({ task }) => io.emit('task:updated', task));
taskQueue.on('task:started', ({ task }) => io.emit('task:updated', task));
taskQueue.on('task:progress', ({ task, progress }) => io.emit('task:progress', { taskId: task.id, progress }));
taskQueue.on('task:completed', ({ task }) => io.emit('task:updated', task));
taskQueue.on('task:failed', ({ task }) => io.emit('task:updated', task));
taskQueue.on('task:cancelled', ({ task }) => io.emit('task:updated', task));
taskQueue.on('task:retried', ({ task }) => io.emit('task:updated', task));

// ---- Meeting State → Socket.io + ChatRoom ----
meetingSM.on('stateChange', (eventData) => {
  const meetingState = meetingSM.getState();
  io.emit('meeting:state', meetingState);

  if (eventData.event === 'meeting:start' || eventData.event === 'meeting:invite') {
    const title = meetingState.meeting?.title || 'Team Sync';
    chatRoom.sendSystemMessage(`📋 会议开始: ${title}`);

    // Update all agents to meeting status
    for (const [agentId] of chatRoom.agents) {
      chatRoom.updateStatus(agentId, 'meeting');
    }
  } else if (eventData.event === 'meeting:end') {
    const reason = eventData.reason || '';
    chatRoom.sendSystemMessage(`📋 会议结束${reason ? ` (${reason})` : ''}`);

    // Reset all agents to idle
    for (const [agentId] of chatRoom.agents) {
      chatRoom.updateStatus(agentId, 'idle');
    }
  }
});

// ---- Socket.io Client Handlers ----
io.on('connection', (socket) => {
  console.log('[Socket.io] Client connected:', socket.id);

  // Send current state on connect
  socket.emit('chat:agents', chatRoom.getAgents());
  socket.emit('chat:messages', chatRoom.getMessages(50));
  socket.emit('meeting:state', meetingSM.getState());
  socket.emit('tasks:all', taskQueue.getAll());

  // Handle meeting events from frontend
  socket.on('meeting:start', (data) => {
    meetingSM.start(data);
  });

  socket.on('meeting:end', () => {
    meetingSM.end();
  });

  socket.on('disconnect', () => {
    console.log('[Socket.io] Client disconnected:', socket.id);
  });
});

// ===== Chat Room HTTP API =====
// These endpoints are called by agents (via hook/skill) to interact with the monitor

// Agent joins the chat room
fastify.post('/api/chat/join', async (req) => {
  const { agentId, agentName, name, role, model, platform, color, type, todayTasks, successRate, ...extra } = req.body || {};
  if (!agentId) {
    throw { statusCode: 400, message: 'agentId is required' };
  }
  const agent = chatRoom.join(agentId, {
    agentName: agentName || name,
    role, model, platform, color, type, todayTasks, successRate, ...extra,
  });
  return { success: true, agent };
});

// Agent leaves the chat room
fastify.post('/api/chat/leave', async (req) => {
  const { agentId } = req.body || {};
  if (!agentId) {
    throw { statusCode: 400, message: 'agentId is required' };
  }
  chatRoom.leave(agentId);
  return { success: true };
});

// Agent status update (hook channel)
fastify.post('/api/chat/status', async (req) => {
  const { agentId, status, agentName, task, type, model, todayTasks, successRate, ...extra } = req.body || {};
  if (!agentId) {
    throw { statusCode: 400, message: 'agentId is required' };
  }
  if (status && !['idle', 'working', 'meeting', 'away', 'speaking'].includes(status)) {
    throw { statusCode: 400, message: `Invalid status: ${status}` };
  }
  const agent = chatRoom.updateStatus(agentId, status || 'idle', { agentName, task, type, model, todayTasks, successRate, ...extra });
  return { success: true, agent };
});

// Agent sends a message (skill channel)
fastify.post('/api/chat/message', async (req) => {
  const { agentId, content, type, context, replyTo, agentName, ...extra } = req.body || {};
  if (!agentId || !content) {
    throw { statusCode: 400, message: 'agentId and content are required' };
  }
  const msg = chatRoom.sendMessage(agentId, content, { type, context, replyTo, agentName, ...extra });
  return { success: true, message: msg };
});

// Get online agents
fastify.get('/api/chat/agents', async () => ({
  agents: chatRoom.getAgents(),
  total: chatRoom.agents.size,
}));

// Get recent messages
fastify.get('/api/chat/messages', async (req) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const messages = chatRoom.getMessages(limit);
  return { messages, total: messages.length };
});

// ===== Legacy API (kept for backward compatibility) =====

fastify.get('/api/health', async () => {
  // 动态读取 package.json 的 version
  let version = '1.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    version = pkg.version || version;
  } catch (err) {
    console.warn('[Health] Failed to read version:', err.message);
  }
  return {
    status: 'ok',
    timestamp: Date.now(),
    version,
  };
});

// ===== Agent Config API (静态配置，来自 OpenClaw) =====

fastify.get('/api/config/agents', async (req, reply) => {
  const openclawConfigPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  let agents = [];

  try {
    if (fs.existsSync(openclawConfigPath)) {
      const config = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf-8'));
      const agentList = config?.agents?.list || [];

      // defaults 里包含全局 model 配置
      const defaults = config?.agents?.defaults || {};
      const defaultModel = defaults.model || {};

      // 合并 ChatRoom 实时状态（online agents 有真实 status）
      const onlineAgents = chatRoom.getAgents
        ? new Map(chatRoom.agents)
        : new Map();

      agents = agentList.map(a => {
        // 合并全局默认 model
        const model = a.model || defaultModel.primary || '';
        const fallbacks = a.model?.fallbacks || defaultModel.fallbacks || [];

        // ChatRoom 在线则用实时状态，否则默认 offline
        const online = onlineAgents.get(a.id);
        const status = online?.status || 'offline';

        return {
          agentId: a.id,
          name: a.name || a.id,
          default: a.default || false,
          workspace: a.workspace || '',
          model: typeof model === 'string' ? model : (model.primary || ''),
          fallbacks: typeof model === 'string' ? fallbacks : (model.fallbacks || []),
          skills: a.skills || [],
          status,
        };
      });
    }
  } catch (err) {
    console.warn('[Config] Failed to read openclaw.json:', err.message);
  }

  return { agents, total: agents.length };
});

fastify.get('/api/agents/:id', async (req) => {
  const agent = chatRoom.getAgent(req.params.id);
  if (!agent) {
    throw { statusCode: 404, message: 'Agent not found' };
  }
  return agent;
});

fastify.get('/api/agents/:id/messages', async (req) => {
  const messages = chatRoom.getMessagesByAgent(req.params.id, 50);
  return { agentId: req.params.id, messages };
});

fastify.get('/api/messages', async (req) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const messages = chatRoom.getMessages(limit);
  return { messages, total: messages.length };
});

fastify.get('/api/stats', async () => chatRoom.getStats());

// ===== System Stats API =====
fastify.get('/api/system/stats', async () => {
  const cpuLoad = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // Get disk usage
  let diskUsage = { total: 0, used: 0, free: 0, usagePercent: 0 };
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // df -k output: Filesystem 512-blocks Used Available Capacity iused ifree %iused Mounted
      // parts: [0=device, 1=512-blocks(total), 2=Used, 3=Available, 4=Capacity%, 5=iused, 6=ifree, 7=%iused, 8=mounted]
      const { stdout } = await execAsync('df -k / | tail -1');
      const parts = stdout.trim().split(/\s+/);
      const total = parseInt(parts[1], 10) * 512;  // 512-blocks → bytes
      const used = parseInt(parts[2], 10) * 512;  // 512-blocks → bytes
      const free = parseInt(parts[3], 10) * 512;  // 512-blocks → bytes
      // 直接解析 df 已算好的百分比（parts[4] = "9%"），比自行计算更准
      const usagePercent = parseInt(parts[4], 10);
      diskUsage = {
        total,
        used,
        free,
        usagePercent: isNaN(usagePercent) ? Math.round((used / total) * 100) : usagePercent,
      };
    }
  } catch (err) {
    console.warn('[SystemStats] Failed to get disk usage:', err.message);
  }

  // Get CPU count
  const cpuCount = os.cpus().length;

  return {
    platform: process.platform,  // darwin/linux/win32
    os: os.platform() === 'darwin' ? 'macOS' : (os.platform() === 'win32' ? 'Windows' : 'Linux'),
    cpu: {
      cores: cpuCount,
      load: cpuLoad,
      usagePercent: Math.min(100, Math.round(cpuLoad[0] / cpuCount * 100)),
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      usagePercent: Math.round((usedMem / totalMem) * 100),
    },
    disk: {
      total: diskUsage.total,
      used: diskUsage.used,
      free: diskUsage.free,
      usagePercent: diskUsage.usagePercent,
    },
    timestamp: Date.now(),
  };
});

// ===== Port Scanning API =====

fastify.get('/api/system/ports', async () => {
  // Collect ports from all projects
  const projects = projectManager.getAll();
  const portMap = {};
  for (const p of projects) {
    if (p.port > 0) {
      portMap[p.port] = { projectId: p.id, projectName: p.name };
    }
  }

  // Scan common ports + project ports
  const allPorts = new Set([3000, 3001, 4000, 5000, 5173, 8000, 8080, 8642, 18789]);
  for (const p of projects) {
    if (p.port > 0) allPorts.add(p.port);
  }

  const results = [];
  for (const port of [...allPorts].sort((a, b) => a - b)) {
    const inUse = await isPortInUse(port);
    results.push({
      port,
      inUse,
      project: portMap[port] || null,
      pid: inUse ? await getPidForPort(port) : null,
    });
  }

  // Detect conflicts: same port assigned to multiple projects
  const conflicts = [];
  const portCounts = {};
  for (const p of projects) {
    if (p.port > 0) {
      portCounts[p.port] = portCounts[p.port] || [];
      portCounts[p.port].push(p.name);
    }
  }
  for (const [port, names] of Object.entries(portCounts)) {
    if (names.length > 1) {
      conflicts.push({ port: parseInt(port), projects: names });
    }
  }

  return { ports: results, conflicts };
});

async function isPortInUse(port) {
  try {
    const { stdout } = await execAsync(`lsof -ti :${port} 2>/dev/null`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function getPidForPort(port) {
  try {
    const { stdout } = await execAsync(`lsof -ti :${port} 2>/dev/null | head -1`);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

// Meeting API endpoints
fastify.post('/api/meeting/start', async (req) => {
  const { topic, participants } = req.body || {};
  const result = await meetingSM.emitEvent('meeting:start', { title: topic, participants });
  return { success: result.success, state: meetingSM.getState() };
});

fastify.post('/api/meeting/join', async (req) => {
  const { agentId } = req.body || {};
  const result = await meetingSM.emitEvent('meeting:join', { agentId });
  return { success: result.success, state: meetingSM.getState() };
});

fastify.post('/api/meeting/end', async () => {
  const result = await meetingSM.emitEvent('meeting:end');
  return { success: result.success, state: meetingSM.getState() };
});

fastify.get('/api/meeting/state', async () => meetingSM.getState());

// ===== Task Queue API =====

// Get all tasks
fastify.get('/api/tasks', async (req) => {
  const { agentId, status } = req.query || {};
  const tasks = taskQueue.getAll({ agentId, status });
  const stats = taskQueue.getStats();
  return { tasks, total: tasks.length, stats };
});

// Get task stats
fastify.get('/api/tasks/stats', async () => taskQueue.getStats());

// Create a new task
fastify.post('/api/tasks', async (req) => {
  const task = taskQueue.create(req.body || {});
  return { success: true, task };
});

// Agent claims next task (pull mode)
fastify.post('/api/tasks/claim', async (req) => {
  const { agentId } = req.body || {};
  if (!agentId) throw { statusCode: 400, message: 'agentId is required' };
  const task = taskQueue.claimNext(agentId);
  if (!task) return { success: true, task: null, message: 'No tasks available' };
  return { success: true, task };
});

// Get a single task
fastify.get('/api/tasks/:id', async (req) => {
  const task = taskQueue.get(req.params.id);
  if (!task) throw { statusCode: 404, message: 'Task not found' };
  return task;
});

// Agent starts a task
fastify.post('/api/tasks/:id/start', async (req) => {
  const task = taskQueue.start(req.params.id);
  return { success: true, task };
});

// Agent reports progress
fastify.post('/api/tasks/:id/progress', async (req) => {
  const task = taskQueue.updateProgress(req.params.id, req.body || {});
  return { success: true, task };
});

// Agent completes a task
fastify.post('/api/tasks/:id/complete', async (req) => {
  const task = taskQueue.complete(req.params.id, req.body || {});
  return { success: true, task };
});

// Agent fails a task
fastify.post('/api/tasks/:id/fail', async (req) => {
  const task = taskQueue.fail(req.params.id, req.body || {});
  return { success: true, task };
});

// Cancel a task
fastify.delete('/api/tasks/:id', async (req) => {
  const task = taskQueue.cancel(req.params.id);
  if (!task) throw { statusCode: 404, message: 'Task not found' };
  return { success: true };
});

// ===== Project CRUD API =====

// Get all projects
fastify.get('/api/projects', async () => {
  const projects = projectManager.getAll();
  const stats = projectManager.getStats();
  return { projects, total: projects.length, stats };
});

// Get a single project
fastify.get('/api/projects/:id', (req) => {
  const project = projectManager.get(req.params.id);
  if (!project) {
    throw { statusCode: 404, message: 'Project not found' };
  }
  return project;
});

// Create a new project
fastify.post('/api/projects', (req) => {
  const project = projectManager.create(req.body || {});
  return { success: true, project };
});

// Update a project
fastify.put('/api/projects/:id', (req) => {
  const project = projectManager.update(req.params.id, req.body || {});
  if (!project) {
    throw { statusCode: 404, message: 'Project not found' };
  }
  return { success: true, project };
});

// Delete a project
fastify.delete('/api/projects/:id', (req) => {
  const deleted = projectManager.delete(req.params.id);
  if (!deleted) {
    throw { statusCode: 404, message: 'Project not found' };
  }
  return { success: true };
});

// Get project statistics
fastify.get('/api/projects/:id/stats', (req) => {
  const stats = projectManager.getProjectStats(req.params.id);
  if (!stats) {
    throw { statusCode: 404, message: 'Project not found' };
  }
  return stats;
});

// Import projects from a directory
fastify.post('/api/projects/import', async (req) => {
  const { path: dirPath } = req.body || {};
  const targetPath = dirPath || path.join(os.homedir(), 'AI');
  const imported = await projectManager.importFromDirectory(targetPath);
  return {
    success: true,
    imported: imported.length,
    projects: imported,
    scannedPath: targetPath,
  };
});

// ===== Graceful Shutdown =====

const shutdown = async () => {
  console.log('[Server] Shutting down...');
  messageRouter.stop();
  chatRoom.stop();
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ===== Start =====

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[Server] Running on http://localhost:${PORT}`);

    // Start chat room
    chatRoom.start();

    // Start message router
    messageRouter.start();

    console.log('[Server] All services started successfully');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
