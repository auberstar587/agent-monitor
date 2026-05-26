import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { fetchProjects } from '../api/projects';
import { fetchTasks, fetchTaskStats } from '../api/tasks';
import { fetchAgents } from '../api/agents';
import { fetchEvents } from '../api/system';
import KPICard from '../components/KPICard';
import StatusDot from '../components/StatusDot';
import {
  FolderKanban, Bot, ListChecks, Eye,
  AlertTriangle, ClipboardCheck, UserCheck,
  BarChart3,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Cell as PieCell } from 'recharts';

const CHART_COLORS = ['#06b6d4', '#f59e0b', '#3fb950', '#ef4444', '#8b5cf6', '#6b7280'];

export default function Dashboard() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const agents = useStore((s) => s.agents);
  const events = useStore((s) => s.events);
  const setProjects = useStore((s) => s.setProjects);
  const setTasks = useStore((s) => s.setTasks);
  const setAgents = useStore((s) => s.setAgents);
  const setEvents = useStore((s) => s.setEvents);
  const taskStats = useStore((s) => s.taskStats);
  const setTaskStats = useStore((s) => s.setTaskStats);

  // Track whether this is the initial mount (to avoid double-fetch with socket)
  const initialLoadDone = useRef(false);

  // Initial data load
  useEffect(() => {
    async function load() {
      try {
        const [pRes, tRes, aRes, eRes, sRes] = await Promise.all([
          fetchProjects(),
          fetchTasks(),
          fetchAgents(),
          fetchEvents(),
          fetchTaskStats(),
        ]);
        setProjects(pRes.projects || []);
        setTasks(tRes.tasks || []);
        setAgents(aRes.agents || []);
        setEvents((eRes.events || []).reverse());
        if (sRes) setTaskStats(sRes);
        initialLoadDone.current = true;
      } catch (err) {
        console.warn('[Dashboard] Failed to load data:', err.message);
      }
    }
    load();
  }, [setProjects, setTasks, setAgents, setEvents, setTaskStats]);

  // Real-time refresh: re-fetch when new event arrives via Socket.io
  const addEvent = useStore((s) => s.addEvent);
  const updateTaskInStore = useStore((s) => s.updateTask);

  const handleRealtimeRefresh = useCallback(() => {
    // Re-fetch tasks to get latest state
    fetchTasks().then((res) => setTasks(res.tasks || [])).catch(() => {});
    fetchEvents().then((res) => setEvents((res.events || []).reverse())).catch(() => {});
  }, [setTasks, setEvents]);

  // Listen for store changes via a polling-like approach
  // The socket events in App.jsx already call addEvent / updateTask,
  // so we just need to detect when events change and refresh dependent data
  const prevEventsLenRef = useRef(0);
  useEffect(() => {
    if (events.length !== prevEventsLenRef.current && prevEventsLenRef.current > 0) {
      // New event detected — refresh tasks
      const timer = setTimeout(() => {
        fetchTasks().then((res) => setTasks(res.tasks || [])).catch(() => {});
      }, 500);
      return () => clearTimeout(timer);
    }
    prevEventsLenRef.current = events.length;
  }, [events.length, setTasks]);

  // ===== KPI Computations =====
  const activeProjects = projects.filter((p) => p.status === 'active').length;
  const onlineAgents = agents.filter((a) => a.status !== 'away' && a.status !== 'offline' && a.status !== undefined).length;
  const runningTasks = tasks.filter((t) => t.status === 'running' || t.status === 'dispatched').length;
  const completedToday = tasks.filter((t) => {
    if (t.status !== 'completed' || !t.completedAt) return false;
    const now = new Date();
    const completed = new Date(t.completedAt);
    return now.toDateString() === completed.toDateString();
  }).length;

  // New KPIs
  const blockedTasks = tasks.filter((t) => t.status === 'blocked').length;
  const reviewTasks = tasks.filter((t) => t.status === 'review').length;

  // Task status distribution for charts
  const taskDistribution = [
    { name: '待处理', value: tasks.filter((t) => t.status === 'queued' || t.status === 'queued').length, color: '#6b7280' },
    { name: '进行中', value: runningTasks, color: '#f59e0b' },
    { name: '已完成', value: tasks.filter((t) => t.status === 'completed').length, color: '#3fb950' },
    { name: '阻塞', value: blockedTasks, color: '#ef4444' },
    { name: '审核中', value: reviewTasks, color: '#8b5cf6' },
    { name: '失败', value: tasks.filter((t) => t.status === 'failed').length, color: '#f97316' },
  ].filter((d) => d.value > 0);

  // Tasks per project for bar chart
  const tasksPerProject = (() => {
    const map = {};
    for (const t of tasks) {
      const p = projects.find((p) => p.id === t.projectId);
      const name = p ? p.name : '未分配';
      map[name] = (map[name] || 0) + 1;
    }
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  })();

  return (
    <div className="space-y-6">
      {/* KPI Cards - 7 cards in responsive grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <KPICard title="活跃项目" value={activeProjects} total={projects.length} icon={FolderKanban} color="#06b6d4" />
        <KPICard title="在线 Agent" value={onlineAgents} total={agents.length} icon={Bot} color="#3fb950" />
        <KPICard title="进行中" value={runningTasks} icon={ListChecks} color="#f59e0b" />
        <KPICard title="今日完成" value={completedToday} icon={Eye} color="#8b5cf6" />
        <KPICard title="阻塞任务" value={blockedTasks} icon={AlertTriangle} color="#ef4444" />
        <KPICard title="待 Review" value={reviewTasks} icon={ClipboardCheck} color="#8b5cf6" />
        <KPICard title="总任务" value={tasks.length} icon={BarChart3} color="#6b7280" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task Distribution Pie */}
        <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">任务状态分布</h3>
          {taskDistribution.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={taskDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {taskDistribution.map((entry, i) => (
                      <PieCell key={i} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111118', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {taskDistribution.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-gray-400">{d.name}</span>
                    </div>
                    <span className="text-gray-200 font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-8 text-center">暂无数据</p>
          )}
        </div>

        {/* Tasks per Project Bar Chart */}
        <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">项目任务分布</h3>
          {tasksPerProject.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={tasksPerProject} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#9ca3af', fontSize: 11 }} width={90} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111118', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: '#e2e8f0' }}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {tasksPerProject.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-500 py-8 text-center">暂无数据</p>
          )}
        </div>
      </div>

      {/* Main content: Events + Project Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity - with real-time indicator */}
        <div className="lg:col-span-2 bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300">最近活动</h2>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              实时更新
            </span>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-sm text-gray-500">暂无活动</p>
            ) : (
              events.slice(0, 25).map((evt, i) => (
                <div key={evt.id || i} className="flex items-start gap-3 text-sm">
                  <StatusDot status={getEventStatusColor(evt.type)} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-300">{formatEvent(evt)}</span>
                    <span className="text-gray-600 ml-2 text-xs">
                      {evt.timestamp ? formatRelativeTime(evt.timestamp) : ''}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Project Overview */}
        <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">项目概览</h2>
          <div className="space-y-3">
            {projects.length === 0 ? (
              <p className="text-sm text-gray-500">暂无项目</p>
            ) : (
              projects.slice(0, 6).map((p) => {
                const projTasks = tasks.filter((t) => t.projectId === p.id);
                const doneCount = projTasks.filter((t) => t.status === 'completed').length;
                return (
                  <a
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-200"
                  >
                    <StatusDot status={p.status === 'active' ? 'idle' : 'away'} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-200 truncate">{p.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span>{p.agentName || '未分配'}</span>
                        {projTasks.length > 0 && (
                          <span>{doneCount}/{projTasks.length} 完成</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeBadgeStyle(p.type)}`}>
                      {p.type}
                    </span>
                  </a>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getEventStatusColor(type) {
  if (type?.includes('completed') || type?.includes('joined')) return 'idle';
  if (type?.includes('failed') || type?.includes('error')) return 'error';
  if (type?.includes('started') || type?.includes('running')) return 'working';
  return 'idle';
}

function formatEvent(evt) {
  const name = evt.payload?.name || evt.actorAgentId || evt.agentId || 'System';
  switch (evt.type) {
    case 'agent.joined': case 'agent:join': return `${name} 上线了`;
    case 'agent.left': case 'agent:leave': return `${name} 离开了`;
    case 'agent.status_changed': case 'agent:status':
      return `${name} 状态 → ${evt.payload?.to || '?'}`;
    case 'task.created': case 'task:created':
      return `创建任务: ${evt.payload?.title || ''}`;
    case 'task.started': case 'task:started':
      return `开始任务: ${evt.payload?.title || ''}`;
    case 'task.completed': case 'task:completed':
      return `完成任务: ${evt.payload?.title || ''}`;
    case 'task.failed': case 'task:failed':
      return `任务失败: ${evt.payload?.title || ''}`;
    case 'system.started': return '系统启动';
    case 'message': return `${evt.agentName || name}: ${(evt.content || '').slice(0, 40)}`;
    default: return evt.type;
  }
}

function getTypeBadgeStyle(type) {
  const styles = {
    chat: 'bg-blue-500/20 text-blue-400',
    tool: 'bg-cyan-500/20 text-cyan-400',
    coding: 'bg-emerald-500/20 text-emerald-400',
    research: 'bg-violet-500/20 text-violet-400',
    creative: 'bg-pink-500/20 text-pink-400',
  };
  return styles[type] || 'bg-gray-500/20 text-gray-400';
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
