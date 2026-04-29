'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { systemStatsOptions } from '@/lib/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Activity, Cpu, HardDrive, MemoryStick, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function SystemPage() {
  const { data: sys } = useQuery(systemStatsOptions());
  const { data: ports } = useQuery({
    queryKey: ['portScan'],
    queryFn: () => api.getPortScan(),
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6" />
          系统
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {sys?.os} · {sys?.cpu?.cores} 核 CPU
        </p>
      </div>

      {/* Resource Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CPU</CardTitle>
            <Cpu className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sys?.cpu?.usagePercent || 0}%</div>
            <Progress value={sys?.cpu?.usagePercent || 0} className="mt-2 h-1.5" />
            <div className="text-xs text-muted-foreground mt-2">
              负载: {(sys?.cpu?.load || [0]).map(l => l.toFixed(1)).join(' / ')}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">内存</CardTitle>
            <HardDrive className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sys?.memory?.usagePercent || 0}%</div>
            <Progress value={sys?.memory?.usagePercent || 0} className="mt-2 h-1.5" />
            <div className="text-xs text-muted-foreground mt-2">
              {formatBytes(sys?.memory?.used || 0)} / {formatBytes(sys?.memory?.total || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">磁盘</CardTitle>
            <MemoryStick className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sys?.disk?.usagePercent || 0}%</div>
            <Progress value={sys?.disk?.usagePercent || 0} className="mt-2 h-1.5" />
            <div className="text-xs text-muted-foreground mt-2">
              {formatBytes(sys?.disk?.used || 0)} / {formatBytes(sys?.disk?.total || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Port Conflicts */}
      {ports?.conflicts && ports.conflicts.length > 0 && (
        <Card className="bg-card border-border border-amber-600/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              端口冲突
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ports.conflicts.map((c, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <Badge variant="outline" className="text-xs border-amber-600 text-amber-400">
                  :{c.port}
                </Badge>
                <span className="text-sm">{c.projects.join(' ← 冲突 → ')}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Port Map */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wifi className="w-4 h-4" />
            端口总览
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {(ports?.ports || []).map(p => (
              <div
                key={p.port}
                className={cn(
                  "rounded-lg border p-2 text-center transition-colors",
                  p.project
                    ? p.inUse
                      ? "border-emerald-600/50 bg-emerald-900/20"
                      : "border-amber-600/50 bg-amber-900/20"
                    : p.inUse
                      ? "border-border bg-muted/30"
                      : "border-border"
                )}
              >
                <div className="text-sm font-mono font-bold">:{p.port}</div>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    p.inUse ? "bg-emerald-500" : "bg-muted-foreground/40"
                  )} />
                  <span className="text-xs text-muted-foreground">
                    {p.inUse ? '占用' : '空闲'}
                  </span>
                </div>
                {p.project && (
                  <div className="text-xs text-muted-foreground mt-1 truncate" title={p.project.projectName}>
                    {p.project.projectName}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
