'use client';

import { useQuery } from '@tanstack/react-query';
import { agentListOptions, taskListOptions, taskStatsOptions, systemStatsOptions } from '@/lib/queries';
import { AGENT_STATUS_CONFIG, TASK_STATUS_CONFIG, type AgentStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Bot, ListTodo, Cpu, HardDrive, MemoryStick, Activity } from 'lucide-react';

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function StatCard({ title, value, icon: Icon, children }: {
  title: string; value: string | number; icon: React.ElementType; children?: React.ReactNode;
}) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {children}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: agentsData } = useQuery(agentListOptions());
  const { data: tasksData } = useQuery(taskListOptions());
  const { data: taskStatsData } = useQuery(taskStatsOptions());
  const { data: sysData } = useQuery(systemStatsOptions());

  const agents = agentsData?.agents || [];
  const onlineAgents = agents.filter(a => a.status !== 'away');
  const taskStats = taskStatsData;
  const sys = sysData;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">概览</h1>
        <p className="text-muted-foreground text-sm mt-1">Agent Monitor 状态总览</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="在线 Agent"
          value={`${onlineAgents.length} / ${agents.length}`}
          icon={Bot}
        >
          <div className="flex gap-1 mt-2 flex-wrap">
            {agents.slice(0, 5).map(a => (
              <Badge
                key={a.agentId}
                variant="outline"
                className="text-xs gap-1 border-border"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${AGENT_STATUS_CONFIG[a.status as AgentStatus]?.color || 'bg-zinc-500'}`} />
                {a.agentName}
              </Badge>
            ))}
          </div>
        </StatCard>

        <StatCard
          title="活跃任务"
          value={taskStats?.byStatus?.running || 0}
          icon={ListTodo}
        >
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            <span>排队 {taskStats?.byStatus?.queued || 0}</span>
            <span>执行 {taskStats?.byStatus?.running || 0}</span>
            <span>完成 {taskStats?.byStatus?.completed || 0}</span>
          </div>
        </StatCard>

        <StatCard
          title="CPU 使用率"
          value={`${sys?.cpu?.usagePercent || 0}%`}
          icon={Cpu}
        >
          <Progress value={sys?.cpu?.usagePercent || 0} className="mt-2 h-1.5" />
        </StatCard>

        <StatCard
          title="内存使用率"
          value={`${sys?.memory?.usagePercent || 0}%`}
          icon={HardDrive}
        >
          <div className="text-xs text-muted-foreground mt-1">
            {formatBytes(sys?.memory?.used || 0)} / {formatBytes(sys?.memory?.total || 0)}
          </div>
          <Progress value={sys?.memory?.usagePercent || 0} className="mt-2 h-1.5" />
        </StatCard>
      </div>

      {/* Agent Status Grid */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-4 h-4" />
            Agent 状态
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无在线 Agent</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {agents.map(agent => {
                const cfg = AGENT_STATUS_CONFIG[agent.status as AgentStatus];
                return (
                  <div
                    key={agent.agentId}
                    className="rounded-lg border border-border p-3 hover:border-border transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${cfg?.color || 'bg-zinc-500'}`} />
                      <span className="font-medium text-sm">{agent.agentName}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-xs bg-secondary">
                        {cfg?.label || agent.status}
                      </Badge>
                      {agent.task && (
                        <span className="truncate max-w-[120px]">{agent.task}</span>
                      )}
                    </div>
                    {agent.model && (
                      <div className="mt-1 text-xs text-muted-foreground/60">{agent.model}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Tasks */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListTodo className="w-4 h-4" />
            最近任务
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(tasksData?.tasks || []).length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无任务</p>
          ) : (
            <div className="space-y-2">
              {(tasksData?.tasks || []).slice(0, 8).map(task => {
                const cfg = TASK_STATUS_CONFIG[task.status as keyof typeof TASK_STATUS_CONFIG];
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                  >
                    <span className={`w-2 h-2 rounded-full ${cfg?.color || 'bg-zinc-500'}`} />
                    <span className="text-sm flex-1">{task.title}</span>
                    <Badge variant="secondary" className="text-xs bg-secondary">
                      {cfg?.label || task.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {task.agentId || '未分配'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disk Usage */}
      {sys?.disk && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MemoryStick className="w-4 h-4" />
              磁盘使用
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Progress value={sys.disk.usagePercent} className="flex-1 h-2" />
              <span className="text-sm text-muted-foreground">{sys.disk.usagePercent}%</span>
              <span className="text-xs text-muted-foreground">
                {formatBytes(sys.disk.used)} / {formatBytes(sys.disk.total)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
