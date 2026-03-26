import { EventEmitter } from 'events';

export class MessageCapture extends EventEmitter {
  constructor() {
    super();
    this.messages = [];
    this.maxMessages = 200;
    this.wsConnection = null;
  }

  /**
   * Start capturing messages from OpenClaw Gateway
   */
  start() {
    console.log('[MessageCapture] Starting...');
    
    // TODO: Connect to OpenClaw Gateway WebSocket
    // Gateway WebSocket endpoint: ws://localhost:18789/ws/sessions
    // Or use HTTP polling to sessions_history
    
    // For now, just log
    console.log('[MessageCapture] Waiting for Gateway connection...');
  }

  /**
   * Handle incoming message
   * @param {object} msg 
   */
  handleMessage(msg) {
    const message = {
      id: `msg_${Date.now()}`,
      agentId: msg.agentId || 'unknown',
      role: msg.role || 'Observer',
      content: msg.content || '',
      contentType: msg.contentType || 'text',
      timestamp: Date.now(),
      status: 'confirmed'
    };

    // Add to queue
    this.messages.push(message);
    
    // Trim if over max
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }

    this.emit('message', message);
    return message;
  }

  /**
   * Get recent messages
   * @param {number} limit 
   */
  getRecentMessages(limit = 50) {
    return this.messages.slice(-limit);
  }

  /**
   * Connect to OpenClaw Gateway WebSocket
   * @param {string} gatewayUrl 
   */
  async connect(gatewayUrl) {
    // TODO: Implement WebSocket connection to OpenClaw Gateway
    // ws://localhost:18789/ws/sessions
  }

  /**
   * Stop capturing
   */
  stop() {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }
}
