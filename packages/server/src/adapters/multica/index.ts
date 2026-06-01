import type {
  AgentPlatformAdapter, TaskDTO, TaskMessageDTO, TaskUsageDTO,
  AgentDTO, ProjectDTO, CreateTaskInput, PlatformEventHandler,
  AdapterCapabilities,
} from '../interface.js';
import { MulticaClient } from './client.js';
import { connectMulticaWS, type MulticaWsOptions } from './ws.js';

export interface MulticaAdapterOptions {
  apiUrl: string;
  wsUrl: string;
  token: string;
}

export function createMulticaAdapter(options: MulticaAdapterOptions): AgentPlatformAdapter {
  const client = new MulticaClient(options.apiUrl, options.token);
  let unsubscribe: (() => void) | null = null;

  const capabilities: AdapterCapabilities = {
    realtime: true,
    taskCreate: true,
    costTracking: true,
    agentControl: false,  // Multica doesn't expose pause/stop via public API
    sessionPeek: true,
  };

  // --- Normalizers: Multica API response → DTO ---

  function normalizeIssue(raw: any, agentTask?: any): TaskDTO {
    const task = agentTask || {};
    return {
      id: raw.id || raw.issue_id,
      title: raw.title || '',
      description: raw.description || '',
      status: mapMulticaStatus(raw.status || task.status),
      projectId: raw.project_id || raw.workspace_id || '',
      agentId: task.agent_id || raw.assignee_id || '',
      assigneeId: raw.assignee_id,
      priority: raw.priority,
      labels: raw.labels,
      createdAt: raw.created_at || raw.createdAt,
      updatedAt: raw.updated_at || raw.updatedAt,
    };
  }

  function mapMulticaStatus(status: string): TaskDTO['status'] {
    switch (status) {
      case 'queued': case 'pending': return 'queued';
      case 'dispatched': return 'dispatched';
      case 'running': case 'in_progress': return 'running';
      case 'completed': case 'done': return 'completed';
      case 'failed': case 'error': return 'failed';
      case 'cancelled': return 'cancelled';
      default: return 'queued';
    }
  }

  function normalizeAgent(raw: any): AgentDTO {
    return {
      id: raw.id || raw.agent_id,
      name: raw.name || raw.agent_name || raw.id,
      platform: raw.platform || raw.agent_type || 'unknown',
      role: raw.role || 'developer',
      status: raw.status === 'online' ? 'online' : raw.status === 'busy' ? 'busy' : 'offline',
      currentTaskId: raw.current_task_id || null,
      currentProjectId: raw.current_project_id || raw.workspace_id || null,
    };
  }

  function normalizeProject(raw: any): ProjectDTO {
    return {
      id: raw.id || raw.workspace_id,
      name: raw.name || '',
      path: raw.path || raw.local_path,
      status: raw.status || 'active',
      goals: raw.goals,
      createdAt: raw.created_at || raw.createdAt,
    };
  }

  return {
    name: 'multica',
    capabilities,

    // --- Tasks ---

    async getTasks(projectId?: string) {
      const resp = await client.getIssues({ project_id: projectId, limit: 100 });
      const items = resp.issues || resp.data || resp || [];
      return (Array.isArray(items) ? items : []).map((i: any) => normalizeIssue(i));
    },

    async getTask(taskId: string) {
      try {
        const issue = await client.getIssue(taskId);
        let activeTask = null;
        try {
          const at = await client.getIssueActiveTask(taskId);
          activeTask = at?.task || at;
        } catch { /* no active task */ }
        return normalizeIssue(issue, activeTask);
      } catch {
        return null;
      }
    },

    async getTaskMessages(taskId: string) {
      try {
        const resp = await client.getTaskMessages(taskId);
        return (resp.messages || []).map((m: any) => ({
          seq: m.seq || 0,
          type: m.type || 'text',
          tool: m.tool || undefined,
          content: m.content || undefined,
          input: m.input || undefined,
          output: m.output || undefined,
        }));
      } catch {
        return [];
      }
    },

    async getTaskUsage(taskId: string): Promise<TaskUsageDTO | null> {
      // Multica doesn't have a direct task usage endpoint yet.
      // We'll get this from trace data once available.
      try {
        // Try the /api/daemon/tasks/{taskId}/usage endpoint
        const url = `${options.apiUrl}/api/daemon/tasks/${encodeURIComponent(taskId)}/usage`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${options.token}` },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as Record<string, any>;
        return {
          inputTokens: data.input_tokens || 0,
          outputTokens: data.output_tokens || 0,
          costCents: data.cost_cents || Math.round(((data.input_tokens || 0) + (data.output_tokens || 0)) * 0.003),
          model: data.model || undefined,
        };
      } catch {
        return null;
      }
    },

    async createTask(input: CreateTaskInput) {
      const resp = await client.createIssue({
        title: input.title,
        description: input.description,
        project_id: input.projectId,
        assignee_id: input.assigneeId,
        priority: input.priority,
        labels: input.labels,
      });
      return normalizeIssue(resp.issue || resp);
    },

    // --- Agents ---

    async getAgents() {
      const resp = await client.getAgents();
      return (resp.agents || resp || []).map(normalizeAgent);
    },

    async getAgent(agentId: string) {
      try {
        const resp = await client.getAgent(agentId);
        return normalizeAgent(resp.agent || resp);
      } catch {
        return null;
      }
    },

    // --- Projects ---

    async getProjects() {
      const resp = await client.getProjects();
      const items = (resp as any).projects || (resp as any).workspaces || resp || [];
      return (Array.isArray(items) ? items : []).map(normalizeProject);
    },

    // --- Events ---

    subscribe(handler: PlatformEventHandler) {
      if (unsubscribe) {
        // Only one subscription at a time
        console.warn('[MulticaAdapter] Already subscribed, replacing handler');
        unsubscribe();
      }

      const wsOptions: MulticaWsOptions = {
        url: options.wsUrl,
        token: options.token,
        authMode: 'query',
      };

      unsubscribe = connectMulticaWS(handler, wsOptions);
      return unsubscribe;
    },

    async ping() {
      return client.ping();
    },
  };
}
