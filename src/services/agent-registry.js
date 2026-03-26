import { EventEmitter } from 'events';

export class AgentRegistry extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.pollingInterval = null;
    this.heartbeatTimeout = 30000; // 30 seconds
  }

  /**
   * Update or create agent state
   * @param {string} agentId 
   * @param {object} state 
   */
  updateState(agentId, state) {
    const existing = this.agents.get(agentId);
    const newState = {
      ...existing,
      agentId,
      lastHeartbeat: Date.now(),
      ...state
    };
    this.agents.set(agentId, newState);
    this.emit('stateChange', newState);
    return newState;
  }

  /**
   * Get state for a specific agent
   */
  getState(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * Get all agent states
   */
  getAllStates() {
    return Array.from(this.agents.values());
  }

  /**
   * Start monitoring - placeholder for OpenClaw API integration
   */
  start() {
    console.log('[AgentRegistry] Starting...');
    
    // TODO: Integrate with OpenClaw sessions_list API
    // This would poll sessions_list or connect to Gateway WebSocket
    
    // For now, simulate some agents
    this.updateState('canmou', { name: 'canmou', role: '参谋', state: 'idle', location: 'workspace' });
    this.updateState('creator', { name: 'creator', role: '笔杆子', state: 'idle', location: 'workspace' });
    this.updateState('yunying', { name: 'yunying', role: '运营官', state: 'idle', location: 'workspace' });
    this.updateState('evolver', { name: 'evolver', role: '进化官', state: 'idle', location: 'workspace' });

    // Poll every 10 seconds
    this.pollingInterval = setInterval(() => this.poll(), 10000);
  }

  /**
   * Poll OpenClaw for agent states
   */
  async poll() {
    // TODO: Call OpenClaw sessions_list API
    // const sessions = await sessions_list();
    // Update states based on session data
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
