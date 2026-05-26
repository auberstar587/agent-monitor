import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { fetchTasks, createTask, updateTask } from '../api/tasks';
import { fetchProjects } from '../api/projects';
import { fetchAgents } from '../api/agents';
import StatusDot from '../components/StatusDot';
import { Plus, Search, LayoutGrid, List, Clock, AlertCircle } from 'lucide-react';

const COLUMNS = [
  { key: 'queued', label: '待处理', color: '#6b7280' },
  { key: 'running', label: '进行中', color: '#f59e0b' },
  { key: 'blocked', label: '已阻塞', color: '#ef4444' },
  { key: 'review', label: '待审核', color: '#8b5cf6' },
  { key: 'completed', label: '已完成', color: '#3fb950' },
  { key: 'failed', label: '失败', color: '#ef4444' },
];

const PRIORITY_STYLES = {
  urgent: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-gray-500/20 text-gray-400',
};

const TASK_TYPE_STYLES = {
  feature: 'bg-cyan-500/20 text-cyan-400',
  fix: 'bg-red-500/20 text-red-400',
  refactor: 'bg-violet-500/20 text-violet-400',
  docs: 'bg-blue-500/20 text-blue-400',
  research: 'bg-emerald-500/20 text-emerald-400',
  test: 'bg-yellow-500/20 text-yellow-400',
  chore: 'bg-gray-500/20 text-gray-400',
};

const TASK_TYPE_LABELS = {
  feature: '功能开发',
  fix: 'Bug 修复',
  refactor: '重构优化',
  docs: '文档编写',
  research: '调研分析',
  test: '测试相关',
  chore: '杂项工作',
};

