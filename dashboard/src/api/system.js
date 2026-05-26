import { request } from './client';

/**
 * Health check
 * @returns {Promise<object>}
 */
export function fetchHealth() {
  return request('/health');
}

/**
 * System statistics
 * @returns {Promise<object>}
 */
export function fetchStats() {
  return request('/stats');
}

/**
 * System resource stats (CPU, memory, disk)
 * @returns {Promise<object>}
 */
export function fetchSystemStats() {
  return request('/system/stats');
}

/**
 * Port scanning
 * @returns {Promise<object>}
 */
export function fetchPorts() {
  return request('/system/ports');
}

/**
 * Fetch events
 * @param {number} limit
 * @returns {Promise<{ events: object[] }>}
 */
export function fetchEvents(limit = 50) {
  return request(`/events?limit=${limit}`);
}
