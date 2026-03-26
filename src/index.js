import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentRegistry } from './services/agent-registry.js';
import { MessageCapture } from './services/message-capture.js';
import redis from './services/redis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// Redis configuration
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

// Gateway configuration for message capture
const GATEWAY_CONFIG = {
  host: process.env.OPENCLAW_GATEWAY_HOST || 'localhost',
  port: parseInt(process.env.OPENCLAW_GATEWAY_PORT || '18789', 10),
};

// Initialize Fastify
const fastify = Fastify({ logger: true });

// Register plugins
await fastify.register(cors);
await fastify.register(websocket);
await fastify.register(staticFiles, {
  root: path.join(__dirname, '..', 'public'),
});

// Initialize services
const agentRegistry = new AgentRegistry({
  heartbeatTimeout: 30000,
  checkInterval: 10000,
});

const messageCapture = new MessageCapture({
  maxMessages: 200,
  gateway: GATEWAY_CONFIG,
});

// Initialize Socket.io
const io = new Server(fastify.server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Socket.io handlers
io.on('connection', (socket) => {
  console.log('[Socket.io] Client connected:', socket.id);

  // Send current state on connect
  socket.emit('state:init', agentRegistry.getAllStates());

  // Handle meeting events
  socket.on('meeting:start', (data) => {
    console.log('[Meeting] Started:', data);
    
    // Update all agents to meeting status
    for (const agent of agentRegistry.getAllStates()) {
      agentRegistry.setStatus(agent.agentId, 'meeting', {
        currentTask: data.topic || 'Meeting',
        sessionId: data.sessionId,
      });
    }
    
    io.emit('scene:change', { scene: 'meeting', data });
  });

  socket.on('meeting:end', () => {
    console.log('[Meeting] Ended');
    
    // Reset all meeting agents to idle
    for (const agent of agentRegistry.getAgentsByStatus('meeting')) {
      agentRegistry.setStatus(agent.agentId, 'idle', {
        currentTask: null,
        sessionId: null,
      });
    }
    
    io.emit('scene:change', { scene: 'workspace' });
  });

  // Handle agent status update requests
  socket.on('agent:status', ({ agentId, status, ...extra }) => {
    console.log(`[Socket.io] Agent ${agentId} status change: ${status}`);
    agentRegistry.setStatus(agentId, status, extra);
  });

  // Handle heartbeat refresh
  socket.on('agent:heartbeat', ({ agentId }) => {
    agentRegistry.refreshHeartbeat(agentId);
  });

  // Handle subscribe to specific agents
  socket.on('subscribe', ({ agentIds }) => {
    if (agentIds && Array.isArray(agentIds)) {
      socket.data.subscribedAgents = agentIds;
      console.log(`[Socket.io] Client ${socket.id} subscribed to:`, agentIds);
    }
  });

  socket.on('disconnect', () => {
    console.log('[Socket.io] Client disconnected:', socket.id);
  });
});

// Broadcast agent state changes
agentRegistry.on('stateChange', (state, prevState) => {
  io.emit('state:update', { state, prevState });
});

// Broadcast state change events
agentRegistry.on('stateChangeEvent', (event) => {
  io.emit('state:event', event);
});

// Broadcast agent timeout events
agentRegistry.on('agentTimeout', (agentId, elapsed) => {
  console.log(`[Event] Agent ${agentId} timed out after ${elapsed}ms`);
  io.emit('agent:timeout', { agentId, elapsed, timestamp: Date.now() });
});

// Broadcast messages
messageCapture.on('message', (msg) => {
  io.emit('message:new', msg);
});

// Gateway connection events
messageCapture.on('gatewayConnected', () => {
  io.emit('gateway:connected');
});

messageCapture.on('gatewayDisconnected', (info) => {
  io.emit('gateway:disconnected', info);
});

messageCapture.on('gatewayError', (err) => {
  io.emit('gateway:error', { message: err.message });
});

// API Routes
fastify.get('/api/health', async () => ({
  status: 'ok',
  timestamp: Date.now(),
}));

fastify.get('/api/agents', async () => ({
  agents: agentRegistry.getAllStates(),
  total: agentRegistry.agents.size,
}));

fastify.get('/api/agents/:id', async (req) => {
  const state = agentRegistry.getState(req.params.id);
  if (!state) {
    throw { statusCode: 404, message: 'Agent not found' };
  }
  return state;
});

fastify.get('/api/agents/:id/messages', async (req) => {
  const messages = messageCapture.getMessagesByAgent(req.params.id, 50);
  return { agentId: req.params.id, messages };
});

// Get messages by session
fastify.get('/api/sessions/:sessionId/messages', async (req) => {
  const messages = messageCapture.getMessagesBySession(req.params.sessionId, 50);
  return { sessionId: req.params.sessionId, messages };
});

// Get recent messages
fastify.get('/api/messages', async (req) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const messages = messageCapture.getRecentMessages(limit);
  return { messages, total: messages.length };
});

// Get system stats
fastify.get('/api/stats', async () => ({
  agents: {
    total: agentRegistry.agents.size,
    byStatus: {
      idle: agentRegistry.getAgentsByStatus('idle').length,
      working: agentRegistry.getAgentsByStatus('working').length,
      meeting: agentRegistry.getAgentsByStatus('meeting').length,
      away: agentRegistry.getAgentsByStatus('away').length,
    },
  },
  gateway: messageCapture.getStats(),
  redis: {
    connected: redis.isReady(),
  },
}));

// Agent control endpoints
fastify.post('/api/agents/:id/status', async (req) => {
  const { status, ...extra } = req.body;
  if (!status) {
    throw { statusCode: 400, message: 'Status is required' };
  }
  const state = await agentRegistry.setStatus(req.params.id, status, extra);
  return { success: true, state };
});

fastify.post('/api/agents/:id/heartbeat', async (req) => {
  const state = await agentRegistry.refreshHeartbeat(req.params.id);
  if (!state) {
    throw { statusCode: 404, message: 'Agent not found' };
  }
  return { success: true, state };
});

// Graceful shutdown
const shutdown = async () => {
  console.log('[Server] Shutting down...');
  
  agentRegistry.stop();
  messageCapture.stop();
  await redis.disconnect();
  
  await fastify.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[Server] Running on http://localhost:${PORT}`);
    
    // Start services
    await agentRegistry.start(REDIS_CONFIG);
    await messageCapture.start(GATEWAY_CONFIG);
    
    console.log('[Server] All services started successfully');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
