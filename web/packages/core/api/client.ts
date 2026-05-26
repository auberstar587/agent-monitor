import type {
  Issue,
  CreateIssueRequest,
  UpdateIssueRequest,
  ListIssuesResponse,
  SearchIssuesResponse,
  SearchProjectsResponse,
  UpdateMeRequest,
  CreateMemberRequest,
  UpdateMemberRequest,
  ListIssuesParams,
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentTask,
  AgentActivityBucket,
  AgentRunCount,
  AgentRuntime,
  InboxItem,
  IssueSubscriber,
  Comment,
  Reaction,
  IssueReaction,
  Workspace,
  WorkspaceRepo,
  MemberWithUser,
  User,
  Skill,
  CreateSkillRequest,
  UpdateSkillRequest,
  SetAgentSkillsRequest,
  PersonalAccessToken,
  CreatePersonalAccessTokenRequest,
  CreatePersonalAccessTokenResponse,
  RuntimeUsage,
  IssueUsageSummary,
  RuntimeHourlyActivity,
  RuntimeUsageByAgent,
  RuntimeUsageByHour,
  RuntimeUpdate,
  RuntimeModelListRequest,
  RuntimeLocalSkillListRequest,
  CreateRuntimeLocalSkillImportRequest,
  RuntimeLocalSkillImportRequest,
  TimelineEntry,
  AssigneeFrequencyEntry,
  TaskMessagePayload,
  Attachment,
  ChatSession,
  ChatMessage,
  ChatPendingTask,
  PendingChatTasksResponse,
  SendChatMessageResponse,
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
  ListProjectsResponse,
  Label,
  CreateLabelRequest,
  UpdateLabelRequest,
  ListLabelsResponse,
  IssueLabelsResponse,
  PinnedItem,
  CreatePinRequest,
  PinnedItemType,
  ReorderPinsRequest,
  Invitation,
  Autopilot,
  AutopilotTrigger,
  AutopilotRun,
  CreateAutopilotRequest,
  UpdateAutopilotRequest,
  CreateAutopilotTriggerRequest,
  UpdateAutopilotTriggerRequest,
  ListAutopilotsResponse,
  GetAutopilotResponse,
  ListAutopilotRunsResponse,
} from "../types";
import type { OnboardingCompletionPath } from "../onboarding/types";
import { type Logger, noopLogger } from "../logger";
import { createRequestId } from "../utils";
import { amTaskToIssue, amAgentToAgent, amProjectToProject, multicaStatusToAm } from "./transform";
import type { AMAgent, AMTask, AMProject } from "./transform";

/** Identifies the calling client to the server.
 *  Sent on every HTTP request as X-Client-Platform / X-Client-Version /
 *  X-Client-OS so the backend can log, gate, or split metrics by client.
 *  See server/internal/middleware/client.go for the receiving end. */
export interface ApiClientIdentity {
  /** Logical client kind. Server expects: "web" | "desktop" | "cli" | "daemon". */
  platform?: string;
  /** Client/app version string (e.g. "0.1.0", git tag, commit). */
  version?: string;
  /** Operating system the client is running on: "macos" | "windows" | "linux". */
  os?: string;
}

export interface ApiClientOptions {
  logger?: Logger;
  onUnauthorized?: () => void;
  /** Identifies the client to the server. Sent as X-Client-* headers. */
  identity?: ApiClientIdentity;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// --- Starter content (post-onboarding import) -----------------------------
// Shape mirrors the Go request/response in handler/onboarding.go.
//
// The client sends both branches of sub-issues and an unbound welcome
// issue template (title + description, no `agent_id`). The SERVER picks
// the branch by inspecting the workspace's agent list inside the
// import transaction. This removes the client as a trusted decider —
// even if the client has a stale agent cache or lies, the server uses
// the DB as source of truth.

export interface ImportStarterIssuePayload {
  title: string;
  description: string;
  status: string;
  priority: string;
  /** Server uses `user_id` (per app-wide AssigneePicker convention)
   *  as assignee when true. No member_id is threaded through. */
  assign_to_self: boolean;
}

export interface ImportStarterWelcomeIssueTemplate {
  title: string;
  description: string;
  /** Defaults to "high" on server when empty. */
  priority: string;
}

export interface ImportStarterContentPayload {
  workspace_id: string;
  project: { title: string; description: string; icon: string };
  /** Always sent. Server creates it only when an agent exists in the
   *  workspace; ignored otherwise. Agent id is picked by the server. */
  welcome_issue_template: ImportStarterWelcomeIssueTemplate;
  /** Used when the workspace has at least one agent. */
  agent_guided_sub_issues: ImportStarterIssuePayload[];
  /** Used when the workspace has zero agents. */
  self_serve_sub_issues: ImportStarterIssuePayload[];
}

export interface ImportStarterContentResponse {
  user: User;
  project_id: string;
  /** Non-null when server took the agent-guided branch. */
  welcome_issue_id: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(message: string, status: number, statusText: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
  }
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private logger: Logger;
  private options: ApiClientOptions;

