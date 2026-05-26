import { EventEmitter } from 'events';
import WebSocket from 'ws';
import http from 'http';

/**
 * GatewayConnector - OpenClaw Gateway WebSocket connection manager
 * 
 * Connects to OpenClaw Gateway's WebSocket endpoint to receive session events
 * and real-time messages from all agents.
 * 
 * WebSocket Endpoint: ws://<host>:<port>/ws/sessions
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Message parsing and validation
 * - Event filtering by agent/labels
 * - Heartbeat ping/pong to keep connection alive
 */

// Default Gateway configuration
const DEFAULT_GATEWAY_CONFIG = {
  host: process.env.OPENCLAW_GATEWAY_HOST || 'localhost',
  port: parseInt(process.env.OPENCLAW_GATEWAY_PORT || '18789', 10),
  path: '/ws/sessions',
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  pingInterval: 15000,
  connectionTimeout: 10000,
};

export class GatewayConnector extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_GATEWAY_CONFIG, ...config };
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = this.config.reconnectDelay;
    this.pingTimer = null;
    this.connectionTimer = null;
    this.shouldReconnect = true;
    
    // Message queue while disconnected
    this._messageQueue = [];
    
    // Statistics
    this.stats = {
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0,
      reconnectCount: 0,
      connectedAt: null,
    };
  }

  /**
   * Get the WebSocket URL
   */
  get url() {
    const { host, port, path } = this.config;
    return `ws://${host}:${port}${path}`;
  }

  /**
   * Connect to the Gateway WebSocket
   */
  async connect() {
    if (this.isConnected || this.isConnecting) {
      console.log('[GatewayConnector] Already connected or connecting');
      return;
    }

    this.isConnecting = true;
    console.log(`[GatewayConnector] Connecting to ${this.url}...`);

    return new Promise((resolve, reject) => {
      // Set connection timeout
      this.connectionTimer = setTimeout(() => {
        if (this.isConnecting) {
          this.ws?.terminate();
          this.isConnecting = false;
          reject(new Error('Connection timeout'));
        }
      }, this.config.connectionTimeout);

      try {
        this.ws = new WebSocket(this.url, {
          headers: {
            'Origin': 'agent-monitor',
          },
        });

        this.ws.on('open', () => {
          clearTimeout(this.connectionTimer);
          this.isConnecting = false;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.reconnectDelay = this.config.reconnectDelay;
          this.stats.connectedAt = Date.now();
          
          console.log(`[GatewayConnector] Connected to ${this.url}`);
          
          // Start ping interval
          this._startPingInterval();
          
          // Emit connected event
          this.emit('connected');
          
          // Flush queued messages
          this._flushMessageQueue();
          
          resolve();
        });

        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          clearTimeout(this.connectionTimer);
          this._cleanup();
          
          const reasonStr = reason?.toString() || 'No reason';
          console.log(`[GatewayConnector] Disconnected (code: ${code}, reason: ${reasonStr})`);
          
          this.emit('disconnected', { code, reason: reasonStr });
          
          // Auto-reconnect if should
          if (this.shouldReconnect && !this.isConnected) {
            this._scheduleReconnect();
          }
        });

        this.ws.on('error', (err) => {
          clearTimeout(this.connectionTimer);
          this.isConnecting = false;
          this.stats.errors++;
          
          console.error(`[GatewayConnector] WebSocket error:`, err.message);
          this.emit('error', err);
          
          reject(err);
        });

        this.ws.on('pong', () => {
          // Pong received, connection is alive
        });

      } catch (err) {
        clearTimeout(this.connectionTimer);
        this.isConnecting = false;
        reject(err);
      }
    });
  }

  /**
   * Handle incoming WebSocket message
   * @param {Buffer|string} data
   */
  _handleMessage(data) {
    this.stats.messagesReceived++;
    
    try {
      let msg;
      if (Buffer.isBuffer(data)) {
        msg = JSON.parse(data.toString('utf-8'));
      } else {
        msg = JSON.parse(data);
      }
      
      // Validate message structure
      if (!this._validateMessage(msg)) {
        console.warn('[GatewayConnector] Invalid message structure:', msg);
        return;
      }
      
      // Handle different message types
      switch (msg.type) {
        case 'session_event':
          this._handleSessionEvent(msg);
          break;
          
        case 'pong':
          // Pong from server, connection is alive
          break;
          
        case 'error':
          console.error('[GatewayConnector] Server error:', msg.message);
          this.emit('serverError', msg);
          break;
          
        default:
          // Emit raw message for flexibility
          this.emit('message', msg);
      }
      
      // Always emit raw message for debugging
      this.emit('rawMessage', msg);
      
    } catch (err) {
      // Not JSON, might be plain text or binary
      const text = Buffer.isBuffer(data) ? data.toString('utf-8') : data;
      if (text.length > 0) {
        this.emit('textMessage', text);
      }
    }
  }

  /**
   * Validate incoming message structure
   * @param {object} msg
   * @returns {boolean}
   */
  _validateMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    
    // session_event is the main message type we care about
    if (msg.type === 'session_event') {
      return !!(msg.sessionId || msg.agentId);
    }
    
    // Allow other types (pong, error, etc.) without validation
    return true;
  }

  /**
   * Handle session event message
   * @param {object} msg
   */
  _handleSessionEvent(msg) {
    // Extract session message
    const sessionMsg = {
      id: msg.id || `evt_${Date.now()}`,
      type: msg.eventType || 'message',
      sessionId: msg.sessionId,
      agentId: msg.agentId || 'unknown',
      role: msg.role || 'unknown',
      content: msg.content || '',
      contentType: msg.contentType || 'text',
      labels: msg.labels || [],
      timestamp: msg.timestamp || Date.now(),
      metadata: msg.metadata || {},
    };
    
    // Emit events
    this.emit('sessionEvent', sessionMsg);
    this.emit('message', sessionMsg);
  }

  /**
   * Send a message to the Gateway
   * @param {object} msg
   */
  send(msg) {
    if (!this.isConnected || !this.ws) {
      console.warn('[GatewayConnector] Not connected, message queued');
      this._messageQueue.push(msg);
      return false;
    }
    
    try {
      const data = JSON.stringify(msg);
      this.ws.send(data);
      this.stats.messagesSent++;
      return true;
    } catch (err) {
      console.error('[GatewayConnector] Send error:', err.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Subscribe to specific session events
   * @param {string[]} sessionIds
   */
  subscribeSessions(sessionIds) {
    return this.send({
      type: 'subscribe',
      sessions: sessionIds,
    });
  }

  /**
   * Unsubscribe from sessions
   * @param {string[]} sessionIds
   */
  unsubscribeSessions(sessionIds) {
    return this.send({
      type: 'unsubscribe',
      sessions: sessionIds,
    });
  }

  /**
   * Request agent state update
   */
  requestStateUpdate() {
    return this.send({
      type: 'state_request',
    });
  }

  /**
   * Start ping interval to keep connection alive
   */
  _startPingInterval() {
    this._stopPingInterval();
    
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.config.pingInterval);
  }

  /**
   * Stop ping interval
   */
  _stopPingInterval() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[GatewayConnector] Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );
    
    console.log(`[GatewayConnector] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(() => {
      if (this.shouldReconnect && !this.isConnected) {
        this.stats.reconnectCount++;
        this.connect().catch((err) => {
          console.error('[GatewayConnector] Reconnection failed:', err.message);
        });
      }
    }, delay);
  }

  /**
   * Flush queued messages after reconnection
   */
  _flushMessageQueue() {
    if (this._messageQueue.length === 0) return;
    
    console.log(`[GatewayConnector] Flushing ${this._messageQueue.length} queued messages`);
    
    while (this._messageQueue.length > 0) {
      const msg = this._messageQueue.shift();
      this.send(msg);
    }
  }

  /**
   * Cleanup on disconnect
   */
  _cleanup() {
    this.isConnected = false;
    this.isConnecting = false;
    this._stopPingInterval();
  }

  /**
   * Disconnect from the Gateway
   * @param {boolean} reconnect - Whether to allow auto-reconnect
   */
  disconnect(reconnect = false) {
    console.log('[GatewayConnector] Disconnecting...');
    this.shouldReconnect = reconnect;
    
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    
    this._cleanup();
    this.emit('disconnected', { manual: true });
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      ...this.stats,
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this._messageQueue.length,
      uptime: this.stats.connectedAt ? Date.now() - this.stats.connectedAt : 0,
    };
  }
}

// ==================== MessageCapture Service ====================

/**
 * MessageCapture - Captures and buffers messages from OpenClaw Gateway
 * 
 * Features:
 * - Connects to Gateway via WebSocket
 * - Filters messages by agent/labels
 * - Buffers last N messages in memory
 * - Emits events for new messages
 */
export class MessageCapture extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxMessages = options.maxMessages || 200;
    this.messages = [];
    this.gateway = new GatewayConnector(options.gateway);
    this.wsConnection = null;
    this.isRunning = false;
    
    // Set up gateway event forwarding
    this._setupGatewayEvents();
  }

  /**
   * Set up gateway event forwarding
   */
  _setupGatewayEvents() {
    this.gateway.on('sessionEvent', (msg) => {
      this._handleMessage(msg);
    });
    
    this.gateway.on('connected', () => {
      console.log('[MessageCapture] Gateway connected');
      this.emit('gatewayConnected');
    });
    
    this.gateway.on('disconnected', (info) => {
      console.log('[MessageCapture] Gateway disconnected');
      this.emit('gatewayDisconnected', info);
    });
    
    this.gateway.on('error', (err) => {
      console.error('[MessageCapture] Gateway error:', err.message);
      this.emit('gatewayError', err);
    });
    
    this.gateway.on('maxReconnectAttemptsReached', () => {
      console.error('[MessageCapture] Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
    });
  }

  /**
   * Start capturing messages
   * @param {object} gatewayConfig - Optional gateway config override
   */
  async start(gatewayConfig = null) {
    if (this.isRunning) {
      console.log('[MessageCapture] Already running');
      return;
    }
    
    console.log('[MessageCapture] Starting...');
    this.isRunning = true;
    
    if (gatewayConfig) {
      Object.assign(this.gateway.config, gatewayConfig);
    }
    
    try {
      await this.gateway.connect();
    } catch (err) {
      console.error('[MessageCapture] Failed to connect to Gateway:', err.message);
      console.log('[MessageCapture] Will retry in background...');
      // Don't throw, let it retry in background
    }
  }

  /**
   * Handle incoming message
   * @param {object} msg
   */
  _handleMessage(msg) {
    const message = {
      id: msg.id || `msg_${Date.now()}`,
      agentId: msg.agentId || 'unknown',
      role: msg.role || 'observer',
      content: msg.content || '',
      contentType: msg.contentType || 'text',
      sessionId: msg.sessionId,
      labels: msg.labels || [],
      timestamp: msg.timestamp || Date.now(),
      status: 'confirmed',
    };

    // Add to buffer
    this.messages.push(message);
    
    // Trim if over max
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }

    this.emit('message', message);
    return message;
  }

  /**
   * Check if a message should be captured based on filter
   * @param {object} msg
   * @param {object} filter
   * @returns {boolean}
   */
  shouldCapture(msg, filter = {}) {
    const { agentIds, labels, sessionIds } = filter;
    
    // Filter by agent IDs
    if (agentIds && agentIds.length > 0) {
      if (!agentIds.includes(msg.agentId)) return false;
    }
    
    // Filter by labels
    if (labels && labels.length > 0) {
      const hasLabel = msg.labels?.some((l) => labels.includes(l));
      if (!hasLabel) return false;
    }
    
    // Filter by session IDs
    if (sessionIds && sessionIds.length > 0) {
      if (!sessionIds.includes(msg.sessionId)) return false;
    }
    
    return true;
  }

  /**
   * Get recent messages
   * @param {number} limit
   * @param {object} filter
   * @returns {object[]}
   */
  getRecentMessages(limit = 50, filter = null) {
    let msgs = this.messages.slice(-limit);
    
    if (filter) {
      msgs = msgs.filter((m) => this.shouldCapture(m, filter));
    }
    
    return msgs;
  }

  /**
   * Get messages by agent
   * @param {string} agentId
   * @param {number} limit
   * @returns {object[]}
   */
  getMessagesByAgent(agentId, limit = 50) {
    return this.getRecentMessages(limit, { agentIds: [agentId] });
  }

  /**
   * Get messages by session
   * @param {string} sessionId
   * @param {number} limit
   * @returns {object[]}
   */
  getMessagesBySession(sessionId, limit = 50) {
    return this.getRecentMessages(limit, { sessionIds: [sessionId] });
  }

  /**
   * Connect to OpenClaw Gateway WebSocket
   * @param {string} gatewayUrl - Full WebSocket URL
   */
  async connect(gatewayUrl) {
    if (gatewayUrl) {
      try {
        const url = new URL(gatewayUrl);
        this.gateway.config.host = url.hostname;
        this.gateway.config.port = parseInt(url.port, 10) || (url.protocol === 'wss:' ? 443 : 80);
        this.gateway.config.path = url.pathname;
      } catch (err) {
        console.error('[MessageCapture] Invalid gateway URL:', err.message);
      }
    }
    
    await this.gateway.connect();
    this.wsConnection = this.gateway.ws;
  }

  /**
   * Disconnect from Gateway
   */
  disconnect() {
    this.gateway.disconnect();
    this.wsConnection = null;
    this.isRunning = false;
  }

  /**
   * Stop capturing
   */
  stop() {
    console.log('[MessageCapture] Stopping...');
    this.disconnect();
    this.emit('stopped');
  }

  /**
   * Get capture statistics
   */
  getStats() {
    return {
      messageCount: this.messages.length,
      gateway: this.gateway.getStats(),
    };
  }
}

export default { GatewayConnector, MessageCapture };
