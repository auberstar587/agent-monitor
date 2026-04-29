'use client';

import { useQuery } from '@tanstack/react-query';
import { projectListOptions, useCreateProject, useDeleteProject, useUpdateProject } from '@/lib/queries';
import { type Project } from '@/lib/types';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderKanban, Plus, Trash2, FolderInput } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';

const PROJECT_TYPES = ['chat', 'tool', 'coding', 'research', 'creative'];
const PROJECT_MODELS = ['qwen2.5', 'deepseek', 'gpt-4', 'glm-4', 'glm-5.1', 'MiniMax-M2.7'];

function ProjectRow({ project }: { project: Project }) {
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();
  const [editing, setEditing] = useState(false);
  const [portValue, setPortValue] = useState(String(project.port || ''));

  function savePort() {
    const port = parseInt(portValue, 10) || 0;
    updateProject.mutate(
      { id: project.id, data: { port } },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
      <FolderKanban className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-medium flex-1 min-w-0 truncate">{project.name}</span>
      <Badge
        variant="secondary"
        className={cn(
          "text-xs shrink-0",
          project.status === 'active' ? "bg-emerald-900/50 text-emerald-400" : "bg-secondary text-muted-foreground"
        )}
      >
        {project.status === 'active' ? '活跃' : '未激活'}
      </Badge>
      <Badge variant="outline" className="text-xs shrink-0 border-border">
        {project.type}
      </Badge>
      {/* Port */}
      {editing ? (
        <div className="flex items-center gap-1 w-20">
          <Input
            value={portValue}
            onChange={(e) => setPortValue(e.target.value)}
            onBlur={savePort}
            onKeyDown={(e) => e.key === 'Enter' && savePort()}
            className="h-6 text-xs bg-secondary border-border px-1.5 w-16"
            autoFocus
            placeholder="端口号"
          />
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground hover:text-foreground w-20 justify-center shrink-0"
          onClick={() => { setPortValue(String(project.port || '')); setEditing(true); }}
        >
          {project.port || '—'}
        </Button>
      )}
      <span className="text-xs text-muted-foreground w-24 text-right truncate shrink-0">
        {project.agentName || project.agentId || '—'}
      </span>
      <span className="text-xs text-muted-foreground/60 w-24 text-right truncate shrink-0">
        {project.model}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-muted-foreground/60 hover:text-red-400 shrink-0"
        onClick={() => deleteProject.mutate(project.id)}
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}

function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const createProject = useCreateProject();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [port, setPort] = useState('');
  const [type, setType] = useState('tool');
  const [model, setModel] = useState('qwen2.5');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createProject.mutate(
      { name: name.trim(), path: path.trim() || undefined, port: port ? parseInt(port, 10) : undefined, type, model },
      { onSuccess: () => { setName(''); setPath(''); setPort(''); setOpen(false); } }
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm" className="gap-1">
          <Plus className="w-4 h-4" />
          新建项目
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>创建新项目</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="项目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-secondary border-border"
            autoFocus
          />
          <Input
            placeholder="项目路径（可选）"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="bg-secondary border-border"
          />
          <Input
            placeholder="端口号（可选）"
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
            className="bg-secondary border-border"
          />
          <div className="flex gap-3">
            <Select value={type} onValueChange={(v) => v && setType(v)}>
              <SelectTrigger className="bg-secondary border-border flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {PROJECT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={model} onValueChange={(v) => v && setModel(v)}>
              <SelectTrigger className="bg-secondary border-border flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {PROJECT_MODELS.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={!name.trim() || createProject.isPending}>
              {createProject.isPending ? '创建中...' : '创建'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectsPage() {
  const { data, isLoading } = useQuery(projectListOptions());

  const projects = data?.projects || [];
  const activeCount = projects.filter(p => p.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderKanban className="w-6 h-6" />
            项目
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {projects.length} 个项目 · {activeCount} 活跃
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {/* Table header */}
          <div className="flex items-center gap-3 py-2 px-3 border-b border-border text-xs text-muted-foreground">
            <div className="w-4" />
            <span className="flex-1">名称</span>
            <span className="w-16 text-center">状态</span>
            <span className="w-16 text-center">类型</span>
            <span className="w-20 text-center">端口</span>
            <span className="w-24 text-right">负责人</span>
            <span className="w-24 text-right">模型</span>
            <div className="w-6" />
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : projects.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FolderKanban className="w-8 h-8 mx-auto mb-3 text-muted-foreground/60" />
              <p>暂无项目</p>
              <p className="text-xs mt-1">点击"新建项目"或扫描目录导入</p>
            </div>
          ) : (
            projects.map(project => (
              <ProjectRow key={project.id} project={project} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