  constructor(baseUrl: string, options?: ApiClientOptions) {
    this.baseUrl = baseUrl;
    this.options = options ?? {};
    this.logger = options?.logger ?? noopLogger;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private readCsrfToken(): string | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith("multica_csrf="));
    return match ? match.split("=")[1] ?? null : null;
  }

  private authHeaders(): Record<string, string> {
    // Agent Monitor: no auth needed, skip token/workspace/csrf
    const headers: Record<string, string> = {};
    const id = this.options.identity;
    if (id?.platform) headers["X-Client-Platform"] = id.platform;
    if (id?.version) headers["X-Client-Version"] = id.version;
    if (id?.os) headers["X-Client-OS"] = id.os;
    return headers;
  }

  private handleUnauthorized() {
    this.token = null;
    // Workspace id is owned by the URL-driven workspace-storage singleton
    // (set by [workspaceSlug]/layout.tsx). On 401, the auth flow navigates
    // to /login which leaves the workspace route, and the next workspace
    // entry will overwrite the id. No clear needed here.
    this.options.onUnauthorized?.();
  }

  private async parseErrorMessage(res: Response, fallback: string): Promise<string> {
    try {
      const data = await res.json() as { error?: string };
      if (typeof data.error === "string" && data.error) return data.error;
    } catch {
      // Ignore non-JSON error bodies.
    }
    return fallback;
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const rid = createRequestId();
    const start = Date.now();
    const method = init?.method ?? "GET";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Request-ID": rid,
      ...this.authHeaders(),
      ...((init?.headers as Record<string, string>) ?? {}),
    };

