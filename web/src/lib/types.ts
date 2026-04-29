// Agent Monitor - TypeScript 类型定义

// ===== Agent =====

export interface Agent {
  agentId: string;
  agentName: string;
  type: string | null;
  role: string;
  model: string | null;
  platform: string;
  color: string;
  status: AgentStatus;
  task: string | null;
  todayTasks: number;
  successRate: number | null;
  joinedAt: number;
  lastSeen: number;
  metadata: Record<string, unknown>;
}

export type AgentStatus = 'idle' | 'working' | 'meeting' | 'away' | 'speaking';

export const AGENT_STATUS_CONFIG: Record<AgentStatus, { label: string; color: string }> = {
  idle: { label: '空闲', color: 'bg-emerald-500' },
  working: { label: '工作中', color: 'bg-blue-500' },
  meeting: { label: '会议中', color: 'bg-amber-500' },
  away: { label: '离线', color: 'bg-zinc-400' },
  speaking: { label: '发言中', color: 'bg-purple-500' },
};

// ===== Task =====

export interface Task {
  id: string;
  title: string;
  description: string;
  agentId: string;
  priority: number;
  status: TaskStatus;
  maxAttempts: number;
  attempt: number;
  progress: TaskProgress | null;
  result: string | null;
  error: string | null;
  createdAt: number;
  dispatchedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
}

export type TaskStatus = 'queued' | 'dispatched' | 'running' | 'completed' | 'failed' | 'cancelled';

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  queued: { label: '排队中', color: 'bg-zinc-400' },
  dispatched: { label: '已派发', color: 'bg-blue-400' },
  running: { label: '执行中', color: 'bg-blue-500' },
  completed: { label: '已完成', color: 'bg-emerald-500' },
  failed: { label: '失败', color: 'bg-red-500' },
  cancelled: { label: '已取消', color: 'bg-zinc-300' },
};

export interface TaskProgress {
  step: number;
  total: number;
  summary: string;
  updatedAt: number;
}

export interface TaskStats {
  total: number;
  byStatus: Record<string, number>;
  byAgent: Record<string, number>;
}

// ===== Project =====

export interface Project {
  id: string;
  name: string;
  path: string;
  agentId: string;
  type: string;
  model: string;
  port: number;
  status: 'active' | 'inactive';
  agentStatus: AgentStatus;
  agentName: string | null;
  createdAt: number;
  updatedAt: number;
}

// ===== Message =====

export interface Message {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  type: string;
  timestamp: number;
  status: string;
  metadata: Record<string, unknown>;
}

// ===== System Stats =====

export interface PortInfo {
  port: number;
  inUse: boolean;
  project: { projectId: string; projectName: string } | null;
  pid: string | null;
}

export interface PortScanResult {
  ports: PortInfo[];
  conflicts: { port: number; projects: string[] }[];
}

export interface SystemStats {
  platform: string;
  os: string;
  cpu: { cores: number; load: number[]; usagePercent: number };
  memory: { total: number; used: number; free: number; usagePercent: number };
  disk: { total: number; used: number; free: number; usagePercent: number };
  timestamp: number;
}

// ===== API Response =====

export interface ApiResponse<T> {
  success: boolean;
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  [key: string]: T[] | number | unknown;
  total: number;
}
