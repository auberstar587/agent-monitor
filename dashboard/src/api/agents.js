import { request } from './client';

/**
 * Fetch online agents
 * @returns {Promise<{ agents: object[], total: number }>}
 */
export function fetchAgents() {
  return request('/chat/agents');
}

/**
 * Agent joins the chat room
 * @param {object} data - { agentId, agentName, role, model, platform, ... }
 * @returns {Promise<{ success: boolean, agent: object }>}
 */
export function joinAgent(data) {
  return request('/chat/join', { method: 'POST', body: data });
}

/**
 * Register an agent (semantic alias for join)
 * @param {object} data
 * @returns {Promise<{ success: boolean, agent: object }>}
 */
export function registerAgent(data) {
  return request('/agents/register', { method: 'POST', body: data });
}

/**
 * Agent leaves the chat room
 * @param {string} agentId
 * @returns {Promise<{ success: boolean }>}
 */
export function leaveAgent(agentId) {
  return request('/chat/leave', { method: 'POST', body: { agentId } });
}

/**
 * Update agent status
 * @param {object} data - { agentId, status, ... }
 * @returns {Promise<{ success: boolean, agent: object }>}
 */
export function updateAgentStatus(data) {
  return request('/chat/status', { method: 'POST', body: data });
}

/**
 * Fetch chat messages
 * @param {number} limit
 * @returns {Promise<{ messages: object[], total: number }>}
 */
export function fetchMessages(limit = 50) {
  return request(`/chat/messages?limit=${limit}`);
}

/**
 * Send a chat message
 * @param {object} data - { agentId, content, type, ... }
 * @returns {Promise<{ success: boolean, message: object }>}
 */
export function sendMessage(data) {
  return request('/chat/message', { method: 'POST', body: data });
}
