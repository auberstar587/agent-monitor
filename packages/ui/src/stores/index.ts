import { create } from "zustand";
import { api } from "../lib/api";

interface AppState {
  projects: any[];
  outputs: any[];
  agents: any[];
  inbox: any[];
  blueprints: any[];
  loading: boolean;
  sidebarCollapsed: boolean;

  fetchProjects: () => Promise<void>;
  fetchOutputs: (filter?: any) => Promise<void>;
  fetchAgents: () => Promise<void>;
  fetchInbox: () => Promise<void>;
  fetchBlueprints: () => Promise<void>;
  toggleSidebar: () => void;
}

export const useStore = create<AppState>((set) => ({
  projects: [],
  outputs: [],
  agents: [],
  inbox: [],
  blueprints: [],
  loading: false,
  sidebarCollapsed: false,

  fetchProjects: async () => {
    const projects = await api.listProjects();
    set({ projects });
  },

  fetchOutputs: async (filter) => {
    const outputs = await api.listOutputs(filter);
    set({ outputs });
  },

  fetchAgents: async () => {
    const agents = await api.listAgents();
    set({ agents });
  },

  fetchInbox: async () => {
    const inbox = await api.listInbox("pending");
    set({ inbox });
  },

  fetchBlueprints: async () => {
    const blueprints = await api.listBlueprints();
    set({ blueprints });
  },

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
