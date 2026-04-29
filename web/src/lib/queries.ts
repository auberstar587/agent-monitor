import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { TaskStatus } from './types';

// ===== Query Keys =====

export const queryKeys = {
  agents: ['agents'] as const,
  tasks: (filter?: { agentId?: string; status?: string }) => ['tasks', filter] as const,
  taskStats: ['taskStats'] as const,
  projects: ['projects'] as const,
  messages: ['messages'] as const,
  systemStats: ['systemStats'] as const,
  health: ['health'] as const,
};

// ===== Query Options =====

export const agentListOptions = () =>
  queryOptions({
    queryKey: queryKeys.agents,
    queryFn: () => api.listAgents(),
    refetchInterval: 10000,
  });

export const taskListOptions = (filter?: { agentId?: string; status?: TaskStatus }) =>
  queryOptions({
    queryKey: queryKeys.tasks(filter),
    queryFn: () => api.listTasks(filter),
    refetchInterval: 5000,
  });

export const taskStatsOptions = () =>
  queryOptions({
    queryKey: queryKeys.taskStats,
    queryFn: () => api.getTaskStats(),
    refetchInterval: 10000,
  });

export const projectListOptions = () =>
  queryOptions({
    queryKey: queryKeys.projects,
    queryFn: () => api.listProjects(),
    refetchInterval: 30000,
  });

export const messageListOptions = () =>
  queryOptions({
    queryKey: queryKeys.messages,
    queryFn: () => api.listMessages(50),
    refetchInterval: 5000,
  });

export const systemStatsOptions = () =>
  queryOptions({
    queryKey: queryKeys.systemStats,
    queryFn: () => api.getSystemStats(),
    refetchInterval: 15000,
  });

// ===== Mutations =====

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, result }: { id: string; result?: Record<string, unknown> }) =>
      api.completeTask(id, result),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useFailTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, error }: { id: string; error: string }) => api.failTask(id, error),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.cancelTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateProject>[1] }) =>
      api.updateProject(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
