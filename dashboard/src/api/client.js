import { io } from 'socket.io-client';

const BASE_URL = '/api';

/**
 * Generic fetch wrapper with error handling
 * @param {string} path - API path (e.g. '/projects')
 * @param {object} options - fetch options
 * @returns {Promise<any>}
 */
export async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Initialize Socket.io connection
 * @returns {Socket}
 */
export function initSocket() {
  const socket = io({
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[Socket.io] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket.io] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket.io] Connection error:', err.message);
  });

  return socket;
}
