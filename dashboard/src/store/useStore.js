import { create } from 'zustand';

const useStore = create((set, get) => ({
  // ===== Projects =====
  projects: [],
  setProjects: (projects) => set({ projects }),
  addProject: (project) => set((s) => ({ projects: [...s.projects, project] })),
  updateProjectInList: (id, updates) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),
  removeProjectFromList: (id) =>
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

  // ===== Tasks =====
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),
  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

  // ===== Agents =====
  agents: [],
  setAgents: (agents) => set({ agents }),
  addAgent: (agent) =>
    set((s) => {
      const exists = s.agents.some((a) => a.agentId === agent.agentId);
      if (exists) {
        return {
          agents: s.agents.map((a) =>
            a.agentId === agent.agentId ? { ...a, ...agent } : a
          ),
        };
      }
      return { agents: [...s.agents, agent] };
    }),
  removeAgent: (agentId) =>
    set((s) => ({ agents: s.agents.filter((a) => a.agentId !== agentId) })),
  updateAgentStatus: (agentId, status, extra = {}) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.agentId === agentId ? { ...a, status, ...extra } : a
      ),
    })),

  // ===== System Stats =====
  systemStats: null,
  setSystemStats: (stats) => set({ systemStats: stats }),

  // ===== Task Stats =====
  taskStats: null,
  setTaskStats: (stats) => set({ taskStats: stats }),

  // ===== Events (activity feed) =====
  events: [],
  addEvent: (event) =>
    set((s) => ({
      events: [event, ...s.events].slice(0, 100),
    })),
  setEvents: (events) => set({ events }),

  // ===== Meeting State =====
  meetingState: null,
  setMeetingState: (state) => set({ meetingState: state }),

  // ===== Loading States =====
  loading: {},
  setLoading: (key, val) =>
    set((s) => ({ loading: { ...s.loading, [key]: val } })),
}));

export { useStore };
