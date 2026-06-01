import type {
  AgentPlatformAdapter, TaskDTO, TaskMessageDTO, TaskUsageDTO,
  AgentDTO, ProjectDTO, CreateTaskInput, PlatformEventHandler,
  AdapterCapabilities,
} from '../interface.js';

export function createManualAdapter(): AgentPlatformAdapter {
  const capabilities: AdapterCapabilities = {
    realtime: false,
    taskCreate: false,
    costTracking: false,
    agentControl: false,
    sessionPeek: false,
  };

  return {
    name: 'manual',
    capabilities,

    async getTasks() { return []; },
    async getTask() { return null; },
    async getTaskMessages() { return []; },
    async getTaskUsage() { return null; },
    async createTask() { throw new Error("Manual adapter does not support task creation"); },

    async getAgents() {
      return [
        { id: 'manual_doubao', name: '豆包', platform: 'doubao', role: 'analyst', status: 'offline' as const },
        { id: 'manual_yuanbao', name: '元宝', platform: 'yuanbao', role: 'analyst', status: 'offline' as const },
        { id: 'manual_workbuddy', name: 'WorkBuddy', platform: 'workbuddy', role: 'developer', status: 'offline' as const },
      ];
    },
    async getAgent(agentId: string) {
      const agents = await this.getAgents();
      return agents.find(a => a.id === agentId) ?? null;
    },

    async getProjects() { return []; },

    subscribe() { return () => {}; },
    async ping() { return true; },
  };
}
