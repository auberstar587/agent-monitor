import type {
  AgentPlatformAdapter, TaskDTO, TaskMessageDTO, TaskUsageDTO,
  AgentDTO, ProjectDTO, CreateTaskInput, PlatformEventHandler,
  AdapterCapabilities,
} from '../interface.js';

// --- Mock data ---

const MOCK_AGENTS: AgentDTO[] = [
  { id: 'agent_nox', name: 'Nox', platform: 'claude-code', role: 'developer', status: 'busy', currentTaskId: 'task_1', currentProjectId: 'proj_agent_manager' },
  { id: 'agent_xiaozi', name: '小资', platform: 'codex', role: 'analyst', status: 'online', currentTaskId: 'task_2', currentProjectId: 'proj_agent_manager' },
  { id: 'agent_claude', name: 'Claude', platform: 'openclaw', role: 'reviewer', status: 'online' },
  { id: 'agent_copilot', name: 'Copilot', platform: 'codex', role: 'developer', status: 'offline' },
];

const MOCK_PROJECTS: ProjectDTO[] = [
  { id: 'proj_agent_manager', name: 'Agent Manager', path: '/Users/hanyongfeng/AI/agent-monitor', status: 'active', goals: ['统一入口', '多 Agent 协作'] },
  { id: 'proj_ai_memory', name: 'AiMemory', path: '/Users/hanyongfeng/AI/ai-memory', status: 'active', goals: ['白盒记忆管理'] },
  { id: 'proj_multica', name: 'Multica', status: 'active' },
];

const MOCK_TASKS: TaskDTO[] = [
  { id: 'task_1', title: '实现 Agent View 前端页面', description: '基于 SPEC.md 设计...', status: 'running', projectId: 'proj_agent_manager', agentId: 'agent_nox', assigneeId: 'agent_nox', priority: 'high', labels: ['frontend', 'p0'], createdAt: new Date(Date.now() - 600000).toISOString(), updatedAt: new Date().toISOString() },
  { id: 'task_2', title: '梳理多 Agent 协作模型', description: '输出协作模型文档', status: 'running', projectId: 'proj_agent_manager', agentId: 'agent_xiaozi', assigneeId: 'agent_xiaozi', priority: 'high', createdAt: new Date(Date.now() - 1200000).toISOString(), updatedAt: new Date().toISOString() },
  { id: 'task_3', title: '代码审查: 前端总览 PR', status: 'queued', projectId: 'proj_agent_manager', agentId: 'agent_claude', priority: 'medium', labels: ['review'], createdAt: new Date(Date.now() - 300000).toISOString(), updatedAt: new Date().toISOString() },
  { id: 'task_4', title: '实现记忆存储模块', status: 'completed', projectId: 'proj_ai_memory', agentId: 'agent_nox', assigneeId: 'agent_nox', priority: 'high', labels: ['backend', 'p0'], createdAt: new Date(Date.now() - 3600000).toISOString(), updatedAt: new Date().toISOString() },
  { id: 'task_5', title: '修复 Auth Token 过期', status: 'failed', projectId: 'proj_multica', agentId: 'agent_copilot', assigneeId: 'agent_copilot', priority: 'urgent', createdAt: new Date(Date.now() - 7200000).toISOString(), updatedAt: new Date().toISOString() },
];

