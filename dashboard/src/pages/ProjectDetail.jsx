import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { fetchProjects, fetchProjectStats } from '../api/projects';
import { fetchTasks } from '../api/tasks';
import StatusDot from '../components/StatusDot';
import {
  ArrowLeft, Edit2, ListChecks, CheckCircle, XCircle, AlertTriangle,
  UserCheck, Tag, Target, Clock, GitFork, Users, FolderKanban,
  ShieldAlert, TrendingUp, FileCode
} from 'lucide-react';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const tasks = useStore((s) => s.tasks);
  const setTasks = useStore((s) => s.setTasks);
  const events = useStore((s) => s.events);
  const agents = useStore((s) => s.agents);
  const [stats, setStats] = useState(null);

  const project = projects.find((p) => p.id === id);

  useEffect(() => {
    fetchProjects().then((res) => setProjects(res.projects || [])).catch(() => {});
    fetchTasks().then((res) => setTasks(res.tasks || [])).catch(() => {});
  }, [setProjects, setTasks]);

  useEffect(() => {
    if (id) {
      fetchProjectStats(id).then(setStats).catch(() => {});
    }
  }, [id]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <p>项目不存在</p>
      </div>
    );
  }

  // Build agent map
  const agentMap = useMemo(() => {
    const map = {};
    (agents || []).forEach((a) => { map[a.agentId] = a; });
    return map;
  }, [agents]);

  // Project tasks
  const projectTasks = (tasks || []).filter((t) => t.projectId === id);
  const runningCount = projectTasks.filter((t) => t.status === 'running').length;
  const completedCount = projectTasks.filter((t) => t.status === 'completed').length;
  const failedCount = projectTasks.filter((t) => t.status === 'failed').length;
  const blockedCount = projectTasks.filter((t) => t.status === 'blocked').length;
  const reviewCount = projectTasks.filter((t) => t.status === 'review').length;

  // Participants: PM + assigned + agentIds list
  const participantIds = useMemo(() => {
    const ids = new Set();
    if (project.managerAgentId) ids.add(project.managerAgentId);
    if (project.agentId) ids.add(project.agentId);
    (project.agentIds || []).forEach((aid) => ids.add(aid));
    return Array.from(ids);
  }, [project]);
  const participants = participantIds.map((aid) => agentMap[aid]).filter(Boolean);

  // PM Agent
  const pmAgent = project.managerAgentId ? agentMap[project.managerAgentId] : null;

  // Events filtered by this project
  const projectEvents = useMemo(
    () => (events || [])
        .filter((e) => e.projectId === id || e.task?.projectId === id)
        .slice(0, 20),
    [events, id]
  );

  // Risk indicators
  const riskLevel = useMemo(() => {
    let level = 'low'; // low / medium / high
    const reasons = [];
    if (blockedCount > 0) {
      level = 'high';
      reasons.push(`${blockedCount} 个阻塞任务`);
    }
    if (failedCount > completedCount && failedCount > 2) {
      level = level === 'high' ? 'high' : 'medium';
      reasons.push('失败率较高');
    }
    if (runningCount > 5) reasons.push('并发任务较多');
    return { level, reasons };
  }, [blockedCount, failedCount, completedCount, runningCount]);

  const isArchived = project.status === 'archived';

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/projects')}
          className="p-2 rounded-lg hover:bg-white/[0.04] transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <StatusDot status={isArchived ? 'away' : project.status === 'active' ? 'idle' : 'away'} />
            <h1 className={`text-xl font-semibold ${isArchived ? 'text-gray-400' : 'text-white'}`}>
              {project.name}
            </h1>
            {/* Archive Badge */}
            {isArchived && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-500 border border-white/[0.08]">
                已归档
              </span>
            )}
            {/* Type badge */}
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${getTypeBadgeStyle(project.type)}`}>
              {getTypeLabel(project.type)}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{project.path || '未设置路径'}</p>
        </div>
        {/* Repo link */}
        {project.repo && (
          <a
            href={project.repo}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-cyan-400 bg-cyan-500/10 rounded-lg hover:bg-cyan-500/20 transition-colors"
          >
            <GitFork className="w-3.5 h-3.5" />
            仓库
          </a>
        )}
      </div>

      {/* ===== Info Cards Row ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <InfoCard label="主 Agent" value={agentMap[project.agentId]?.agentName || project.agentId || '未分配'} />
        <InfoCard label="类型" value={getTypeLabel(project.type)} />
        <InfoCard label="模型" value={project.model || '—'} />
        <InfoCard label="端口" value={project.port || '—'} />
        {pmAgent ? (
          <InfoCard label="PM Agent" value={`${pmAgent.agentName || pmAgent.agentId}`} accent="#06b6d4" />
        ) : (
          <InfoCard label="PM Agent" value="未指定" muted />
        )}
        <InfoCard label="参与者" value={`${participants.length} 人`} accent="#8b5cf6" />
      </div>

      {/* ===== Stats Cards Row ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard label="总任务" value={projectTasks.length} icon={ListChecks} color="#06b6d4" />
        <StatCard label="进行中" value={runningCount} icon={Clock} color="#f59e0b" />
        <StatCard label="已完成" value={completedCount} icon={CheckCircle} color="#3fb950" />
        <StatCard label="失败" value={failedCount} icon={XCircle} color="#ef4444" />
        <StatCard label="阻塞" value={blockedCount} icon={ShieldAlert} color="#ef4444" />
        <StatCard label="待 Review" value={reviewCount} icon={TrendingUp} color="#a371f7" />
      </div>

      {/* ===== Two-column layout below ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Goals + Participants + Tags */}
        <div className="lg:col-span-2 space-y-6">
          {/* Goals Section */}
          {(project.goals && project.goals.length > 0) && (
            <SectionCard title="项目目标" icon={Target}>
              <ul className="space-y-2">
                {project.goals.map((goal, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center flex-shrink-0 text-[11px] font-medium mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-gray-300">{goal}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* PM Agent Card */}
          {pmAgent ? (
            <SectionCard title="项目经理" icon={UserCheck}>
              <div className="flex items-center gap-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: pmAgent.color || '#6366f1' }}
                >
                  {(pmAgent.agentName || pmAgent.agentId).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-white flex items-center gap-2">
                    {pmAgent.agentName || pmAgent.agentId}
                    <StatusDot status={pmAgent.status} size="sm" />
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {pmAgent.role || '—'} · {pmAgent.platform || '—'} · {pmAgent.model || '—'}
                    {pmAgent.successRate != null && ` · 成功率 ${pmAgent.successRate}%`}
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {/* Participant Agents */}
          {participants.length > 0 && (
            <SectionCard title="参与成员" icon={Users}>
              <div className="flex flex-wrap gap-2.5">
                {participants.map((a) => (
                  <div
                    key={a.agentId}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                  >
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold text-white"
                      style={{ backgroundColor: a.color || '#6366f1' }}
                    >
                      {(a.agentName || a.agentId).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-white">
                        {a.agentName || a.agentId}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {a.role || 'agent'}
                      </div>
                    </div>
                    <StatusDot status={a.status} size="sm" />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Tags */}
          {(project.tags && project.tags.length > 0) && (
            <SectionCard title="标签" icon={Tag}>
              <div className="flex flex-wrap gap-1.5">
                {project.tags.map((tag) => (
                  <span key={tag} className="px-2.5 py-1 rounded-md text-xs bg-white/[0.04] text-gray-300 border border-white/[0.06]">
                    {tag}
                  </span>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Project Tasks List */}
          <SectionCard title="项目任务" icon={ListChecks} badge={`${projectTasks.length}`} rightAction={
            <button
              onClick={() => navigate('/tasks')}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              查看全部 →
            </button>
          }>
            {projectTasks.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">暂无任务</p>
            ) : (
              <div className="space-y-1.5">
                {projectTasks.slice(0, 10).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors group"
                  >
                    <StatusDot status={taskStatusToAgentStatus(task.status)} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 truncate group-hover:text-white transition-colors">
                        {task.title}
                      </div>
                      <div className="text-[11px] text-gray-600 flex items-center gap-2 mt-0.5">
                        {task.agentId && (
                          <span>→ {agentMap[task.agentId]?.agentName || task.agentId}</span>
                        )}
                        {task.priority && (
                          <span className={`px-1 py-px rounded ${priorityStyle(task.priority)}`}>
                            {task.priority}
                          </span>
                        )}
                        {task.type && <span>{task.type}</span>}
                      </div>
                    </div>
                    <TaskStatusPill status={task.status} />
                  </div>
                ))}
                {projectTasks.length > 10 && (
                  <div className="text-xs text-gray-600 text-center pt-2">
                    还有 {projectTasks.length - 10} 个任务...
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right column: Event Timeline + Risk Indicators + Artifact Stub */}
        <div className="space-y-6">
          {/* Risk Indicators */}
          {riskLevel.level !== 'low' && (
            <SectionCard title="风险提示" icon={ShieldAlert} danger>
              <div className={`rounded-lg p-3 ${
                riskLevel.level === 'high'
                  ? 'bg-red-500/10 border border-red-500/20'
                  : 'bg-amber-500/10 border border-amber-500/20'
              }`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    riskLevel.level === 'high' ? 'text-red-400' : 'text-amber-400'
                  }`} />
                  <div>
                    <p className={`text-sm font-medium ${
                      riskLevel.level === 'high' ? 'text-red-300' : 'text-amber-300'
                    }`}>
                      风险等级：{riskLevel.level === 'high' ? '高' : '中'}
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {riskLevel.reasons.map((r, i) => (
                        <li key={i} className="text-xs text-gray-400">· {r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Event Timeline */}
          <SectionCard title="事件时间线" icon={Clock} badge={String(projectEvents.length)}>
            {projectEvents.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">暂无活动记录</p>
            ) : (
              <div className="relative pl-4 border-l border-white/[0.06] space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {projectEvents.map((evt, i) => (
                  <div key={evt.id || i} className="relative text-xs">
                    {/* Dot */}
                    <span
                      className="absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full ring-2 ring-[#111118]"
                      style={{
                        backgroundColor:
                          i === 0 ? '#06b6d4' :
                          evt.type?.includes('error') || evt.type?.includes('fail')
                            ? '#ef4444' : '#374151',
                      }}
                    />
                    <div className="text-gray-300">
                      {formatEventType(evt.type || evt.eventType)}
                      {evt.payload?.summary && (
                        <span className="text-gray-400 ml-1">
                          — {evt.payload.summary}
                        </span>
                      )}
                    </div>
                    <div className="text-gray-600 mt-0.5">
                      {formatEventTime(evt.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Artifact Area (Stub - Milestone 2) */}
          <SectionCard title="产物" icon={FileCode} disabled comingSoon>
            <div className="py-6 text-center">
              <FileCode className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm text-gray-500">产物管理</p>
              <p className="text-xs text-gray-600 mt-1">Milestone 2 功能，敬请期待</p>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function SectionCard({ title, icon: Icon, children, badge, rightAction, danger, disabled, comingSoon }) {
  return (
    <div className={`bg-[#1a1a2e] rounded-xl border p-5 ${
      danger ? 'border-white/[0.06]' : 'border-white/5'
    } ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-gray-500" />}
          {title}
          {badge && (
            <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-gray-500">
              {badge}
            </span>
          )}
        </h3>
        {rightAction && <div>{rightAction}</div>}
        {comingSoon && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400">
            Coming Soon
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function TaskStatusPill({ status }) {
  const styles = {
    queued: 'bg-gray-500/15 text-gray-400',
    running: 'bg-amber-500/15 text-amber-400',
    blocked: 'bg-red-500/15 text-red-400',
    review: 'bg-violet-500/15 text-violet-400',
    completed: 'bg-emerald-500/15 text-emerald-400',
    failed: 'bg-red-500/15 text-red-400',
  };
  const labels = {
    queued: '排队',
    running: '运行中',
    blocked: '阻塞',
    review: 'Review',
    completed: '完成',
    failed: '失败',
  };
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${styles[status] || ''}`}>
      {labels[status] || status}
    </span>
  );
}

function priorityStyle(priority) {
  const map = {
    critical: 'bg-red-500/20 text-red-400',
    high: 'bg-orange-500/20 text-orange-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    low: 'bg-blue-500/20 text-blue-400',
  };
  return map[priority] || 'bg-gray-500/20 text-gray-400';
}

// --- Utility ---

const TYPE_BADGE_MAP = {
  chat: 'bg-blue-500/20 text-blue-400',
  tool: 'bg-cyan-500/20 text-cyan-400',
  coding: 'bg-emerald-500/20 text-emerald-400',
  research: 'bg-violet-500/20 text-violet-400',
  creative: 'bg-pink-500/20 text-pink-400',
};

function getTypeBadgeStyle(type) {
  return TYPE_BADGE_MAP[type] || 'bg-gray-500/20 text-gray-400';
}

const TYPE_LABEL_MAP = {
  chat: '对话型',
  tool: '工具型',
  coding: '编程型',
  research: '调研型',
  creative: '创作型',
};

function getTypeLabel(type) {
  return TYPE_LABEL_MAP[type] || type || '—';
}

function taskStatusToAgentStatus(status) {
  const map = {
    running: 'working', completed: 'idle', failed: 'error',
    queued: 'away', dispatched: 'working', cancelled: 'away',
    blocked: 'error', review: 'working',
  };
  return map[status] || 'away';
}

function InfoCard({ label, value, accent, muted }) {
  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-sm font-medium ${muted ? 'text-gray-500' : 'text-white'}`} style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{label}</span>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

const EVENT_TYPE_LABELS = {
  'task:created': '创建任务',
  'task:updated': '更新任务',
  'task:progress': '进度更新',
  'agent:join': 'Agent 上线',
  'agent:leave': 'Agent 下线',
  'agent:status': '状态变更',
  'message': '消息',
  'event:new': '系统事件',
};

function formatEventType(type) {
  return EVENT_TYPE_LABELS[type] || type || '未知事件';
}

function formatEventTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
