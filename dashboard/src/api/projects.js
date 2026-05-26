import { request } from './client';

/**
 * Fetch all projects
 * @returns {Promise<{ projects: object[], total: number, stats: object }>}
 */
export function fetchProjects() {
  return request('/projects');
}

/**
 * Fetch a single project by ID
 * @param {string} id
 * @returns {Promise<object>}
 */
export function fetchProject(id) {
  return request(`/projects/${id}`);
}

/**
 * Create a new project
 * @param {object} data - { name, path, agentId, type, model, port }
 * @returns {Promise<{ success: boolean, project: object }>}
 */
export function createProject(data) {
  return request('/projects', {
    method: 'POST',
    body: data,
  });
}

/**
 * Update a project
 * @param {string} id
 * @param {object} data
 * @returns {Promise<{ success: boolean, project: object }>}
 */
export function updateProject(id, data) {
  return request(`/projects/${id}`, {
    method: 'PUT',
    body: data,
  });
}

/**
 * Delete a project
 * @param {string} id
 * @returns {Promise<{ success: boolean }>}
 */
export function deleteProject(id) {
  return request(`/projects/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Get project statistics
 * @param {string} id
 * @returns {Promise<object>}
 */
export function fetchProjectStats(id) {
  return request(`/projects/${id}/stats`);
}

/**
 * Import projects from a directory
 * @param {string} dirPath
 * @returns {Promise<object>}
 */
export function importProjects(dirPath) {
  return request('/projects/import', {
    method: 'POST',
    body: { path: dirPath },
  });
}