const MOCK_MESSAGES: Record<string, TaskMessageDTO[]> = {
  task_1: [
    { seq: 1, type: 'text', content: '让我先读取 SPEC.md 了解设计...' },
    { seq: 2, type: 'tool_use', tool: 'Read', input: { file_path: 'SPEC.md' } },
    { seq: 3, type: 'tool_result', tool: 'Read', output: '200 OK (12.3KB)' },
    { seq: 4, type: 'text', content: '理解了设计，开始创建组件...' },
    { seq: 5, type: 'tool_use', tool: 'Write', input: { file_path: 'packages/ui/src/pages/AgentView.tsx' } },
    { seq: 6, type: 'tool_result', tool: 'Write', output: 'Created (245 lines)' },
    { seq: 7, type: 'text', content: '组件已创建，现在创建 SessionCard...' },
    { seq: 8, type: 'tool_use', tool: 'Write', input: { file_path: 'packages/ui/src/components/SessionCard.tsx' } },
    { seq: 9, type: 'tool_result', tool: 'Write', output: 'Created (180 lines)' },
  ],
  task_2: [
    { seq: 1, type: 'text', content: '分析现有协作模型文档...' },
    { seq: 2, type: 'tool_use', tool: 'Read', input: { file_path: 'COLLABORATION-MODEL.md' } },
    { seq: 3, type: 'tool_result', tool: 'Read', output: '200 OK (8.1KB)' },
    { seq: 4, type: 'text', content: '⚠ 需要确认: Agent 角色中的 project_manager 是否保留？' },
  ],
  task_5: [
    { seq: 1, type: 'text', content: '检查 Auth Token 过期问题...' },
    { seq: 2, type: 'tool_use', tool: 'Bash', input: { command: 'curl -s http://localhost:3001/api/projects' } },
    { seq: 3, type: 'tool_result', tool: 'Bash', output: '401 Unauthorized' },
    { seq: 4, type: 'error', content: 'Token expired. 需要重新生成 JWT secret.' },
  ],
};

export async function createMockAdapter(): Promise<AgentPlatformAdapter> {
  const handlers: PlatformEventHandler[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  const capabilities: AdapterCapabilities = {
    realtime: true,
    taskCreate: true,
    costTracking: true,
    agentControl: false,
    sessionPeek: true,
  };

  return {
    name: 'mock',
    capabilities,

    async getTasks(projectId?: string) {
      let tasks = MOCK_TASKS;
      if (projectId) tasks = tasks.filter(t => t.projectId === projectId);
      return tasks;
    },

    async getTask(taskId: string) {
      return MOCK_TASKS.find(t => t.id === taskId) ?? null;
    },

    async getTaskMessages(taskId: string) {
      return MOCK_MESSAGES[taskId] ?? [];
    },

    async getTaskUsage(taskId: string): Promise<TaskUsageDTO | null> {
      switch (taskId) {
        case 'task_1': return { inputTokens: 8432, outputTokens: 3245, costCents: 23, model: 'claude-sonnet-4-20250514' };
        case 'task_2': return { inputTokens: 2100, outputTokens: 890, costCents: 8, model: 'gpt-4' };
        case 'task_4': return { inputTokens: 15000, outputTokens: 6200, costCents: 45, model: 'claude-sonnet-4-20250514' };
        case 'task_5': return { inputTokens: 500, outputTokens: 200, costCents: 2, model: 'gpt-4' };
        default: return null;
      }
    },

    async createTask(input: CreateTaskInput) {
      const task: TaskDTO = {
        id: `task_mock_${Date.now()}`,
        title: input.title,
        description: input.description,
        status: 'queued',
        projectId: input.projectId,
        agentId: '',
        assigneeId: input.assigneeId,
        priority: input.priority,
        labels: input.labels,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_TASKS.push(task);
      return task;
    },

    async getAgents() {
      return MOCK_AGENTS;
    },

    async getAgent(agentId: string) {
      return MOCK_AGENTS.find(a => a.id === agentId) ?? null;
    },

    async getProjects() {
      return MOCK_PROJECTS;
    },

    subscribe(handler: PlatformEventHandler) {
      handlers.push(handler);

      // Simulate periodic events for dev
      if (!timer) {
        timer = setInterval(() => {
          const task = MOCK_TASKS[0];
          if (!task) return;
          for (const h of handlers) {
            if (task.status === 'running') {
              h.onTaskEvent({ type: 'task:progress', taskId: task.id });
            }
          }
        }, 15000);
      }

      return () => {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      };
    },

    async ping() {
      return true;
    },
  };
}
