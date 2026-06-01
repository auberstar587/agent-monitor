// --- DTOs ---

export interface TaskDTO {
  id: string;
  title: string;
  description?: string;
  status: 'queued' | 'dispatched' | 'running' | 'completed' | 'failed' | 'cancelled';
  projectId: string;
  agentId: string;
  assigneeId?: string;
  priority?: string;
  labels?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskMessageDTO {
  seq: number;
  type: 'text' | 'tool_use' | 'tool_result' | 'error';
  tool?: string;
  content?: string;
  input?: Record<string, unknown>;
  output?: string;
}

export interface AgentDTO {
  id: string;
  name: string;
  platform: string;
  role: string;
  status: 'online' | 'offline' | 'busy';
  currentTaskId?: string;
  currentProjectId?: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  path?: string;
  status: string;
  goals?: string[];
  createdAt?: string;
}

export interface TaskUsageDTO {
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  model?: string;
}

// --- Events ---

export interface TaskEvent {
  type: 'task:queued' | 'task:dispatched' | 'task:running' | 'task:progress' | 'task:completed' | 'task:failed' | 'task:cancelled';
  taskId: string;
  data?: Record<string, unknown>;
}

export interface AgentStatusEvent {
  type: 'agent:online' | 'agent:offline' | 'agent:busy';
  agentId: string;
  status: string;
}

// --- Platform event handler ---

export interface PlatformEventHandler {
  onTaskEvent: (event: TaskEvent) => void;
  onTaskMessage: (msg: TaskMessageDTO & { taskId: string }) => void;
  onAgentStatus: (event: AgentStatusEvent) => void;
}

// --- Adapter capabilities ---

export interface AdapterCapabilities {
  realtime: boolean;
  taskCreate: boolean;
  costTracking: boolean;
  agentControl: boolean;
  sessionPeek: boolean;
}

// --- Adapter input ---

export interface CreateTaskInput {
  title: string;
  description?: string;
  projectId: string;
  assigneeId?: string;
  priority?: string;
  labels?: string[];
}

// --- Main Adapter interface ---

export interface AgentPlatformAdapter {
  readonly name: string;
  readonly capabilities: AdapterCapabilities;

  // Task management
  getTasks(projectId?: string): Promise<TaskDTO[]>;
  getTask(taskId: string): Promise<TaskDTO | null>;
  getTaskMessages(taskId: string): Promise<TaskMessageDTO[]>;
  getTaskUsage(taskId: string): Promise<TaskUsageDTO | null>;
  createTask(input: CreateTaskInput): Promise<TaskDTO>;

  // Agent management
  getAgents(): Promise<AgentDTO[]>;
  getAgent(agentId: string): Promise<AgentDTO | null>;

  // Project management
  getProjects(): Promise<ProjectDTO[]>;

  // Event subscription
  subscribe(handler: PlatformEventHandler): () => void;

  // Health check
  ping(): Promise<boolean>;
}