export default function Tasks() {
  const tasks = useStore((s) => s.tasks);
  const setTasks = useStore((s) => s.setTasks);
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const agents = useStore((s) => s.agents);
  const setAgents = useStore((s) => s.setAgents);
  const [view, setView] = useState('kanban');
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', projectId: '',
    agentId: '', priority: 'medium', type: 'feature',
    dependencies: '', reviewerAgentId: '', expectedArtifacts: '',
  });

  useEffect(() => {
    fetchTasks().then((res) => setTasks(res.tasks || [])).catch(() => {});
    fetchProjects().then((res) => setProjects(res.projects || [])).catch(() => {});
    fetchAgents().then((res) => setAgents(res.agents || [])).catch(() => {});
  }, [setTasks, setProjects, setAgents]);

  const filtered = tasks.filter((t) => {
    if (filterProject && t.projectId !== filterProject) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        dependencies: form.dependencies ? form.dependencies.split(',').map((d) => d.trim()).filter(Boolean) : [],
        expectedArtifacts: form.expectedArtifacts ? form.expectedArtifacts.split(',').map((a) => a.trim()).filter(Boolean) : [],
      };
      // Clean empty strings
      Object.keys(payload).forEach((k) => { if (payload[k] === '' || (Array.isArray(payload[k]) && payload[k].length === 0)) delete payload[k]; });
      const res = await createTask(payload);
      setTasks([...tasks, res.task]);
      setShowCreate(false);
      setForm({ title: '', description: '', projectId: '', agentId: '', priority: 'medium', type: 'feature', dependencies: '', reviewerAgentId: '', expectedArtifacts: '' });
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await updateTask(taskId, { status: newStatus });
      setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const getProjectName = (projectId) => {
    const p = projects.find((p) => p.id === projectId);
    return p ? p.name : '';
  };

  const getAgentName = (agentId) => {
    if (!agentId) return '';
    const a = agents.find((a) => a.agentId === agentId);
    return a ? a.agentName || agentId : agentId;
  };

  // Status transition map for action buttons
  const getNextActions = (status) => {
    switch (status) {
      case 'queued': return [{ label: '开始', to: 'running', style: 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30' }];
      case 'running': return [
        { label: '完成', to: 'review', style: 'bg-violet-600/20 text-violet-400 hover:bg-violet-600/30' },
        { label: '阻塞', to: 'blocked', style: 'bg-red-600/20 text-red-400 hover:bg-red-600/30' },
        { label: '失败', to: 'failed', style: 'bg-orange-600/20 text-orange-400 hover:bg-orange-600/30' },
      ];
      case 'blocked': return [{ label: '恢复', to: 'running', style: 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30' }];
      case 'review': return [
        { label: '通过', to: 'completed', style: 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30' },
        { label: '打回', to: 'running', style: 'bg-orange-600/20 text-orange-400 hover:bg-orange-600/30' },
      ];
      case 'failed': return [{ label: '重试', to: 'queued', style: 'bg-gray-600/20 text-gray-400 hover:bg-gray-600/30' }];
      default: return [];
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="搜索任务..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#1a1a2e] border border-white/5 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-3 py-2 bg-[#1a1a2e] border border-white/5 rounded-lg text-sm text-gray-300 focus:outline-none"
          >
            <option value="">全部项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-[#1a1a2e] border border-white/5 rounded-lg text-sm text-gray-300 focus:outline-none"
          >
            <option value="">全部状态</option>
            {COLUMNS.map((col) => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[#1a1a2e] rounded-lg border border-white/5 p-0.5">
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === 'kanban' ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 inline mr-1" />
              看板
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === 'list' ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <List className="w-3.5 h-3.5 inline mr-1" />
              列表
            </button>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建任务
          </button>
        </div>
      </div>

      {/* Content */}
      {view === 'kanban' ? (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 min-h-[60vh]">
          {COLUMNS.map((col) => {
            const colTasks = filtered.filter((t) => {
              if (col.key === 'running') return t.status === 'running' || t.status === 'dispatched';
              return t.status === col.key;
            });
            return (
              <div key={col.key} className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">{col.label}</span>
                  <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">{colTasks.length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      projectName={getProjectName(task.projectId)}
                      onStatusChange={handleStatusChange}
                      actions={getNextActions(task.status)}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-[10px] text-gray-700 text-center py-4">暂无</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#1a1a2e] rounded-xl border border-white/5 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">任务</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">类型</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">项目</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Agent</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">优先级</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">状态</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-200">{task.title}</div>
                    {task.description && <div className="text-xs text-gray-500 truncate max-w-xs">{task.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {task.type && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${TASK_TYPE_STYLES[task.type] || 'bg-gray-500/20 text-gray-400'}`}>
                        {TASK_TYPE_LABELS[task.type] || task.type}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{getProjectName(task.projectId)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{getAgentName(task.agentId) || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusDot status={taskStatusToAgentStatus(task.status)} size="sm" />
                      <span className="text-xs text-gray-400">{task.status}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-white mb-5">新建任务</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">任务标题 *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">描述</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">项目</label>
                  <select
                    value={form.projectId}
                    onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none"
                  >
                    <option value="">选择项目</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">类型</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none"
                  >
                    {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">优先级</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none"
                  >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="urgent">紧急</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">指派 Agent</label>
                  <select
                    value={form.agentId}
                    onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none"
                  >
                    <option value="">未指定</option>
                    {agents.map((a) => <option key={a.agentId} value={a.agentId}>{a.agentName || a.agentId}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">依赖任务 ID</label>
                  <input
                    type="text"
                    value={form.dependencies}
                    onChange={(e) => setForm({ ...form, dependencies: e.target.value })}
                    placeholder="多个用逗号分隔"
                    className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">审核人 Agent ID</label>
                  <input
                    type="text"
                    value={form.reviewerAgentId}
                    onChange={(e) => setForm({ ...form, reviewerAgentId: e.target.value })}
                    placeholder="可选"
                    className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">预期产物</label>
                <input
                  type="text"
                  value={form.expectedArtifacts}
                  onChange={(e) => setForm({ ...form, expectedArtifacts: e.target.value })}
                  placeholder="如：PR、文档、测试报告，逗号分隔"
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 text-sm text-gray-400 border border-white/10 rounded-lg hover:bg-white/[0.04]">取消</button>
                <button type="submit" className="flex-1 px-4 py-2 text-sm text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg">创建</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, projectName, onStatusChange, actions }) {
  const [showActions, setShowActions] = useState(false);
  return (
    <div
      className="bg-[#16162a] border border-white/5 rounded-lg p-3 hover:border-white/10 transition-all duration-200 cursor-pointer"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm text-gray-200 leading-snug line-clamp-2">{task.title}</h4>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium}`}>
          {task.priority}
        </span>
      </div>
      {task.type && (
        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded mb-2 ${TASK_TYPE_STYLES[task.type] || 'bg-gray-500/20 text-gray-400'}`}>
          {TASK_TYPE_LABELS[task.type] || task.type}
        </span>
      )}
      {projectName && <p className="text-xs text-gray-500 mb-2">{projectName}</p>}
      {task.progress ? (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>{task.progress.summary || ''}</span>
            <span>{task.progress.step}/{task.progress.total}</span>
          </div>
          <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 rounded-full transition-all"
              style={{ width: `${(task.progress.step / Math.max(task.progress.total, 1)) * 100}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-600">{task.agentId || '未分配'}</span>
        {task.labels?.length > 0 && (
          <div className="flex gap-1">
            {task.labels.slice(0, 2).map((label) => (
              <span key={label} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-gray-500">{label}</span>
            ))}
          </div>
        )}
      </div>
      {showActions && actions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/5 flex gap-1 flex-wrap">
          {actions.map((action) => (
            <button
              key={action.to}
              onClick={() => onStatusChange(task.id, action.to)}
              className={`text-[10px] px-2 py-1 rounded ${action.style}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function taskStatusToAgentStatus(status) {
  const map = { running: 'working', completed: 'idle', failed: 'error', queued: 'away', dispatched: 'working', cancelled: 'away', blocked: 'error', review: 'meeting' };
  return map[status] || 'away';
}
