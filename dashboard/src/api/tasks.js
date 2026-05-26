import { request } from './client';

/**
 * Fetch all tasks with optional filters
 * @param {object} filters - { agentId, status, q }
 * @returns {Promise<{ tasks: object[], total: number, stats: object }>}
 */
export function fetchTasks(filters = {}) {
  const params = new URLSearchParams();
  if (filters.agentId) params.set('agentId', filters.agentId);
  if (filters.status) params.set('status', filters.status);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return request(`/tasks${qs ? `?${qs}` : ''}`);
}

/**
 * Fetch task statistics
 * @returns {Promise<object>}
 */
export function fetchTaskStats() {
  return request('/tasks/stats');
}

/**
 * Fetch a single task
 * @param {string} id
 * @returns {Promise<object>}
 */
export function fetchTask(id) {
  return request(`/tasks/${id}`);
}

/**
 * Create a new task
 * @param {object} data
 * @returns {Promise<{ success: boolean, task: object }>}
 */
export function createTask(data) {
  return request('/tasks', {
    method: 'POST',
    body: data,
  });
}

/**
 * Update a task
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
export function updateTask(id, data) {
  return request(`/tasks/${id}`, {
    method: 'PUT',
    body: data,
  });
}

/**
 * Start a task
 * @param {string} id
 * @returns {Promise<{ success: boolean, task: object }>}
 */
export function startTask(id) {
  return request(`/tasks/${id}/start`, { method: 'POST' });
}

/**
 * Complete a task
 * @param {string} id
 * @param {object} data
 * @returns {Promise<{ success: boolean, task: object }>}
 */
export function completeTask(id, data = {}) {
  return request(`/tasks/${id}/complete`, { method: 'POST', body: data });
}

/**
 * Fail a task
 * @param {string} id
 * @param {object} data
 * @returns {Promise<{ success: boolean, task: object }>}
 */
export function failTask(id, data = {}) {
  return request(`/tasks/${id}/fail`, { method: 'POST', body: data });
}

/**
 * Update task progress
 * @param {string} id
 * @param {object} progress
 * @returns {Promise<{ success: boolean, task: object }>}
 */
export function updateTaskProgress(id, progress) {
  return request(`/tasks/${id}/progress`, { method: 'POST', body: progress });
}

/**
 * Cancel (delete) a task
 * @param {string} id
 * @returns {Promise<{ success: boolean }>}
 */
export function cancelTask(id) {
  return request(`/tasks/${id}`, { method: 'DELETE' });
}

/**
 * Fetch task comments
 * @param {string} id
 * @returns {Promise<{ comments: object[] }>}
 */
export function fetchTaskComments(id) {
  return request(`/tasks/${id}/comments`);
}

/**
 * Add a task comment
 * @param {string} id
 * @param {object} data - { content, authorId, authorName }
 * @returns {Promise<{ success: boolean, comment: object }>}
 */
export function addTaskComment(id, data) {
  return request(`/tasks/${id}/comments`, { method: 'POST', body: data });
}
