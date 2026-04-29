'use client';

import { useQuery } from '@tanstack/react-query';
import { agentListOptions } from '@/lib/queries';
import { AGENT_STATUS_CONFIG, type Agent, type AgentStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, Search, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

function AgentCard({ agent }: { agent: Agent }) {
  const cfg = AGENT_STATUS_CONFIG[agent.status as AgentStatus];
  const isOnline = agent.status !== 'away';

  return (
    <Card className="bg-card border-border hover:border-border transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: agent.color }}
          >
            {agent.agentName.slice(0, 1)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{agent.agentName}</span>
              <span className="relative flex h-2 w-2">
                {isOnline && (
                  <span className={cn(
                    "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                    cfg?.color
                  )} />
                )}
                <span className={cn(
                  "relative inline-flex rounded-full h-2 w-2",
                  cfg?.color
                )} />
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs bg-secondary">
                {cfg?.label || agent.status}
              </Badge>
              {agent.role && (
                <span className="text-xs text-muted-foreground">{agent.role}</span>
              )}
            </div>

            {agent.task && (
              <p className="text-xs text-muted-foreground mt-2 truncate">{agent.task}</p>
            )}

            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {agent.model && <span>{agent.model}</span>}
              <span>{agent.platform}</span>
              {agent.todayTasks > 0 && (
                <span>今日 {agent.todayTasks} 任务</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
  const { data, isLoading } = useQuery(agentListOptions());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | AgentStatus>('all');

  const agents = data?.agents || [];

  const filtered = agents.filter(a => {
    if (search && !a.agentName.toLowerCase().includes(search.toLowerCase()) &&
        !a.agentId.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter !== 'all' && a.status !== filter) return false;
    return true;
  });

  const statusCounts = agents.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6" />
            Agents
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {agents.length} 个 Agent · {agents.filter(a => a.status !== 'away').length} 在线
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索 Agent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'idle', 'working', 'meeting', 'away'] as const).map(s => (
            <Button
              key={s}
              variant={filter === s ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter(s)}
              className={cn(
                "text-xs",
                filter === s ? "bg-secondary" : "text-muted-foreground"
              )}
            >
              {s === 'all' ? '全部' : AGENT_STATUS_CONFIG[s]?.label}
              {statusCounts[s] !== undefined && (
                <span className="ml-1 text-muted-foreground">{statusCounts[s]}</span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-card border-border animate-pulse">
              <CardContent className="p-4 h-28" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <WifiOff className="w-8 h-8 mx-auto mb-3" />
          <p>暂无{filter !== 'all' ? `${AGENT_STATUS_CONFIG[filter as AgentStatus]?.label}` : ''} Agent</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(agent => (
            <AgentCard key={agent.agentId} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
