import type {
  Agent,
  Task,
  TaskStats,
  Project,
  Message,
  SystemStats,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || `API Error: ${res.status}`);
  }
  return res.json();
}

// ===== Agents =====

export const api = {
  // Agents
  listAgents: () =>
    request<{ agents: Agent[]; total: number }>('/api/chat/agents'),

  getAgent: (id: string) =>
    request<Agent>(`/api/agents/${id}`),

  joinAgent: (data: Partial<Agent> & { agentId: string }) =>
    request<{ success: boolean; agent: Agent }>('/api/chat/join', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateAgentStatus: (agentId: string, status: string, extra?: Record<string, unknown>) =>
    request<{ success: boolean; agent: Agent }>('/api/chat/status', {
      method: 'POST',
      body: JSON.stringify({ agentId, status, ...extra }),
    }),

  // Tasks
  listTasks: (filter?: { agentId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filter?.agentId) params.set('agentId', filter.agentId);
    if (filter?.status) params.set('status', filter.status);
    const qs = params.toString();
    return request<{ tasks: Task[]; total: number; stats: TaskStats }>(
      `/api/tasks${qs ? `?${qs}` : ''}`
    );
  },

  getTask: (id: string) =>
    request<Task>(`/api/tasks/${id}`),

  createTask: (data: { title: string; description?: string; agentId?: string; priority?: number }) =>
    request<{ success: boolean; task: Task }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  claimTask: (agentId: string) =>
    request<{ success: boolean; task: Task | null }>('/api/tasks/claim', {
      method: 'POST',
      body: JSON.stringify({ agentId }),
    }),

  startTask: (id: string) =>
    request<{ success: boolean; task: Task }>(`/api/tasks/${id}/start`, { method: 'POST' }),

  completeTask: (id: string, result?: Record<string, unknown>) =>
    request<{ success: boolean; task: Task }>(`/api/tasks/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(result || {}),
    }),

  failTask: (id: string, error: string) =>
    request<{ success: boolean; task: Task }>(`/api/tasks/${id}/fail`, {
      method: 'POST',
      body: JSON.stringify({ error }),
    }),

  updateTaskProgress: (id: string, progress: { step: number; total: number; summary: string }) =>
    request<{ success: boolean; task: Task }>(`/api/tasks/${id}/progress`, {
      method: 'POST',
      body: JSON.stringify(progress),
    }),

  cancelTask: (id: string) =>
    request<{ success: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),

  getTaskStats: () =>
    request<TaskStats>('/api/tasks/stats'),

  // Projects
  listProjects: () =>
    request<{ projects: Project[]; total: number }>('/api/projects'),

  getProject: (id: string) =>
    request<Project>(`/api/projects/${id}`),

  createProject: (data: { name: string; path?: string; agentId?: string; type?: string; model?: string; port?: number }) =>
    request<{ success: boolean; project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateProject: (id: string, data: Partial<Project>) =>
    request<{ success: boolean; project: Project }>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteProject: (id: string) =>
    request<{ success: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  importProjects: (dirPath?: string) =>
    request<{ success: boolean; imported: number }>('/api/projects/import', {
      method: 'POST',
      body: JSON.stringify({ path: dirPath }),
    }),

  // Messages
  listMessages: (limit?: number) =>
    request<{ messages: Message[]; total: number }>(`/api/chat/messages?limit=${limit || 50}`),

  sendMessage: (agentId: string, content: string) =>
    request<{ success: boolean; message: Message }>('/api/chat/message', {
      method: 'POST',
      body: JSON.stringify({ agentId, content }),
    }),

  // System
  getHealth: () =>
    request<{ status: string; version: string }>('/api/health'),

  getSystemStats: () =>
    request<SystemStats>('/api/system/stats'),

  getPortScan: () =>
    request<import('./types').PortScanResult>('/api/system/ports'),

  getChatStats: () =>
    request<{ onlineAgents: number; totalMessages: number; byStatus: Record<string, number> }>('/api/stats'),

  // Meeting
  startMeeting: (topic: string, participants?: string[]) =>
    request<{ success: boolean }>('/api/meeting/start', {
      method: 'POST',
      body: JSON.stringify({ topic, participants }),
    }),

  endMeeting: () =>
    request<{ success: boolean }>('/api/meeting/end', { method: 'POST' }),

  getMeetingState: () =>
    request<Record<string, unknown>>('/api/meeting/state'),
};
