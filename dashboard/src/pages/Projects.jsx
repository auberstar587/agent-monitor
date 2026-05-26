import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { fetchProjects, createProject } from '../api/projects';
import StatusDot from '../components/StatusDot';
import {
  Plus, Search, FolderKanban, UserCheck, Tag, Archive,
  ExternalLink, Users
} from 'lucide-react';

const TYPE_STYLES = {
  chat: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/20' },
  tool: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  coding: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  research: { bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/20' },
  creative: { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/20' },
};

const TYPE_LABELS = {
  chat: '对话型',
  tool: '工具型',
  coding: '编程型',
  research: '调研型',
  creative: '创作型',
};

function getTypeStyle(type) {
  return TYPE_STYLES[type] || TYPE_STYLES.coding;
}

export default function Projects() {
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const addProject = useStore((s) => s.addProject);
  const agents = useStore((s) => s.agents);
  const tasks = useStore((s) => s.tasks);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '', path: '', agentId: '', type: 'coding', model: 'glm-4',
    managerAgentId: '', goals: '', tags: '', repo: ''
  });
  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects().then((res) => setProjects(res.projects || [])).catch(() => {});
  }, [setProjects]);

  // Build agent lookup map for participant avatars
  const agentMap = {};
  (agents || []).forEach((a) => { agentMap[a.agentId] = a; });

  // Compute task counts per project
  const taskCounts = {};
  (tasks || []).forEach((t) => {
    if (!taskCounts[t.projectId]) taskCounts[t.projectId] = { total: 0, done: 0, blocked: 0 };
    taskCounts[t.projectId].total++;
    if (t.status === 'completed') taskCounts[t.projectId].done++;
    if (t.status === 'blocked') taskCounts[t.projectId].blocked++;
  });

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.path?.toLowerCase().includes(search.toLowerCase()) ||
    (p.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await createProject({
        ...form,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        goals: form.goals ? form.goals.split('\n').filter(Boolean) : [],
      });
      addProject(res.project);
      setShowCreate(false);
      setForm({
        name: '', path: '', agentId: '', type: 'coding', model: 'glm-4',
        managerAgentId: '', goals: '', tags: '', repo: ''
      });
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="搜索项目..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#1a1a2e] border border-white/5 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <span className="text-xs text-gray-500">
            {projects.length} 个项目
          </span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建项目
        </button>
      </div>

      {/* Project Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((project) => {
          const style = getTypeStyle(project.type);
          const counts = taskCounts[project.id] || { total: 0, done: 0, blocked: 0 };
          const isArchived = project.status === 'archived';
          const pmAgent = project.managerAgentId ? agentMap[project.managerAgentId] : null;
          // Collect participants: PM + assigned agent + agentIds list
          const participantIds = new Set();
          if (project.managerAgentId) participantIds.add(project.managerAgentId);
          if (project.agentId) participantIds.add(project.agentId);
          (project.agentIds || []).forEach((aid) => participantIds.add(aid));
          const participants = Array.from(participantIds)
            .map((id) => agentMap[id])
            .filter(Boolean);

          return (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className={`bg-[#1a1a2e] rounded-xl p-5 hover:border-white/10 cursor-pointer transition-all duration-200 border ${
                isArchived ? 'border-white/[0.03] opacity-60' : 'border-white/5'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <StatusDot status={isArchived ? 'away' : project.status === 'active' ? 'idle' : 'away'} size="sm" />
                  <h3 className={`text-sm font-semibold truncate ${isArchived ? 'text-gray-400' : 'text-white'}`}>
                    {project.name}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                    {TYPE_LABELS[project.type] || project.type}
                  </span>
                  {isArchived && (
                    <Archive className="w-3.5 h-3.5 text-gray-500" title="已归档" />
                  )}
                </div>
              </div>

              {/* Path */}
              <p className="text-xs text-gray-500 truncate mb-3">{project.path || '未设置路径'}</p>

              {/* PM Agent + Model Row */}
              <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                {pmAgent ? (
                  <span className="flex items-center gap-1 text-cyan-400/80">
                    <UserCheck className="w-3.5 h-3.5" />
                    PM: {pmAgent.agentName || pmAgent.agentId}
                  </span>
                ) : (
                  <span className="text-gray-600">未指定 PM</span>
                )}
                {project.model && <span>· {project.model}</span>}
                {project.repo && (
                  <ExternalLink className="w-3 h-3 text-gray-500" title={project.repo} />
                )}
              </div>

              {/* Tags */}
              {(project.tags && project.tags.length > 0) && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {project.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 rounded text-[11px] bg-white/[0.04] text-gray-400 border border-white/[0.06]">
                      {tag}
                    </span>
                  ))}
                  {project.tags.length > 4 && (
                    <span className="px-1.5 py-0.5 rounded text-[11px] text-gray-600">
                      +{project.tags.length - 4}
                    </span>
                  )}
                </div>
              )}

              {/* Footer: Task progress + Participants */}
              <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                {/* Task progress */}
                <div className="text-xs text-gray-500">
                  {counts.total > 0 ? (
                    <span>
                      <span className="text-emerald-400">{counts.done}</span>
                      <span className="text-gray-600">/{counts.total} 完成</span>
                      {counts.blocked > 0 && (
                        <span className="text-red-400 ml-2">· {counts.blocked} 阻塞</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-gray-600">暂无任务</span>
                  )}
                </div>

                {/* Participant Avatars */}
                {participants.length > 0 && (
                  <div className="flex items-center -space-x-1.5">
                    {participants.slice(0, 4).map((p) => (
                      <div
                        key={p.agentId}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-[#1a1a2e]"
                        style={{ backgroundColor: p.color || '#6366f1' }}
                        title={`${p.agentName || p.agentId} (${ROLE_LABELS[p.role] || p.role})`}
                      >
                        {(p.agentName || p.agentId).charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {participants.length > 4 && (
                      <span className="w-6 h-6 rounded-md bg-white/[0.06] flex items-center justify-center text-[10px] text-gray-400 ring-2 ring-[#1a1a2e]">
                        +{participants.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-gray-500">
            <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{search ? '没有匹配的项目' : '还没有项目，点击新建开始'}</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateModal
          form={form}
          setForm={setForm}
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
          agents={agents}
        />
      )}
    </div>
  );
}

// --- Create Modal Component ---
function CreateModal({ form, setForm, onSubmit, onClose, agents }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">新建项目</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/[0.06] transition-colors text-gray-500"
          >
            <span className="sr-only">关闭</span>
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">项目名称 *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          {/* Path + Repo row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">项目路径</label>
              <input
                type="text"
                value={form.path}
                onChange={(e) => setForm({ ...form, path: e.target.value })}
                placeholder="~/projects/my-project"
                className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">仓库地址</label>
              <input
                type="text"
                value={form.repo}
                onChange={(e) => setForm({ ...form, repo: e.target.value })}
                placeholder="https://github.com/..."
                className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>
          {/* Type + Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">类型</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none"
              >
                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">模型</label>
              <select
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none"
              >
                <option value="glm-4">GLM-4</option>
                <option value="gpt-4">GPT-4</option>
                <option value="deepseek">DeepSeek</option>
                <option value="qwen2.5">Qwen2.5</option>
                <option value="MiniMax-M2.7">MiniMax-M2.7</option>
              </select>
            </div>
          </div>
          {/* Agent ID + PM Agent ID */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">主 Agent ID</label>
              <input
                type="text"
                value={form.agentId}
                onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                placeholder="nox"
                className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">PM Agent ID</label>
              <input
                type="text"
                value={form.managerAgentId}
                onChange={(e) => setForm({ ...form, managerAgentId: e.target.value })}
                placeholder="nox-pm"
                className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>
          {/* Goals */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">目标（每行一个）</label>
            <textarea
              value={form.goals}
              onChange={(e) => setForm({ ...form, goals: e.target.value })}
              placeholder={'完成核心功能开发\n编写单元测试\n部署上线'}
              rows={3}
              className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50 resize-none"
            />
          </div>
          {/* Tags */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">标签（逗号分隔）</label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="frontend, urgent, sprint-1"
              className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm text-gray-400 border border-white/10 rounded-lg hover:bg-white/[0.04] transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 text-sm text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors"
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
