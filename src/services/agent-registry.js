import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import redis from './redis.js';

/**
 * Agent Registry - Manages agent states with heartbeat detection
 * 
 * Features:
 * - Dynamic agent discovery from OpenClaw Gateway API
 * - Config file fallback support (agents.json)
 * - In-memory state cache for fast access
 * - Redis persistence for cross-process sharing
 * - 30-second heartbeat timeout detection
 * 
 * Status types: idle | working | meeting | away
 */

// Valid status types
const VALID_STATUSES = ['idle', 'working', 'meeting', 'away'];

// Default heartbeat timeout (30 seconds)
const DEFAULT_HEARTBEAT_TIMEOUT = 30000;

// Heartbeat check interval (10 seconds)
const HEARTBEAT_CHECK_INTERVAL = 10000;

// Redis state TTL (30 seconds, synced with heartbeat timeout)
const STATE_TTL = 30;

// Default agent roles (used as fallback)
const DEFAULT_AGENT_ROLES = {
  canmou: '参谋',
  creator: '笔杆子',
  yunying: '运营官',
  evolver: '进化官',
};

export class AgentRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    this.heartbeatTimeout = options.heartbeatTimeout || DEFAULT_HEARTBEAT_TIMEOUT;
    this.checkInterval = options.checkInterval || HEARTBEAT_CHECK_INTERVAL;

    // In-memory state cache: Map<agentId, AgentState>
    this.agents = new Map();

    // Heartbeat check timer
    this._checkTimer = null;

    // Redis-enabled flag
    this._redisEnabled = false;

    // Track which agents were previously away (for state change events)
    this._wasAway = new Set();

    // Demo mode: keep discovered agents alive without real heartbeats
    this._demoMode = options.demoMode !== false; // default true
    this._discoveredAgentIds = new Set();
    this._heartbeatSimTimer = null;
  }

  /**
   * Initialize and start the registry
   * @param {object} options - Start options
   * @param {object} options.redisConfig - Optional Redis config
   * @param {string} options.gatewayUrl - OpenClaw Gateway URL for agent discovery
   * @param {string} options.configPath - Path to agents.json config file
   */
  async start(options = {}) {
    const { redisConfig = null, gatewayUrl = 'http://localhost:18789', configPath = null } = options;
    
    console.log('[AgentRegistry] Starting...');
    
    // Try to connect to Redis if config provided
    if (redisConfig) {
      try {
        await redis.connect(redisConfig);
        this._redisEnabled = true;
        console.log('[AgentRegistry] Redis enabled for state persistence');
        
        // Load existing states from Redis
        await this._loadFromRedis();
      } catch (err) {
        console.warn('[AgentRegistry] Redis connection failed, using in-memory only:', err.message);
        this._redisEnabled = false;
      }
    }
    
    // Dynamic agent discovery: Gateway API -> Config file -> Default agents
    const discoveredAgents = await this._discoverAgents(gatewayUrl, configPath);
    
    // Initialize discovered agents
    for (const agent of discoveredAgents) {
      if (!this.agents.has(agent.agentId)) {
        this._discoveredAgentIds.add(agent.agentId);
        this.updateState(agent.agentId, {
          ...agent,
          status: 'idle',
          currentTask: null,
          sessionId: null,
          startTime: Date.now(),
          lastHeartbeat: Date.now(),
        });
      }
    }

    // Start heartbeat check loop
    this._startHeartbeatCheck();

    // Start demo heartbeat simulation for discovered agents
    if (this._demoMode && this._discoveredAgentIds.size > 0) {
      this._startDemoHeartbeat();
    }
    
    console.log(`[AgentRegistry] Started with ${this.agents.size} agents`);
  }

  /**
   * Discover agents from multiple sources
   * Priority: Gateway API > Config file > Default agents
   */
  async _discoverAgents(gatewayUrl, configPath) {
    // 1. Try Gateway API
    const gatewayAgents = await this._discoverFromGateway(gatewayUrl);
    if (gatewayAgents.length > 0) {
      console.log(`[AgentRegistry] Discovered ${gatewayAgents.length} agents from Gateway API`);
      return gatewayAgents;
    }
    
    // 2. Try config file
    if (configPath) {
      const configAgents = this._discoverFromConfig(configPath);
      if (configAgents.length > 0) {
        console.log(`[AgentRegistry] Loaded ${configAgents.length} agents from config file`);
        return configAgents;
      }
    }
    
    // 3. Fallback to default agents
    console.log('[AgentRegistry] Using default agents (no Gateway/config found)');
    return this._getDefaultAgents();
  }

  /**
   * Discover agents from OpenClaw Gateway API
   */
  async _discoverFromGateway(gatewayUrl) {
    try {
      // Try to call Gateway sessions_list API
      const response = await fetch(`${gatewayUrl}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'sessions_list',
          params: { kinds: ['subagent'], limit: 50 }
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        const sessions = data.result || data.sessions || [];
        
        // Extract unique agents from sessions
        const agentMap = new Map();
        for (const session of sessions) {
          // Extract agent ID from session key (format: agent:main:subagent:UUID)
          const key = session.key || session.sessionKey || '';
          const parts = key.split(':');
          const agentId = parts[2] || parts[0];
          
          if (agentId && !agentMap.has(agentId)) {
            agentMap.set(agentId, {
              agentId,
              name: agentId,
              role: DEFAULT_AGENT_ROLES[agentId] || session.role || 'Agent',
              location: 'workspace',
            });
          }
        }
        
        return Array.from(agentMap.values());
      }
    } catch (err) {
      console.warn(`[AgentRegistry] Gateway discovery failed: ${err.message}`);
    }
    return [];
  }

  /**
   * Discover agents from config file
   */
  _discoverFromConfig(configPath) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      
      if (config.agents && Array.isArray(config.agents)) {
        return config.agents.map(a => ({
          agentId: a.id || a.agentId || a.name,
          name: a.name,
          role: a.role || 'Agent',
          location: 'workspace',
        }));
      }
      
      if (config.agents && typeof config.agents === 'object') {
        return Object.entries(config.agents).map(([id, a]) => ({
          agentId: id,
          name: a.name || id,
          role: a.role || 'Agent',
          location: 'workspace',
        }));
      }
    } catch (err) {
      console.warn(`[AgentRegistry] Config file read failed: ${err.message}`);
    }
    return [];
  }

  /**
   * Get default agents
   */
  _getDefaultAgents() {
    return Object.entries(DEFAULT_AGENT_ROLES).map(([id, role]) => ({
      agentId: id,
      name: id,
      role,
      location: 'workspace',
    }));
  }

  // Note: _initializeDefaultAgents removed, replaced by _discoverAgents

  /**
   * Load existing agent states from Redis
   */
  async _loadFromRedis() {
    if (!this._redisEnabled) return;
    
    try {
      const states = await redis.getAllAgentStates();
      for (const state of states) {
        if (state && state.agentId) {
          this.agents.set(state.agentId, state);
        }
      }
      console.log(`[AgentRegistry] Loaded ${states.length} states from Redis`);
    } catch (err) {
      console.error('[AgentRegistry] Failed to load from Redis:', err.message);
    }
  }

  /**
   * Update or create agent state
   * @param {string} agentId
   * @param {object} state - Partial state to merge
   * @returns {object} The new state
   */
  async updateState(agentId, state = {}) {
    const existing = this.agents.get(agentId);
    const prevState = existing ? { ...existing } : null;
    
    // Validate status
    if (state.status && !VALID_STATUSES.includes(state.status)) {
      console.warn(`[AgentRegistry] Invalid status "${state.status}" for ${agentId}, ignoring`);
      delete state.status;
    }
    
    // Build new state
    const now = Date.now();
    const newState = {
      agentId,
      name: state.name || existing?.name || agentId,
      role: state.role || existing?.role || 'unknown',
      location: state.location || existing?.location || 'workspace',
      status: state.status || existing?.status || 'idle',
      currentTask: state.currentTask !== undefined ? state.currentTask : existing?.currentTask,
      sessionId: state.sessionId !== undefined ? state.sessionId : existing?.sessionId,
      startTime: state.startTime || existing?.startTime || now,
      lastHeartbeat: now,
      metadata: state.metadata || existing?.metadata || {},
      ...state,
    };
    
    // Check if status changed
    const statusChanged = !prevState || prevState.status !== newState.status;
    
    // Update memory cache
    this.agents.set(agentId, newState);
    
    // Persist to Redis
    if (this._redisEnabled) {
      try {
        await redis.setAgentState(agentId, newState, STATE_TTL);
      } catch (err) {
        console.error('[AgentRegistry] Redis set failed:', err.message);
      }
    }
    
    // Emit state change event
    if (statusChanged) {
      const event = {
        type: 'state_changed',
        agentId,
        prevState: prevState || null,
        nextState: newState,
        timestamp: now,
      };
      this.emit('stateChange', newState, prevState);
      this.emit('stateChangeEvent', event);
      
      // Publish to Redis pub/sub if enabled
      if (this._redisEnabled) {
        await redis.publishStateChange(event).catch(() => {});
      }
    }
    
    return newState;
  }

  /**
   * Get state for a specific agent
   * @param {string} agentId
   * @returns {object|null}
   */
  getState(agentId) {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get all agent states
   * @returns {object[]}
   */
  getAllStates() {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents filtered by status
   * @param {string} status
   * @returns {object[]}
   */
  getAgentsByStatus(status) {
    return this.getAllStates().filter((a) => a.status === status);
  }

  /**
   * Get agents filtered by location
   * @param {string} location
   * @returns {object[]}
   */
  getAgentsByLocation(location) {
    return this.getAllStates().filter((a) => a.location === location);
  }

  /**
   * Start heartbeat check loop
   */
  _startHeartbeatCheck() {
    this._stopHeartbeatCheck();
    
    this._checkTimer = setInterval(() => {
      this._checkHeartbeats();
    }, this.checkInterval);
    
    console.log(`[AgentRegistry] Heartbeat check started (interval: ${this.checkInterval}ms, timeout: ${this.heartbeatTimeout}ms)`);
  }

  /**
   * Stop heartbeat check loop
   */
  _stopHeartbeatCheck() {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
      this._checkTimer = null;
    }
  }

  /**
   * Check heartbeats and mark agents as away if timed out
   */
  _checkHeartbeats() {
    const now = Date.now();
    const timeout = this.heartbeatTimeout;

    for (const [agentId, state] of this.agents) {
      // Skip demo agents — they stay alive via simulation
      if (this._demoMode && this._discoveredAgentIds.has(agentId)) continue;

      const elapsed = now - state.lastHeartbeat;
      
      // Skip if already away
      if (state.status === 'away') continue;
      
      // Check if heartbeat timed out
      if (elapsed > timeout) {
        const prevState = { ...state };
        
        console.log(`[AgentRegistry] Agent ${agentId} heartbeat timeout (${elapsed}ms), marking as away`);
        
        // Update state to away
        this.agents.set(agentId, {
          ...state,
          status: 'away',
          lastHeartbeat: state.lastHeartbeat, // Keep original heartbeat time
        });
        
        // Persist to Redis
        if (this._redisEnabled) {
          redis.setAgentState(agentId, { ...state, status: 'away' }, STATE_TTL).catch(() => {});
        }
        
        // Emit away event
        const event = {
          type: 'agent_timeout',
          agentId,
          prevState,
          nextState: { ...state, status: 'away' },
          elapsed,
          timestamp: now,
        };
        this.emit('stateChange', { ...state, status: 'away' }, prevState);
        this.emit('stateChangeEvent', event);
        this.emit('agentTimeout', agentId, elapsed);
        
        // Publish to Redis
        if (this._redisEnabled) {
          redis.publishStateChange(event).catch(() => {});
        }
      }
    }
  }

  /**
   * Refresh agent heartbeat (call periodically to keep agent alive)
   * @param {string} agentId
   * @returns {object} Updated state
   */
  async refreshHeartbeat(agentId) {
    const state = this.agents.get(agentId);
    if (!state) {
      console.warn(`[AgentRegistry] Heartbeat refresh for unknown agent: ${agentId}`);
      return null;
    }
    
    // If agent was away, restore to idle
    const prevStatus = state.status;
    const newStatus = state.status === 'away' ? 'idle' : state.status;
    
    return this.updateState(agentId, {
      status: newStatus,
      lastHeartbeat: Date.now(),
    });
  }

  /**
   * Set agent status explicitly
   * @param {string} agentId
   * @param {string} status
   * @param {object} [extra]
   */
  async setStatus(agentId, status, extra = {}) {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    return this.updateState(agentId, { status, ...extra });
  }

  /**
   * Remove an agent from registry
   * @param {string} agentId
   */
  async removeAgent(agentId) {
    const state = this.agents.get(agentId);
    if (state) {
      this.agents.delete(agentId);
      
      if (this._redisEnabled) {
        await redis.deleteAgentState(agentId).catch(() => {});
      }
      
      this.emit('agentRemoved', agentId, state);
    }
  }

  /**
   * Start demo heartbeat simulation
   * Periodically refreshes lastHeartbeat for discovered agents
   */
  _startDemoHeartbeat() {
    const interval = Math.min(this.heartbeatTimeout / 2, 15000); // refresh at half timeout or 15s
    this._heartbeatSimTimer = setInterval(() => {
      const now = Date.now();
      for (const agentId of this._discoveredAgentIds) {
        const state = this.agents.get(agentId);
        if (state && state.status !== 'away') {
          state.lastHeartbeat = now;
        }
      }
    }, interval);
    console.log(`[AgentRegistry] Demo heartbeat simulation started for ${this._discoveredAgentIds.size} agents`);
  }

  /**
   * Stop demo heartbeat simulation
   */
  _stopDemoHeartbeat() {
    if (this._heartbeatSimTimer) {
      clearInterval(this._heartbeatSimTimer);
      this._heartbeatSimTimer = null;
    }
  }

  /**
   * Stop the registry
   */
  stop() {
    console.log('[AgentRegistry] Stopping...');
    this._stopHeartbeatCheck();
    this._stopDemoHeartbeat();

    if (this._redisEnabled) {
      redis.disconnect().catch(() => {});
    }

    this.emit('stopped');
    console.log('[AgentRegistry] Stopped');
  }
}

// Export singleton for convenience
const agentRegistry = new AgentRegistry();
export default agentRegistry;
export { VALID_STATUSES, DEFAULT_HEARTBEAT_TIMEOUT };
