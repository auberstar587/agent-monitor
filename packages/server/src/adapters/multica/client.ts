/**
 * Multica HTTP API 客户端
 *
 * 封装 Multica REST API 调用，处理认证、错误、分页。
 * API Base: http://localhost:8080
 */
export class MulticaClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
      ...(options.headers as Record<string, string> || {}),
    };

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Multica API ${res.status} ${path}: ${body.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  // --- Issues ---

  async getIssues(params?: { project_id?: string; status?: string; assignee_id?: string; limit?: number }) {
    const qs = params ? '?' + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)] as [string, string])
    ).toString() : '';
    return this.request<any>(`/api/issues${qs}`);
  }

  async getIssue(id: string) {
    return this.request<any>(`/api/issues/${id}`);
  }

  async createIssue(data: {
    title: string; description?: string; project_id?: string;
    assignee_id?: string; priority?: string; labels?: string[];
  }) {
    return this.request<any>('/api/issues', { method: 'POST', body: JSON.stringify(data) });
  }

  async getIssueTaskRuns(issueId: string) {
    return this.request<any>(`/api/issues/${issueId}/task-runs`);
  }

  async getIssueActiveTask(issueId: string) {
    return this.request<any>(`/api/issues/${issueId}/active-task`);
  }

  async rerunIssue(issueId: string) {
    return this.request<any>(`/api/issues/${issueId}/rerun`, { method: 'POST' });
  }

  // --- Task Messages ---

  async getTaskMessages(taskId: string) {
    return this.request<{ messages: any[] }>(`/api/tasks/${taskId}/messages`);
  }

  // --- Agents ---

  async getAgents() {
    return this.request<{ agents: any[] }>(`/api/agents`);
  }

  async getAgent(id: string) {
    return this.request<any>(`/api/agents/${id}`);
  }

  // --- Projects ---

  async getProjects() {
    return this.request<{ projects: any[] }>(`/api/projects`);
  }

  async getProject(id: string) {
    return this.request<any>(`/api/projects/${id}`);
  }

  // --- Squads ---

  async getSquads() {
    return this.request<{ squads: any[] }>(`/api/squads`);
  }

  async getSquadMembers(squadId: string) {
    return this.request<any>(`/api/squads/${squadId}/members`);
  }

  // --- Autopilots ---

  async getAutopilots() {
    return this.request<any>(`/api/autopilots`);
  }

  // --- Health ---

  async ping(): Promise<boolean> {
    try {
      await this.request('/health');
      return true;
    } catch {
      return false;
    }
  }
}
