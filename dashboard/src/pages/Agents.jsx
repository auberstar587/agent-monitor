import { useEffect, useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { fetchAgents } from '../api/agents';
import StatusDot from '../components/StatusDot';
import {
  Bot, Search, ChevronDown, ChevronUp, Cpu,
  FolderKanban, ListChecks, Tag, Clock, Zap,
  UserCheck, MessageSquare, X
} from 'lucide-react';

const ROLE_LABELS = {
  project_manager: '项目经理',
  developer: '开发',
  tester: '测试',
  analyst: '分析',
  reviewer: '审核',
  writer: '文档',
  researcher: '调研',
  agent: '通用',
};

const ROLE_ICONS = {
  project_manager: UserCheck,
  developer: Cpu,
  tester: ListChecks,
  analyst: Tag,
  reviewer: MessageSquare,
};

const PLATFORM_STYLES = {
  openclaw: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/20',
  claude: 'bg-violet-500/20 text-violet-400 border-violet-500/20',
  codex: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20',
  opencode: 'bg-orange-500/20 text-orange-400 border-orange-500/20',
  custom: 'bg-gray-500/20 text-gray-400 border-gray-500/20',
  unknown: 'bg-gray-500/20 text-gray-400 border-gray-500/20',
};

const STATUS_OPTIONS = [
  { value: 'idle', label: '空闲', color: '#3fb950' },
  { value: 'working', label: '工作中', color: '#f59e0b' },
  { value: 'meeting', label: '会议中', color: '#a371f7' },
  { value: 'away', label: '离开', color: '#6b7280' },
];

const CAPABILITY_STYLES = [
  'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  'bg-violet-500/10 text-violet-400 border border-violet-500/20',
  'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  'bg-pink-500/10 text-pink-400 border border-pink-500/20',
  'bg-blue-500/10 text-blue-400 border border-blue-500/20',
];

function getCapabilityStyle(index) {
  return CAPABILITY_STYLES[index % CAPABILITY_STYLES.length];
}

export default function Agents() {
  const agents = useStore((s) => s.agents);
  const setAgents = useStore((s) => s.setAgents);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const events = useStore((s) => s.events);
  const updateAgentStatus = useStore((s) => s.updateAgentStatus);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchAgents().then((res) => setAgents(res.agents || [])).catch(() => {});
  }, [setAgents]);

  // Build lookup maps for detail panel
  const projectMap = useMemo(() => {
    const map = {};
    (projects || []).forEach((p) => { map[p.id] = p; });
    return map;
  }, [projects]);

  const taskMap = useMemo(() => {
    const map = {};
    (tasks || []).forEach((t) => { map[t.id] = t; });
    return map;
  }, [tasks]);

  const filtered = useMemo(() => {
    return (agents || []).filter((a) => {
      // Status filter
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      // Search filter
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (a.agentName || '').toLowerCase().includes(q) ||
        (a.agentId || '').toLowerCase().includes(q) ||
        (a.role || '').toLowerCase().includes(q) ||
        (a.platform || '').toLowerCase().includes(q) ||
        (a.capabilities || []).some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [agents, search, statusFilter]);

  const onlineCount = (agents || []).filter(
    (a) => a.status !== 'away' && a.status !== 'offline'
  ).length;

  // Get recent events for an agent (last 5)
  const getAgentEvents = (agentId) => {
    return (events || [])
      .filter((e) =>
        e.actorAgentId === agentId ||
        e.agentId === agentId ||
        e.agent?.agentId === agentId
      )
      .slice(0, 5);
  };

  // Resolve current project/task names
  const resolveProjectName = (projectId) => {
    if (!projectId) return null;
    return projectMap[projectId]?.name || projectId;
  };

  const resolveTaskName = (taskId) => {
    if (!taskId) return null;
    return taskMap[taskId]?.title || taskId;
  };

  const handleStatusChange = async (agentId, newStatus) => {
    try {
      // Call backend API to update agent status
      const res = await fetch('/api/chat/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, status: newStatus }),
      });
      if (res.ok) {
        updateAgentStatus(agentId, newStatus);
      }
    } catch (err) {
      // Fallback: update locally anyway for demo purposes
      updateAgentStatus(agentId, newStatus);
    }
  };

  const toggleExpand = (agentId) => {
    setExpandedId((prev) => (prev === agentId ? null : agentId));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-sm text-gray-400">
            <span className="text-white font-semibold">{agents.length}</span> 个 Agent
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <StatusDot status="idle" size="sm" />
            {onlineCount} 在线
          </div>
          {/* Status Filter Pills */}
          <div className="flex items-center gap-1 ml-2">
            {[
              { value: 'all', label: '全部' },
              ...STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-white/10 text-white border border-white/10'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="搜索 Agent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#1a1a2e] border border-white/5 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Agent Cards */}
      <div className="space-y-2">
        {filtered.map((agent) => {
          const isExpanded = expandedId === agent.agentId;
          const RoleIcon = ROLE_ICONS[agent.role] || Bot;
          const recentEvents = getAgentEvents(agent.agentId);
          const capabilities = agent.capabilities || [];
          const currentProjName = resolveProjectName(agent.currentProjectId);
          const currentTaskTitle = resolveTaskName(agent.currentTaskId);

          return (
            <div
              key={agent.agentId}
              className={`bg-[#1a1a2e] border rounded-xl transition-all duration-200 ${
                isExpanded
                  ? 'border-cyan-500/30 shadow-lg shadow-cyan-500/5'
                  : 'border-white/5 hover:border-white/10'
              }`}
            >
              {/* Main Card Row — always visible */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer select-none"
                onClick={() => toggleExpand(agent.agentId)}
              >
                {/* Avatar */}
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 relative"
                  style={{ backgroundColor: agent.color || '#6366f1' }}
                >
                  {(agent.agentName || agent.agentId).charAt(0).toUpperCase()}
                  {/* Pulse indicator for active agents */}
                  {(agent.status === 'working' || agent.status === 'idle') && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1a1a2e]"
                      style={{ backgroundColor: agent.status === 'working' ? '#f59e0b' : '#3fb950' }}
                    />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">
                      {agent.agentName || agent.agentId}
                    </span>
                    <StatusDot status={agent.status} size="sm" />
                    {/* Current activity hint */}
                    {agent.status === 'working' && currentTaskTitle && (
                      <span className="text-xs text-amber-400/80 truncate max-w-[180px]">
                        正在处理: {currentTaskTitle}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <RoleIcon className="w-3 h-3" />
                      {ROLE_LABELS[agent.role] || agent.role}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[11px] ${PLATFORM_STYLES[agent.platform] || PLATFORM_STYLES.unknown}`}>
                      {agent.platform}
                    </span>
                    {agent.model && (
                      <span className="text-gray-500">{agent.model}</span>
                    )}
                    {/* Capabilities preview (show first 3 as inline tags) */}
                    {capabilities.length > 0 && (
                      <span className="text-gray-500">
                        {capabilities.slice(0, 3).join(' · ')}
                        {capabilities.length > 3 && ` +${capabilities.length - 3}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats Row */}
                <div className="flex items-center gap-5 text-xs flex-shrink-0">
                  {agent.todayTasks != null && (
                    <div className="text-center hidden sm:block">
                      <div className="text-white font-medium tabular-nums">{agent.todayTasks}</div>
                      <div className="text-gray-500">今日</div>
                    </div>
                  )}
                  {agent.successRate != null && (
                    <div className="text-center hidden sm:block">
                      <div className="text-white font-medium tabular-nums">{agent.successRate}%</div>
                      <div className="text-gray-500">成功率</div>
                    </div>
                  )}

                  {/* Expand/Collapse toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(agent.agentId);
                    }}
                    className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors text-gray-500 hover:text-gray-300"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Detail Panel */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-4">
                  {/* Top row: Current assignment + Status switcher */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Current Assignment */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" /> 当前工作
                      </h4>
                      <div className="space-y-1.5">
                        {currentProjName ? (
                          <div className="flex items-center gap-2 text-sm">
                            <FolderKanban className="w-3.5 h-3.5 text-cyan-500" />
                            <span className="text-gray-300">{currentProjName}</span>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-600">未分配项目</div>
                        )}
                        {currentTaskTitle ? (
                          <div className="flex items-center gap-2 text-sm">
                            <ListChecks className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-gray-300">{currentTaskTitle}</span>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-600">无进行中的任务</div>
                        )}
                      </div>
                    </div>

                    {/* Status Switcher */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5" /> 状态切换
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(agent.agentId, opt.value);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                              agent.status === opt.value
                                ? 'ring-1 shadow-sm'
                                : 'hover:bg-white/[0.04]'
                            }`}
                            style={{
                              backgroundColor:
                                agent.status === opt.value
                                  ? `${opt.color}20`
                                  : 'transparent',
                              color: agent.status === opt.value ? opt.color : '#9ca3af',
                              borderColor:
                                agent.status === opt.value ? opt.color : 'transparent',
                              ringColor: opt.value === agent.status ? opt.color : undefined,
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Capabilities Tags */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" /> 能力标签
                      {capabilities.length > 0 && (
                        <span className="text-gray-600 normal-case tracking-normal">
                          ({capabilities.length})
                        </span>
                      )}
                    </h4>
                    {capabilities.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {capabilities.map((cap, i) => (
                          <span
                            key={cap}
                            className={`px-2 py-0.5 rounded-md text-xs ${getCapabilityStyle(i)}`}
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600 italic">暂无能力标签</div>
                    )}
                  </div>

                  {/* Recent Activity Timeline */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> 最近活动
                    </h4>
                    {recentEvents.length > 0 ? (
                      <div className="relative pl-4 border-l border-white/5 space-y-2.5">
                        {recentEvents.map((evt, i) => (
                          <div key={i} className="relative text-xs">
                            {/* Timeline dot */}
                            <span
                              className="absolute -left-[19px] top-1 w-2 h-2 rounded-full"
                              style={{
                                backgroundColor:
                                  i === 0 ? '#06b6d4' : '#374151',
                              }}
                            />
                            <div className="text-gray-400">
                              {formatEventType(evt.type || evt.eventType)}
                              {evt.task?.title && (
                                <span className="text-gray-300 ml-1">
                                  · {evt.task.title}
                                </span>
                              )}
                            </div>
                            <div className="text-gray-600 mt-0.5">
                              {formatEventTime(evt.timestamp)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600 italic">暂无活动记录</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <Bot className="w-14 h-14 mx-auto mb-3 opacity-25" />
            <p className="text-sm mb-1">
              {search || statusFilter !== 'all'
                ? '没有匹配的 Agent'
                : '暂无 Agent'}
            </p>
            {!search && statusFilter === 'all' && (
              <p className="text-xs text-gray-600">
                Agent 会通过 Socket.io 自动注册到监控系统中
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Helpers ---

const EVENT_TYPE_MAP = {
  'task:created': '创建了任务',
  'task:updated': '更新了任务',
  'task:progress': '更新了进度',
  'agent:join': '上线',
  'agent:leave': '下线',
  'agent:status': '切换状态',
  'message': '发送了消息',
  'event:new': '事件通知',
};

function formatEventType(type) {
  return EVENT_TYPE_MAP[type] || type || '未知事件';
}

function formatEventTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
