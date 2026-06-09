const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

export interface EngineInfo {
  id: string;
  label: string;
  installed: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  tech_stack: string[];
  goals: string[];
  status: string;
  source: string;
  last_activity?: string;
  created_at: string;
  updated_at: string;
}

export const api = {
  listProjects: (status?: string) =>
    request<Project[]>(`/projects${status ? `?status=${status}` : ""}`),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  registerProject: (path: string, name?: string, description?: string) =>
    request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify({ path, name, description }),
    }),
  deleteProject: (id: string) =>
    request<{ deleted: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  updateProject: (id: string, data: any) =>
    request<any>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  getRelations: (projectId: string) =>
    request<any[]>(`/projects/${projectId}/relations`),
  addRelation: (sourceId: string, targetId: string, type: string, description?: string) =>
    request<any>(`/projects/${sourceId}/relations`, {
      method: "POST",
      body: JSON.stringify({ target_id: targetId, relation_type: type, description }),
    }),
  removeRelation: (relationId: string) =>
    request<void>(`/projects/relations/${relationId}`, { method: "DELETE" }),

  listOutputs: (filter?: Record<string, any>) => {
    const qs = filter
      ? "?" + Object.entries(filter).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`).join("&")
      : "";
    return request<any[]>(`/outputs${qs}`);
  },
  createOutput: (data: any) =>
    request<any>("/outputs", { method: "POST", body: JSON.stringify(data) }),
  getOutput: (id: string) => request<any>(`/outputs/${id}`),
  getTimeline: (projectId?: string) =>
    request<any[]>(`/timeline${projectId ? `?project_id=${projectId}` : ""}`),

  searchMemory: (q: string) => request<any[]>(`/memory/search?q=${encodeURIComponent(q)}`),
  listMemory: (opts?: Record<string, any>) => {
    const qs = opts ? "?" + Object.entries(opts).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("&") : "";
    return request<any[]>(`/memory${qs}`);
  },
  createMemory: (data: any) =>
    request<any>("/memory", { method: "POST", body: JSON.stringify(data) }),
  updateMemory: (id: string, data: any) =>
    request<any>(`/memory/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMemory: (id: string) =>
    request<{ deleted: boolean }>(`/memory/${id}`, { method: "DELETE" }),

  listTraces: (filter?: Record<string, any>) => {
    const qs = filter ? "?" + Object.entries(filter).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("&") : "";
    return request<any[]>(`/traces${qs}`);
  },
  getTrace: (taskId: string) => request<any>(`/traces/${taskId}`),

  listInbox: (status?: string) =>
    request<any[]>(`/inbox${status ? `?status=${status}` : ""}`),
  resolveInbox: (id: string, resolvedBy?: string) =>
    request<any>(`/inbox/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolved_by: resolvedBy }),
    }),
  approveInbox: (id: string, note?: string) =>
    request<any>(`/inbox/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  rejectInbox: (id: string, note?: string) =>
    request<any>(`/inbox/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  retryInbox: (id: string) =>
    request<any>(`/inbox/${id}/retry`, { method: "POST" }),

  listAgents: () => request<any[]>("/agents"),
  updateAgent: (id: string, data: any) => request<any>(`/agents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAgent: (id: string) => request<{ deleted: boolean }>(`/agents/${id}`, { method: "DELETE" }),
  syncAgents: () => request<{ synced: number }>("/agents/sync", { method: "POST" }),
  getAgent: (id: string) => request<any>(`/agents/${id}`),

  health: () => request<any>("/health"),
  listEngines: () => request<EngineInfo[]>("/engines"),

  // Blueprint APIs
  listBlueprints: () => request<any[]>("/blueprints"),
  getBlueprint: (id: string) => request<any>(`/blueprints/${id}`),
  createBlueprint: (data: any) => request<any>("/blueprints", { method: "POST", body: JSON.stringify(data) }),
  updateBlueprint: (id: string, data: any) => request<any>(`/blueprints/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBlueprint: (id: string) => request<{ success: boolean }>(`/blueprints/${id}`, { method: "DELETE" }),
  cloneBlueprint: (id: string) => request<any>(`/blueprints/${id}/clone`, { method: "POST" }),
  runBlueprint: (id: string) => request<any>(`/blueprints/${id}/run`, { method: "POST" }),
  listRuns: (blueprintId: string) => request<any[]>(`/blueprints/${blueprintId}/runs`),
  getRun: (runId: string) => request<any>(`/blueprints/runs/${runId}`),
  cancelRun: (runId: string) => request<any>(`/blueprints/runs/${runId}/cancel`, { method: "POST" }),

  // Meeting APIs
  listMeetings: () => request<any[]>("/meetings"),
  getMeeting: (id: string) => request<any>(`/meetings/${id}`),
  createMeeting: (data: any) => request<any>("/meetings", { method: "POST", body: JSON.stringify(data) }),
  startMeeting: (id: string) => request<any>(`/meetings/${id}/start`, { method: "POST" }),

  // Memory Phase 4
  memoryStats: () => request<any>("/memory/stats"),
  triggerDream: () => request<any>("/memory/dream", { method: "POST" }),
  getProjectContext: (id: string) => request<any>(`/projects/${id}/context`),

  // Task APIs
  listTasks: (filter?: Record<string, string>) => {
    const qs = filter ? "?" + Object.entries(filter).filter(([,v]) => v).map(([k,v]) => `${k}=${v}`).join("&") : "";
    return request<any[]>(`/tasks${qs}`);
  },
  getTask: (id: string) => request<any>(`/tasks/${id}`),
  createTask: (data: any) => request<any>("/tasks", { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id: string, data: any) => request<any>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  transitionTask: (id: string, status: string) =>
    request<any>(`/tasks/${id}/transition`, { method: "POST", body: JSON.stringify({ status }) }),
  deleteTask: (id: string) => request<{ deleted: boolean }>(`/tasks/${id}`, { method: "DELETE" }),
  smartCreateTask: (data: { title: string; description?: string; project_id?: string; assignee_id?: string }) =>
    request<any>("/tasks/smart", { method: "POST", body: JSON.stringify(data) }),

  assignRecommend: (taskId: string) =>
    request<any>(`/tasks/${taskId}/assign-recommend`, { method: "POST" }),

  executeTask: (id: string, engine: string) =>
    fetch(`${BASE}/tasks/${id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine }),
    }),
  getProjectStats: (id: string) =>
    request<{ tasks: Record<string, number>; agents: { assigned: number } }>(`/projects/${id}/stats`),

  // Phase 5
  listScheduled: () => request<any[]>("/scheduler"),
  scheduleBlueprint: (blueprintId: string, cron: string) =>
    request<any>("/scheduler", { method: "POST", body: JSON.stringify({ blueprint_id: blueprintId, cron }) }),
  unscheduleBlueprint: (blueprintId: string) =>
    request<{ success: boolean }>(`/scheduler/${blueprintId}`, { method: "DELETE" }),
  assessRisk: (action: any) => request<any>("/decisions/assess-risk", { method: "POST", body: JSON.stringify(action) }),

  // Filesystem browser (sandboxed to home dir)
  browseFs: (path: string) =>
    request<{ current: string; parent: string | null; dirs: { name: string; path: string; has_children: boolean }[] }>(
      `/fs/browse?path=${encodeURIComponent(path)}`,
    ),
  getHome: () => request<{ home: string; recent: string[] }>("/fs/home"),
  getCommon: () => request<{ shortcuts: { key: string; label: string; path: string }[] }>("/fs/common"),

  // Agent 会话 API（v2.4.0+）
  listAgentSessions: (filter?: Record<string, any>) => {
    const qs = filter && Object.keys(filter).length > 0 ? "?" + new URLSearchParams(filter).toString() : "";
    return request<any[]>(`/agent-sessions${qs}`);
  },
  getAgentSession: (id: string) => request<any>(`/agent-sessions/${id}`),
  createAgentSession: (data: any) => request<any>("/agent-sessions", { method: "POST", body: JSON.stringify(data) }),
  replyAgentSession: (id: string, message: string) =>
    request<any>(`/agent-sessions/${id}/reply`, { method: "POST", body: JSON.stringify({ message }) }),
  pauseAgentSession: (id: string) =>
    request<any>(`/agent-sessions/${id}/pause`, { method: "POST" }),
  stopAgentSession: (id: string) =>
    request<any>(`/agent-sessions/${id}/stop`, { method: "POST" }),

  // Artifact 可审查产物
  listArtifacts: (filter?: Record<string, any>) => {
    const qs = filter && Object.keys(filter).length > 0
      ? "?" + Object.entries(filter).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
      : "";
    return request<any[]>(`/artifacts${qs}`);
  },
  getArtifact: (id: string) => request<any>(`/artifacts/${id}`),
  createArtifact: (data: any) =>
    request<any>("/artifacts", { method: "POST", body: JSON.stringify(data) }),
  submitArtifact: (id: string) =>
    request<any>(`/artifacts/${id}/submit`, { method: "POST" }),
  acceptArtifact: (id: string, comment?: string) =>
    request<any>(`/artifacts/${id}/accept`, {
      method: "POST",
      body: JSON.stringify({ review_comment: comment }),
    }),
  rejectArtifact: (id: string, comment: string) =>
    request<any>(`/artifacts/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ review_comment: comment }),
    }),
  deleteArtifact: (id: string) =>
    request<void>(`/artifacts/${id}`, { method: "DELETE" }),

  // Quota
  getQuota: (force = false) => request<any>(`/quota${force ? "?force=true" : ""}`),
};
