import WebSocket from 'ws';
import type { PlatformEventHandler, TaskEvent, TaskMessageDTO, AgentStatusEvent } from '../interface.js';

export interface MulticaWsOptions {
  url: string;
  token?: string;
  /** 认证方式：query = URL query param, msg = 连接后发送 auth 消息 */
  authMode?: 'query' | 'msg';
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  pingInterval?: number;
}

export function connectMulticaWS(
  handler: PlatformEventHandler,
  options: MulticaWsOptions
): () => void {
  const {
    token,
    authMode = 'query',
    reconnectDelay = 2000,
    maxReconnectDelay = 30000,
    pingInterval = 30000,
  } = options;

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let currentDelay = reconnectDelay;
  let stopped = false;

  // Build URL with auth
  const url = authMode === 'query' && token
    ? `${options.url}${options.url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
    : options.url;

  function connect() {
    if (stopped) return;

    ws = new WebSocket(url);

    ws.on('open', () => {
      console.log(`[MulticaWS] Connected to ${url}`);
      currentDelay = reconnectDelay;

      // Auth via message
      if (authMode === 'msg' && token) {
        ws!.send(JSON.stringify({ type: 'auth', token }));
      }

      // Start ping
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, pingInterval);
    });

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        dispatch(data);
      } catch (e) {
        // Ignore non-JSON messages
      }
    });

    ws.on('close', (code) => {
      console.log(`[MulticaWS] Disconnected (code: ${code})`);
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }

      if (!stopped) {
        scheduleReconnect();
      }
    });

    ws.on('error', (err) => {
      console.warn(`[MulticaWS] Error: ${err.message}`);
      // close event will fire after error
    });
  }

  function dispatch(data: any) {
    const { type, payload } = data;

    // Task events
    if (type?.startsWith('task:')) {
      const event: TaskEvent = {
        type: type as TaskEvent['type'],
        taskId: payload?.task_id || data.task_id || '',
        data: payload,
      };
      handler.onTaskEvent(event);

      // If this is a message event, also call onTaskMessage
      if (type === 'task:message' && payload) {
        const msg: TaskMessageDTO & { taskId: string } = {
          seq: payload.seq ?? 0,
          type: payload.type ?? 'text',
          tool: payload.tool,
          content: payload.content,
          input: payload.input,
          output: payload.output,
          taskId: payload.task_id ?? '',
        };
        handler.onTaskMessage(msg);
      }
    }

    // Agent events
    if (type?.startsWith('agent:')) {
      const event: AgentStatusEvent = {
        type: (type === 'agent:status' ? 'agent:online' : type) as AgentStatusEvent['type'],
        agentId: payload?.agent_id || data.agent_id || '',
        status: payload?.status || 'online',
      };
      handler.onAgentStatus(event);
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    console.log(`[MulticaWS] Reconnecting in ${currentDelay}ms...`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
      currentDelay = Math.min(currentDelay * 2, maxReconnectDelay);
    }, currentDelay);
  }

  function stop() {
    stopped = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (ws) {
      ws.onclose = null; // prevent reconnect trigger
      ws.close();
      ws = null;
    }
  }

  connect();

  return stop;
}
