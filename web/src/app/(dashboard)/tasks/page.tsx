'use client';

import { useQuery } from '@tanstack/react-query';
import { taskListOptions, agentListOptions, useCreateTask, useCancelTask } from '@/lib/queries';
import { TASK_STATUS_CONFIG, type Task, type TaskStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ListTodo, Plus, LayoutGrid, List, Search, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';

const COLUMNS: TaskStatus[] = ['queued', 'dispatched', 'running', 'completed', 'failed'];

function TaskCard({ task }: { task: Task }) {
  const cfg = TASK_STATUS_CONFIG[task.status];
  const cancelTask = useCancelTask();

  return (
    <Card className="bg-card border-border hover:border-border transition-colors cursor-pointer">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium">{task.title}</span>
          {['queued', 'dispatched'].includes(task.status) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-red-400"
              onClick={() => cancelTask.mutate(task.id)}
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>

        {task.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
        )}

        <div className="flex items-center gap-2 mt-2">
          <Badge variant="secondary" className={cn("text-xs", cfg.color.replace('bg-', 'bg-'))}>
            {cfg.label}
          </Badge>
          {task.agentId && (
            <span className="text-xs text-muted-foreground">{task.agentId}</span>
          )}
          {task.priority > 0 && (
            <Badge variant="outline" className="text-xs border-amber-600 text-amber-500">
              P{task.priority}
            </Badge>
          )}
        </div>

        {task.progress && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{task.progress.summary || `${task.progress.step}/${task.progress.total}`}</span>
              <span>{task.progress.total > 0 ? Math.round(task.progress.step / task.progress.total * 100) : 0}%</span>
            </div>
            <div className="w-full h-1 bg-secondary rounded mt-1">
              <div
                className="h-full bg-blue-500 rounded"
                style={{ width: `${task.progress.total > 0 ? (task.progress.step / task.progress.total * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        {task.error && (
          <p className="text-xs text-red-400 mt-1 truncate">{task.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

function TaskRow({ task }: { task: Task }) {
  const cfg = TASK_STATUS_CONFIG[task.status];
  const cancelTask = useCancelTask();

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.color}`} />
      <span className="text-sm flex-1 min-w-0 truncate">{task.title}</span>
      <Badge variant="secondary" className="text-xs bg-secondary shrink-0">
        {cfg.label}
      </Badge>
      {task.priority > 0 && (
        <Badge variant="outline" className="text-xs border-amber-600 text-amber-500 shrink-0">
          P{task.priority}
        </Badge>
      )}
      <span className="text-xs text-muted-foreground w-24 text-right truncate shrink-0">
        {task.agentId || '—'}
      </span>
      {['queued', 'dispatched'].includes(task.status) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground hover:text-red-400 shrink-0"
          onClick={() => cancelTask.mutate(task.id)}
        >
          取消
        </Button>
      )}
    </div>
  );
}

function CreateTaskDialog({ agents }: { agents: { agentId: string; agentName: string }[] }) {
  const [open, setOpen] = useState(false);
  const createTask = useCreateTask();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState('');
  const [priority, setPriority] = useState('0');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    createTask.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        agentId: agentId || undefined,
        priority: parseInt(priority) || 0,
      },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          setAgentId('');
          setPriority('0');
          setOpen(false);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm" className="gap-1">
          <Plus className="w-4 h-4" />
          新建任务
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>创建新任务</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="任务标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-secondary border-border"
            autoFocus
          />
          <Textarea
            placeholder="描述（可选）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-secondary border-border min-h-[80px]"
          />
          <div className="flex gap-3">
            <Select value={agentId} onValueChange={(v) => setAgentId(v ?? '')}>
              <SelectTrigger className="bg-secondary border-border flex-1">
                <SelectValue placeholder="分配 Agent（可选）" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="">不指定</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.agentId} value={a.agentId}>{a.agentName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={(v) => v && setPriority(v)}>
              <SelectTrigger className="bg-secondary border-border w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="0">P0 普通</SelectItem>
                <SelectItem value="5">P5 中等</SelectItem>
                <SelectItem value="10">P10 紧急</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={!title.trim() || createTask.isPending}>
              {createTask.isPending ? '创建中...' : '创建'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TasksPage() {
  const { data: tasksData, isLoading } = useQuery(taskListOptions());
  const { data: agentsData } = useQuery(agentListOptions());
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');

  const tasks = tasksData?.tasks || [];
  const agents = (agentsData?.agents || []).map(a => ({
    agentId: a.agentId,
    agentName: a.agentName,
  }));

  const filtered = tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    return true;
  });

  const statusCounts = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListTodo className="w-6 h-6" />
            任务
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {tasks.length} 个任务 · {statusCounts.running || 0} 执行中
          </p>
        </div>
        <CreateTaskDialog agents={agents} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索任务..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <div className="flex gap-1">
          {(['all', ...COLUMNS] as const).map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "text-xs",
                statusFilter === s ? "bg-secondary" : "text-muted-foreground"
              )}
            >
              {s === 'all' ? '全部' : TASK_STATUS_CONFIG[s]?.label}
              <span className="ml-1 text-muted-foreground">
                {s === 'all' ? tasks.length : (statusCounts[s] || 0)}
              </span>
            </Button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <Button
            variant={view === 'board' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('board')}
            className={cn(view === 'board' && "bg-secondary")}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('list')}
            className={cn(view === 'list' && "bg-secondary")}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Board View */}
      {view === 'board' && (
        <div className="grid grid-cols-5 gap-4">
          {COLUMNS.map(status => {
            const cfg = TASK_STATUS_CONFIG[status];
            const columnTasks = filtered.filter(t => t.status === status);
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className={`w-2 h-2 rounded-full ${cfg.color}`} />
                  <span className="text-sm font-medium text-muted-foreground">{cfg.label}</span>
                  <span className="text-xs text-muted-foreground/60">{columnTasks.length}</span>
                </div>
                <div className="space-y-2 min-h-[200px]">
                  {isLoading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <Card key={i} className="bg-card border-border animate-pulse">
                        <CardContent className="p-3 h-20" />
                      </Card>
                    ))
                  ) : (
                    columnTasks.map(task => (
                      <TaskCard key={task.id} task={task} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">加载中...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">暂无任务</div>
            ) : (
              filtered.map(task => (
                <TaskRow key={task.id} task={task} />
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
