import Redis from 'ioredis';

/**
 * Redis Service - Singleton Redis connection manager
 * Handles connection, reconnection, and provides Redis client for pub/sub and state storage
 */
class RedisService {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
  }

  /**
   * Initialize Redis connection
   * @param {object} config - Redis configuration
   * @param {string} config.host - Redis host (default: localhost)
   * @param {number} config.port - Redis port (default: 6379)
   * @param {string} [config.password] - Redis password (optional)
   * @param {number} [config.db] - Redis db number (default: 0)
   */
  async connect(config = {}) {
    const { host = 'localhost', port = 6379, password, db = 0 } = config;

    const options = {
      host,
      port,
      db,
      retryStrategy: (times) => {
        const delay = Math.min(times * this.reconnectDelay, 30000);
        console.log(`[Redis] Reconnecting in ${delay}ms... (attempt ${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };

    if (password) {
      options.password = password;
    }

    // Main client for general operations
    this.client = new Redis(options);

    // Subscriber client for pub/sub (must be separate connection)
    this.subscriber = new Redis(options);

    // Set up event handlers
    this._setupEventHandlers();

    // Connect
    try {
      await this.client.connect();
      await this.subscriber.connect();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('[Redis] Connected successfully');
    } catch (err) {
      console.error('[Redis] Connection failed:', err.message);
      throw err;
    }
  }

  _setupEventHandlers() {
    const handleConnect = (clientName) => (err) => {
      if (err) {
        console.error(`[Redis] ${clientName} error:`, err.message);
      } else {
        console.log(`[Redis] ${clientName} connected`);
      }
    };

    const handleClose = (clientName) => () => {
      console.log(`[Redis] ${clientName} connection closed`);
      this.isConnected = false;
    };

    const handleReconnecting = (clientName) => () => {
      this.reconnectAttempts++;
      if (this.reconnectAttempts > this.maxReconnectAttempts) {
        console.error(`[Redis] ${clientName} max reconnection attempts reached`);
        this.client?.disconnect();
        this.subscriber?.disconnect();
      }
    };

    // Main client handlers
    this.client?.on('connect', handleConnect('Main client'));
    this.client?.on('ready', () => {
      this.isConnected = true;
      console.log('[Redis] Main client ready');
    });
    this.client?.on('close', handleClose('Main client'));
    this.client?.on('reconnecting', handleReconnecting('Main client'));
    this.client?.on('error', (err) => console.error('[Redis] Client error:', err.message));

    // Subscriber handlers
    this.subscriber?.on('connect', handleConnect('Subscriber'));
    this.subscriber?.on('ready', () => console.log('[Redis] Subscriber ready'));
    this.subscriber?.on('close', handleClose('Subscriber'));
    this.subscriber?.on('reconnecting', handleReconnecting('Subscriber'));
    this.subscriber?.on('error', (err) => console.error('[Redis] Subscriber error:', err.message));
  }

  /**
   * Get the main Redis client
   * @returns {Redis}
   */
  getClient() {
    return this.client;
  }

  /**
   * Get the subscriber client
   * @returns {Redis}
   */
  getSubscriber() {
    return this.subscriber;
  }

  /**
   * Check if Redis is connected
   * @returns {boolean}
   */
  isReady() {
    return this.isConnected && this.client?.status === 'ready';
  }

  // ==================== Agent State Operations ====================

  /**
   * Key prefix for agent state
   */
  _stateKey(agentId) {
    return `agent:state:${agentId}`;
  }

  /**
   * Set agent state with TTL
   * @param {string} agentId
   * @param {object} state
   * @param {number} ttl - TTL in seconds (default: 30)
   */
  async setAgentState(agentId, state, ttl = 30) {
    if (!this.isReady()) {
      console.warn('[Redis] Not connected, state not saved');
      return;
    }
    const key = this._stateKey(agentId);
    const data = JSON.stringify({
      ...state,
      lastHeartbeat: Date.now(),
    });
    await this.client.setex(key, ttl, data);
  }

  /**
   * Get agent state
   * @param {string} agentId
   * @returns {object|null}
   */
  async getAgentState(agentId) {
    if (!this.isReady()) return null;
    const key = this._stateKey(agentId);
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get all agent states (using SCAN for production)
   * @returns {object[]}
   */
  async getAllAgentStates() {
    if (!this.isReady()) return [];
    const keys = await this.client.keys('agent:state:*');
    if (keys.length === 0) return [];

    const pipeline = this.client.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();

    return results
      .map(([err, data]) => {
        if (err || !data) return null;
        return JSON.parse(data);
      })
      .filter(Boolean);
  }

  /**
   * Delete agent state
   * @param {string} agentId
   */
  async deleteAgentState(agentId) {
    if (!this.isReady()) return;
    const key = this._stateKey(agentId);
    await this.client.del(key);
  }

  /**
   * Refresh agent TTL (heartbeat refresh)
   * @param {string} agentId
   * @param {number} ttl - TTL in seconds (default: 30)
   */
  async refreshAgentTTL(agentId, ttl = 30) {
    if (!this.isReady()) return;
    const key = this._stateKey(agentId);
    await this.client.expire(key, ttl);
  }

  // ==================== Pub/Sub Operations ====================

  /**
   * Publish to a channel
   * @param {string} channel
   * @param {object} message
   */
  async publish(channel, message) {
    if (!this.isReady()) {
      console.warn('[Redis] Not connected, message not published');
      return;
    }
    const data = JSON.stringify(message);
    await this.client.publish(channel, data);
  }

  /**
   * Subscribe to a channel
   * @param {string} channel
   * @param {function} callback
   */
  async subscribe(channel, callback) {
    if (!this.isReady()) {
      console.warn('[Redis] Not connected, subscription not active');
      return;
    }
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (err) {
          console.error('[Redis] Failed to parse message:', err.message);
        }
      }
    });
  }

  /**
   * Subscribe to multiple channels
   * @param {string[]} channels
   * @param {function} callback
   */
  async subscribeMany(channels, callback) {
    if (!this.isReady()) return;
    await this.subscriber.subscribe(...channels);
    this.subscriber.on('message', (ch, message) => {
      try {
        const data = JSON.parse(message);
        callback(ch, data);
      } catch (err) {
        console.error('[Redis] Failed to parse message:', err.message);
      }
    });
  }

  // ==================== State Change Events Channel ====================

  /**
   * Publish state change event
   * @param {object} event
   */
  async publishStateChange(event) {
    await this.publish('agent:events:state', event);
  }

  /**
   * Subscribe to state change events
   * @param {function} callback
   */
  onStateChange(callback) {
    return this.subscribe('agent:events:state', callback);
  }

  // ==================== Session Messages Channel ====================

  /**
   * Publish session message
   * @param {object} message
   */
  async publishSessionMessage(message) {
    await this.publish('agent:events:message', message);
  }

  /**
   * Subscribe to session messages
   * @param {function} callback
   */
  onSessionMessage(callback) {
    return this.subscribe('agent:events:message', callback);
  }

  // ==================== Disconnect ====================

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    console.log('[Redis] Disconnecting...');
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    this.isConnected = false;
    console.log('[Redis] Disconnected');
  }
}

// Singleton export
const redisService = new RedisService();
export default redisService;
export { RedisService };
