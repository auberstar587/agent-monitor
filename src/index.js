import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { Server } from 'socket.io';
import { AgentRegistry } from './services/agent-registry.js';
import { MessageCapture } from './services/message-capture.js';
import path from 'path';
import { fileURLToPath }';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Initialize Fastify
const fastify = Fastify({ logger: true });

// Register plugins
await fastify.register(cors);
await fastify.register(websocket);
await fastify.register(staticFiles, {
  root: path.join(__dirname, '..', 'public')
});

// Initialize services
const agentRegistry = new AgentRegistry();
const messageCapture = new MessageCapture();

// Initialize Socket.io
const io = new Server(fastify.server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Socket.io handlers
io.on('connection', (socket) => {
  console.log('[Socket.io] Client connected:', socket.id);

  // Send current state on connect
  socket.emit('state:init', agentRegistry.getAllStates());

  // Handle meeting events
  socket.on('meeting:start', (data) => {
    console.log('[Meeting] Started:', data);
    io.emit('scene:change', { scene: 'meeting', data });
  });

  socket.on('meeting:end', () => {
    console.log('[Meeting] Ended');
    io.emit('scene:change', { scene: 'workspace' });
  });

  socket.on('disconnect', () => {
    console.log('[Socket.io] Client disconnected:', socket.id);
  });
});

// Broadcast agent state changes
agentRegistry.on('stateChange', (state) => {
  io.emit('state:update', state);
});

// Broadcast messages
messageCapture.on('message', (msg) => {
  io.emit('message:new', msg);
});

// API Routes
fastify.get('/api/health', async () => ({ status: 'ok' }));

fastify.get('/api/agents', async () => agentRegistry.getAllStates());

fastify.get('/api/agents/:id', async (req) => {
  const state = agentRegistry.getState(req.params.id);
  if (!state) {
    throw { statusCode: 404, message: 'Agent not found' };
  }
  return state;
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[Server] Running on http://localhost:${PORT}`);
    
    // Start services
    agentRegistry.start();
    messageCapture.start();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