    this.logger.info(`→ ${method} ${path}`, { rid });

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });

    if (!res.ok) {
      if (res.status === 401) this.handleUnauthorized();
      const message = await this.parseErrorMessage(res, `API error: ${res.status} ${res.statusText}`);
      const logLevel = res.status === 404 ? "warn" : "error";
      this.logger[logLevel](`← ${res.status} ${path}`, { rid, duration: `${Date.now() - start}ms`, error: message });
      throw new ApiError(message, res.status, res.statusText);
    }

    this.logger.info(`← ${res.status} ${path}`, { rid, duration: `${Date.now() - start}ms` });

    // Handle 204 No Content
    if (res.status === 204) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  }

  // Auth (stubbed — no auth backend in agent-monitor)
  async sendCode(_email: string): Promise<void> {}

  async verifyCode(_email: string, _code: string): Promise<LoginResponse> {
    return { token: "", user: {} as User };
  }

  async googleLogin(_code: string, _redirectUri: string): Promise<LoginResponse> {
    return { token: "", user: {} as User };
  }

  async logout(): Promise<void> {}

  async issueCliToken(): Promise<{ token: string }> {
    return { token: "" };
  }

  async getMe(): Promise<User> {
    return {} as User;
  }

  async markOnboardingComplete(_payload?: {
    completion_path?: OnboardingCompletionPath;
  }): Promise<User> {
    return {} as User;
  }

  async joinCloudWaitlist(_payload: {
    email: string;
    reason?: string;
  }): Promise<User> {
    return {} as User;
  }

  async patchOnboarding(_payload: {
    questionnaire?: Record<string, unknown>;
  }): Promise<User> {
    return {} as User;
  }

  async importStarterContent(
    _payload: ImportStarterContentPayload,
  ): Promise<ImportStarterContentResponse> {
    return {} as ImportStarterContentResponse;
  }

  async dismissStarterContent(_payload?: {
    workspace_id?: string;
  }): Promise<User> {
    return {} as User;
  }

  async updateMe(_data: UpdateMeRequest): Promise<User> {
    return {} as User;
  }

  // Issues (mapped to Agent Monitor Tasks)
  async listIssues(params?: ListIssuesParams): Promise<ListIssuesResponse> {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", multicaStatusToAm(params.status));
    if (params?.assignee_id) search.set("agentId", params.assignee_id);
    const res = await this.fetch<{ tasks: AMTask[]; total: number }>(`/api/tasks?${search}`);
    const issues = res.tasks.map(amTaskToIssue) as unknown as Issue[];
    return { issues, total: res.total };
  }

  async searchIssues(params: { q: string; limit?: number; offset?: number; include_closed?: boolean; signal?: AbortSignal }): Promise<SearchIssuesResponse> {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.limit) search.set("limit", String(params.limit));
    if (params.offset) search.set("offset", String(params.offset));
    const res = await this.fetch<{ tasks: AMTask[]; total: number }>(`/api/tasks?${search}`, params.signal ? { signal: params.signal } : undefined);
    const issues = res.tasks.map(t => ({ ...amTaskToIssue(t), match_source: "title" as const })) as unknown as SearchIssuesResponse["issues"];
    return { issues, total: res.total };
  }

  async searchProjects(params: { q: string; limit?: number; offset?: number; include_closed?: boolean; signal?: AbortSignal }): Promise<SearchProjectsResponse> {
    const res = await this.fetch<{ projects: AMProject[]; total: number }>("/api/projects");
    const filtered = res.projects.filter(p => p.name.includes(params.q));
    const projects = filtered.map(p => ({ ...amProjectToProject(p), match_source: "title" as const })) as unknown as SearchProjectsResponse["projects"];
    return { projects, total: projects.length };
  }

  async getIssue(id: string): Promise<Issue> {
    const task = await this.fetch<AMTask>(`/api/tasks/${id}`);
    return amTaskToIssue(task) as unknown as Issue;
  }

  async createIssue(data: CreateIssueRequest): Promise<Issue> {
    const res = await this.fetch<AMTask>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: data.title,
        description: data.description ?? "",
        agentId: data.assignee_id ?? "",
        priority: data.priority === "urgent" ? 0 : data.priority === "high" ? 2 : data.priority === "medium" ? 5 : 8,
      }),
    });
    return amTaskToIssue(res) as unknown as Issue;
  }

  async createFeedback(_data: {
    message: string;
    url?: string;
    workspace_id?: string;
  }): Promise<{ id: string; created_at: string }> {
    return { id: "", created_at: new Date().toISOString() };
  }

  async updateIssue(id: string, data: UpdateIssueRequest): Promise<Issue> {
    const body: Record<string, unknown> = {};
    if (data.title !== undefined) body.title = data.title;
    if (data.description !== undefined) body.description = data.description;
    if (data.status !== undefined) body.status = multicaStatusToAm(data.status);
    if (data.assignee_id !== undefined) body.agentId = data.assignee_id;
    const task = await this.fetch<AMTask>(`/api/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return amTaskToIssue(task) as unknown as Issue;
  }

  async listChildIssues(_id: string): Promise<{ issues: Issue[] }> {
    return { issues: [] };
  }

  async getChildIssueProgress(): Promise<{ progress: { parent_issue_id: string; total: number; done: number }[] }> {
    return { progress: [] };
  }

  async deleteIssue(id: string): Promise<void> {
    await this.fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  async batchUpdateIssues(issueIds: string[], updates: UpdateIssueRequest): Promise<{ updated: number }> {
    return { updated: 0 };
  }

  async batchDeleteIssues(issueIds: string[]): Promise<{ deleted: number }> {
    return { deleted: 0 };
  }

  // Comments (real API)
  async listComments(issueId: string): Promise<Comment[]> {
    const res = await this.fetch<{ comments: Comment[] }>(`/api/tasks/${issueId}/comments`);
    return res.comments || [];
  }

  async createComment(
    issueId: string,
    content: string,
    type?: string,
    parentId?: string,
    attachmentIds?: string[],
  ): Promise<Comment> {
    const res = await this.fetch<{ comment: Comment }>(`/api/tasks/${issueId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content, type, parentId, attachmentIds }),
    });
    return res.comment;
  }

  async listTimeline(issueId: string): Promise<TimelineEntry[]> {
    return [];
  }

  async getAssigneeFrequency(): Promise<AssigneeFrequencyEntry[]> {
    return [];
  }

  async updateComment(commentId: string, content: string): Promise<Comment> {
    return {} as Comment;
  }

  async deleteComment(commentId: string): Promise<void> {
  }

  async addReaction(commentId: string, emoji: string): Promise<Reaction> {
    return {} as Reaction;
  }

  async removeReaction(commentId: string, emoji: string): Promise<void> {
  }

  async addIssueReaction(issueId: string, emoji: string): Promise<IssueReaction> {
    return {} as IssueReaction;
  }

  async removeIssueReaction(_issueId: string, _emoji: string): Promise<void> {
  }

  // Subscribers (stubbed)
  async listIssueSubscribers(_issueId: string): Promise<IssueSubscriber[]> {
    return [];
  }

  async subscribeToIssue(issueId: string, userId?: string, userType?: string): Promise<void> {
  }

  async unsubscribeFromIssue(issueId: string, userId?: string, userType?: string): Promise<void> {
  }

  // Agents (mapped from Agent Monitor ChatRoom)
  async listAgents(params?: { workspace_id?: string; include_archived?: boolean }): Promise<Agent[]> {
    const res = await this.fetch<{ agents: AMAgent[]; total: number }>("/api/chat/agents");
    return res.agents.map(a => amAgentToAgent(a) as unknown as Agent);
  }

  async getAgent(id: string): Promise<Agent> {
    const res = await this.fetch<{ agents: AMAgent[]; total: number }>("/api/chat/agents");
    const agent = res.agents.find(a => a.agentId === id);
    if (!agent) throw new ApiError("Agent not found", 404, "Not Found");
    return amAgentToAgent(agent) as unknown as Agent;
  }

  async createAgent(_data: CreateAgentRequest): Promise<Agent> {
    return {} as Agent;
  }

  async updateAgent(_id: string, _data: UpdateAgentRequest): Promise<Agent> {
    return {} as Agent;
  }

  async archiveAgent(_id: string): Promise<Agent> {
    return {} as Agent;
  }

  async restoreAgent(_id: string): Promise<Agent> {
    return {} as Agent;
  }

  // Bulk-cancel every active task (queued/dispatched/running) for the agent.
  // Permission: agent owner or workspace admin/owner. Server returns the
  // count of cancelled rows; broadcasts task:cancelled for each so other
  // surfaces can clear their live cards.
  async cancelAgentTasks(_id: string): Promise<{ cancelled: number }> {
    return { cancelled: 0 };
  }

  // Runtimes (stubbed)
  async listRuntimes(params?: { workspace_id?: string; owner?: "me" }): Promise<AgentRuntime[]> { return []; }
  async deleteRuntime(runtimeId: string): Promise<void> {}
  async getRuntimeUsage(runtimeId: string, params?: { days?: number }): Promise<RuntimeUsage[]> { return []; }
  async getRuntimeTaskActivity(runtimeId: string): Promise<RuntimeHourlyActivity[]> { return []; }
  async getRuntimeUsageByAgent(runtimeId: string, params?: { days?: number }): Promise<RuntimeUsageByAgent[]> { return []; }
  async getRuntimeUsageByHour(runtimeId: string, params?: { days?: number }): Promise<RuntimeUsageByHour[]> { return []; }
  async initiateUpdate(runtimeId: string, targetVersion: string): Promise<RuntimeUpdate> { return {} as RuntimeUpdate; }
  async getUpdateResult(runtimeId: string, updateId: string): Promise<RuntimeUpdate> { return {} as RuntimeUpdate; }
  async initiateListModels(runtimeId: string): Promise<RuntimeModelListRequest> { return {} as RuntimeModelListRequest; }
  async getListModelsResult(runtimeId: string, requestId: string): Promise<RuntimeModelListRequest> { return {} as RuntimeModelListRequest; }
  async initiateListLocalSkills(runtimeId: string): Promise<RuntimeLocalSkillListRequest> { return {} as RuntimeLocalSkillListRequest; }
  async getListLocalSkillsResult(runtimeId: string, requestId: string): Promise<RuntimeLocalSkillListRequest> { return {} as RuntimeLocalSkillListRequest; }
  async initiateImportLocalSkill(runtimeId: string, data: CreateRuntimeLocalSkillImportRequest): Promise<RuntimeLocalSkillImportRequest> { return {} as RuntimeLocalSkillImportRequest; }
  async getImportLocalSkillResult(runtimeId: string, requestId: string): Promise<RuntimeLocalSkillImportRequest> { return {} as RuntimeLocalSkillImportRequest; }

  async listAgentTasks(_agentId: string): Promise<AgentTask[]> {
    return [];
  }

  // Workspace-scoped agent task snapshot: every active task
  // (queued/dispatched/running) plus each agent's most recent terminal task.
  // Powers the front-end's "active wins, else latest terminal" presence
  // derivation; one fetch backs every per-agent presence read in the app.
  // Workspace is resolved server-side from the X-Workspace-Slug header.
  async getAgentTaskSnapshot(): Promise<AgentTask[]> {
    const res = await this.fetch<{ tasks: AMTask[] }>("/api/tasks");
    return res.tasks.map(t => ({
      id: t.id,
      agent_id: t.agentId,
      workspace_id: "default",
      issue_id: t.id,
      runtime_id: "local",
      status: t.status === "dispatched" ? "running" : t.status,
      priority: t.priority,
      dispatched_at: t.dispatchedAt ? new Date(t.dispatchedAt).toISOString() : null,
      started_at: t.startedAt ? new Date(t.startedAt).toISOString() : null,
      completed_at: t.completedAt ? new Date(t.completedAt).toISOString() : null,
      result: t.result,
      error: t.error,
      attempt: t.attempt,
      max_attempts: t.maxAttempts,
      created_at: new Date(t.createdAt).toISOString(),
      updated_at: new Date(t.completedAt || t.createdAt).toISOString(),
    })) as unknown as AgentTask[];
  }

  // Per-agent daily activity for the last 30 days, anchored on
  // completed_at. One workspace-wide fetch backs both the Agents-list
  // sparkline (uses trailing 7 buckets) and the agent detail "Last 30
  // days" panel (uses all 30).
  async getWorkspaceAgentActivity30d(): Promise<AgentActivityBucket[]> {
    return [];
  }

  // Per-agent 30-day total run count for the Agents-list RUNS column.
  async getWorkspaceAgentRunCounts(): Promise<AgentRunCount[]> {
    return [];
  }

  async getActiveTasksForIssue(_issueId: string): Promise<{ tasks: AgentTask[] }> {
    return { tasks: [] };
  }

  async listTaskMessages(_taskId: string): Promise<TaskMessagePayload[]> {
    return [];
  }

  async listTasksByIssue(_issueId: string): Promise<AgentTask[]> {
    return [];
  }

  async getIssueUsage(_issueId: string): Promise<IssueUsageSummary> {
    return {} as IssueUsageSummary;
  }

  async cancelTask(_issueId: string, _taskId: string): Promise<AgentTask> {
    return {} as AgentTask;
  }

  // Inbox (stubbed - not used in agent-monitor)
  async listInbox(): Promise<InboxItem[]> {
    return [];
  }
  async markInboxRead(id: string): Promise<InboxItem> {
    return {} as InboxItem;
  }
  async archiveInbox(id: string): Promise<InboxItem> {
    return {} as InboxItem;
  }
  async getUnreadInboxCount(): Promise<{ count: number }> {
    return { count: 0 };
  }
  async markAllInboxRead(): Promise<{ count: number }> {
    return { count: 0 };
  }
  async archiveAllInbox(): Promise<{ count: number }> {
    return { count: 0 };
  }
  async archiveAllReadInbox(): Promise<{ count: number }> {
    return { count: 0 };
  }
  async archiveCompletedInbox(): Promise<{ count: number }> {
    return { count: 0 };
  }

  // App Config (stubbed)
  async getConfig(): Promise<{
    cdn_domain: string;
    allow_signup: boolean;
    google_client_id?: string;
    posthog_key?: string;
    posthog_host?: string;
  }> {
    return { cdn_domain: "", allow_signup: false };
  }

  // Workspaces (stubbed - single workspace mode)
  private static DEFAULT_WORKSPACE: Workspace = {
    id: "default",
    name: "Agent Monitor",
    slug: "default",
    description: "AI Agent Status & Task Management",
    context: "",
    settings: {},
    repos: [],
    owner_id: "system",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as Workspace;

  async listWorkspaces(): Promise<Workspace[]> {
    return [ApiClient.DEFAULT_WORKSPACE];
  }

  async getWorkspace(id: string): Promise<Workspace> {
    return ApiClient.DEFAULT_WORKSPACE;
  }

  async createWorkspace(data: { name: string; slug: string; description?: string; context?: string }): Promise<Workspace> {
    return ApiClient.DEFAULT_WORKSPACE;
  }

  async updateWorkspace(id: string, data: { name?: string; description?: string; context?: string; settings?: Record<string, unknown>; repos?: WorkspaceRepo[] }): Promise<Workspace> {
    return ApiClient.DEFAULT_WORKSPACE;
  }

  // Members (stubbed — single user mode)
  async listMembers(workspaceId: string): Promise<MemberWithUser[]> {
    return [];
  }

  async createMember(workspaceId: string, data: CreateMemberRequest): Promise<Invitation> {
    return {} as Invitation;
  }

  async updateMember(workspaceId: string, memberId: string, data: UpdateMemberRequest): Promise<MemberWithUser> {
    return {} as MemberWithUser;
  }

  async deleteMember(workspaceId: string, memberId: string): Promise<void> {
  }

  async leaveWorkspace(workspaceId: string): Promise<void> {
  }

  // Invitations (stubbed — no auth/invite)
  async listWorkspaceInvitations(workspaceId: string): Promise<Invitation[]> {
    return [];
  }

  async revokeInvitation(workspaceId: string, invitationId: string): Promise<void> {
  }

  async listMyInvitations(): Promise<Invitation[]> {
    return [];
  }

  async getInvitation(invitationId: string): Promise<Invitation> {
    return {} as Invitation;
  }

  async acceptInvitation(invitationId: string): Promise<MemberWithUser> {
    return {} as MemberWithUser;
  }

  async declineInvitation(invitationId: string): Promise<void> {
  }

  async deleteWorkspace(_workspaceId: string): Promise<void> {
  }

  // Skills (stubbed)
  async listSkills(): Promise<Skill[]> { return []; }
  async getSkill(id: string): Promise<Skill> { return {} as Skill; }
  async createSkill(data: CreateSkillRequest): Promise<Skill> { return {} as Skill; }
  async updateSkill(id: string, data: UpdateSkillRequest): Promise<Skill> { return {} as Skill; }
  async deleteSkill(id: string): Promise<void> {}
  async importSkill(data: { url: string }): Promise<Skill> { return {} as Skill; }
  async listAgentSkills(agentId: string): Promise<Skill[]> { return []; }
  async setAgentSkills(agentId: string, data: SetAgentSkillsRequest): Promise<void> {}

  // Personal Access Tokens (stubbed)
  async listPersonalAccessTokens(): Promise<PersonalAccessToken[]> {
    return [];
  }

  async createPersonalAccessToken(data: CreatePersonalAccessTokenRequest): Promise<CreatePersonalAccessTokenResponse> {
    return {} as CreatePersonalAccessTokenResponse;
  }

  async revokePersonalAccessToken(id: string): Promise<void> {
  }

  // File Upload & Attachments (stubbed — no upload backend in agent-monitor)
  async uploadFile(_file: File, _opts?: { issueId?: string; commentId?: string }): Promise<Attachment> {
    return {} as Attachment;
  }

  // Chat Sessions (stubbed — no backend chat sessions yet)
  async listChatSessions(params?: { status?: string }): Promise<ChatSession[]> {
    return [];
  }

  async getChatSession(id: string): Promise<ChatSession> {
    return {} as ChatSession;
  }

  async createChatSession(data: { agent_id: string; title?: string }): Promise<ChatSession> {
    return {} as ChatSession;
  }

  async archiveChatSession(id: string): Promise<void> {
  }

  async listChatMessages(sessionId: string): Promise<ChatMessage[]> {
    return [];
  }

  async sendChatMessage(sessionId: string, content: string): Promise<SendChatMessageResponse> {
    return {} as SendChatMessageResponse;
  }

  async getPendingChatTask(sessionId: string): Promise<ChatPendingTask> {
    return {} as ChatPendingTask;
  }

  async listPendingChatTasks(): Promise<PendingChatTasksResponse> {
    return { tasks: [] } as PendingChatTasksResponse;
  }

  async markChatSessionRead(sessionId: string): Promise<void> {
  }

  async cancelTaskById(taskId: string): Promise<void> {
    await this.fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
  }

  async listAttachments(_issueId: string): Promise<Attachment[]> {
    return [];
  }

  async deleteAttachment(_id: string): Promise<void> {
  }

  // Projects (mapped from Agent Monitor ProjectManager)
  async listProjects(params?: { status?: string }): Promise<ListProjectsResponse> {
    const res = await this.fetch<{ projects: AMProject[]; total: number }>("/api/projects");
    const projects = res.projects.map(p => amProjectToProject(p) as unknown as Project);
    return { projects, total: res.total };
  }

  async getProject(id: string): Promise<Project> {
    const res = await this.fetch<{ projects: AMProject[]; total: number }>("/api/projects");
    const project = res.projects.find(p => p.id === id);
    if (!project) throw new ApiError("Project not found", 404, "Not Found");
    return amProjectToProject(project) as unknown as Project;
  }

  async createProject(data: CreateProjectRequest): Promise<Project> {
    const res = await this.fetch<AMProject>("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: data.title,
        path: data.description ?? "",
      }),
    });
    return amProjectToProject(res) as unknown as Project;
  }

  async updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
    const body: Record<string, unknown> = {};
    if (data.title !== undefined) body.name = data.title;
    if (data.description !== undefined) body.path = data.description;
    const res = await this.fetch<AMProject>(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return amProjectToProject(res) as unknown as Project;
  }

  async deleteProject(id: string): Promise<void> {
    await this.fetch(`/api/projects/${id}`, { method: "DELETE" });
  }

  // Labels (stubbed)
  async listLabels(): Promise<ListLabelsResponse> { return { labels: [], total: 0 }; }
  async getLabel(id: string): Promise<Label> { return {} as Label; }
  async createLabel(data: CreateLabelRequest): Promise<Label> { return {} as Label; }
  async updateLabel(id: string, data: UpdateLabelRequest): Promise<Label> { return {} as Label; }
  async deleteLabel(id: string): Promise<void> {}
  async listLabelsForIssue(issueId: string): Promise<IssueLabelsResponse> { return { labels: [] } as IssueLabelsResponse; }
  async attachLabel(issueId: string, labelId: string): Promise<IssueLabelsResponse> { return { labels: [] } as IssueLabelsResponse; }
  async detachLabel(issueId: string, labelId: string): Promise<IssueLabelsResponse> { return { labels: [] } as IssueLabelsResponse; }

  // Pins (stubbed)
  async listPins(): Promise<PinnedItem[]> { return []; }
  async createPin(data: CreatePinRequest): Promise<PinnedItem> { return {} as PinnedItem; }
  async deletePin(itemType: PinnedItemType, itemId: string): Promise<void> {}
  async reorderPins(data: ReorderPinsRequest): Promise<void> {}

  // Autopilots (stubbed)
  async listAutopilots(params?: { status?: string }): Promise<ListAutopilotsResponse> { return { autopilots: [], total: 0 }; }
  async getAutopilot(id: string): Promise<GetAutopilotResponse> { return {} as GetAutopilotResponse; }
  async createAutopilot(data: CreateAutopilotRequest): Promise<Autopilot> { return {} as Autopilot; }
  async updateAutopilot(id: string, data: UpdateAutopilotRequest): Promise<Autopilot> { return {} as Autopilot; }
  async deleteAutopilot(id: string): Promise<void> {}
  async triggerAutopilot(id: string): Promise<AutopilotRun> { return {} as AutopilotRun; }
  async listAutopilotRuns(id: string, params?: { limit?: number; offset?: number }): Promise<ListAutopilotRunsResponse> { return { runs: [], total: 0 }; }
  async createAutopilotTrigger(autopilotId: string, data: CreateAutopilotTriggerRequest): Promise<AutopilotTrigger> { return {} as AutopilotTrigger; }
  async updateAutopilotTrigger(autopilotId: string, triggerId: string, data: UpdateAutopilotTriggerRequest): Promise<AutopilotTrigger> { return {} as AutopilotTrigger; }
  async deleteAutopilotTrigger(autopilotId: string, triggerId: string): Promise<void> {}
}
