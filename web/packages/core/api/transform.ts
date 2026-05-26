/**
 * Transform layer: Agent Monitor ↔ Multica data format mapping.
 *
 * Agent Monitor backend runs at localhost:3001 with its own data model.
 * Multica frontend expects Multica-shaped objects.
 * This module converts between the two.
 */

// --- AM → Multica type definitions (subset of what we need) ---

export interface AMAgent {
  agentId: string;
  agentName: string;
  type: string | null;
  role: string;
  model: string | null;
  platform: string;
  color: string;
  status: "idle" | "working" | "meeting" | "away" | "speaking";
  task: string | null;
  todayTasks: number;
  successRate: number | null;
  joinedAt: number;
  lastSeen: number;
  metadata: Record<string, unknown>;
}

export interface AMTask {
  id: string;
  title: string;
  description: string;
  agentId: string;
  priority: number;
  status: "queued" | "dispatched" | "running" | "completed" | "failed" | "cancelled";
  maxAttempts: number;
  attempt: number;
  progress: { step: number; total: number; summary: string; updatedAt: number } | null;
  result: string | null;
  error: string | null;
  createdAt: number;
  dispatchedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
}

export interface AMProject {
  id: string;
  name: string;
  path: string;
  agentId: string;
  type: string;
  model: string;
  port: number;
  status: "active" | "inactive";
  agentStatus: string;
  agentName: string | null;
  createdAt: number;
  updatedAt: number;
}

// --- Status mapping ---

const AM_TO_MULTICA_STATUS: Record<string, string> = {
  queued: "backlog",
  dispatched: "todo",
  running: "in_progress",
  completed: "done",
  failed: "cancelled",
  cancelled: "cancelled",
};

const MULTICA_TO_AM_STATUS: Record<string, string> = {
  backlog: "queued",
  todo: "dispatched",
  in_progress: "running",
  in_review: "running",
  done: "completed",
  cancelled: "cancelled",
};

const AM_TO_MULTICA_AGENT_STATUS: Record<string, string> = {
  idle: "idle",
  working: "working",
  meeting: "idle",
  away: "offline",
  speaking: "working",
};

// --- Task ↔ Issue ---

let issueCounter = 1000;

export function amTaskToIssue(task: AMTask): Record<string, unknown> {
  return {
    id: task.id,
    workspace_id: "default",
    number: ++issueCounter,
    identifier: `AM-${issueCounter}`,
    title: task.title,
    description: task.description || null,
    description_html: null,
    description_text: task.description || "",
    status: AM_TO_MULTICA_STATUS[task.status] ?? "backlog",
    priority: task.priority <= 1 ? "urgent" : task.priority <= 3 ? "high" : task.priority <= 5 ? "medium" : "low",
    assignee_type: task.agentId ? "agent" : null,
    assignee_id: task.agentId || null,
    creator_type: "member",
    creator_id: "system",
    parent_issue_id: null,
    project_id: null,
    position: 0,
    due_date: null,
    labels: [],
    created_at: new Date(task.createdAt).toISOString(),
    updated_at: new Date(task.completedAt || task.startedAt || task.createdAt).toISOString(),
  };
}

export function multicaStatusToAm(status: string): string {
  return MULTICA_TO_AM_STATUS[status] ?? "queued";
}

export function amPriorityToMultica(priority: number): string {
  if (priority <= 1) return "urgent";
  if (priority <= 3) return "high";
  if (priority <= 5) return "medium";
  return "low";
}

// --- Agent ---

export function amAgentToAgent(agent: AMAgent): Record<string, unknown> {
  return {
    id: agent.agentId,
    workspace_id: "default",
    runtime_id: "local",
    name: agent.agentName || agent.agentId,
    description: agent.role || "",
    instructions: "",
    avatar_url: null,
    runtime_mode: "local",
    runtime_config: {},
    custom_env: {},
    custom_args: [],
    custom_env_redacted: false,
    visibility: "workspace",
    status: AM_TO_MULTICA_AGENT_STATUS[agent.status] ?? "idle",
    max_concurrent_tasks: 1,
    model: agent.model || "",
    owner_id: null,
    skills: [],
    created_at: new Date(agent.joinedAt).toISOString(),
    updated_at: new Date(agent.lastSeen).toISOString(),
    archived_at: null,
    archived_by: null,
  };
}

// --- Project ---

export function amProjectToProject(project: AMProject): Record<string, unknown> {
  return {
    id: project.id,
    workspace_id: "default",
    title: project.name,
    description: project.path || "",
    icon: "📁",
    status: project.status === "active" ? "in_progress" : "paused",
    priority: "medium",
    lead_type: project.agentId ? "agent" : null,
    lead_id: project.agentId || null,
    issue_count: 0,
    done_count: 0,
    created_at: new Date(project.createdAt).toISOString(),
    updated_at: new Date(project.updatedAt).toISOString(),
  };
}
