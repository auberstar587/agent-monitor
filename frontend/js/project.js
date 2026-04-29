/**
 * 项目管理页面逻辑
 */

const API_BASE = '';

const state = {
    projects: [],
    filteredProjects: [],
    agents: [],
    currentEditId: null,
    deleteTargetId: null
};

const typeOptions = [
    { value: 'chat', label: '对话型' },
    { value: 'tool', label: '工具型' },
    { value: 'coding', label: '编程型' },
    { value: 'research', label: '调研型' },
    { value: 'creative', label: '创作型' }
];

const modelOptions = [
    { value: 'qwen2.5', label: 'qwen2.5' },
    { value: 'deepseek', label: 'deepseek' },
    { value: 'gpt-4', label: 'gpt-4' },
    { value: 'glm-4', label: 'glm-4' },
    { value: 'glm-5.1', label: 'glm-5.1' },
    { value: 'MiniMax-M2.7', label: 'MiniMax-M2.7' },
    { value: 'GLM-4.7-Flash', label: 'GLM-4.7-Flash' }
];

// === API 请求 ===
async function fetchAgents() {
    try {
        const res = await fetch(`${API_BASE}/api/config/agents`);
        const data = await res.json();
        return data.agents || [];
    } catch (err) {
        console.error('Failed to fetch agents:', err);
        return [];
    }
}

async function loadProjects() {
    try {
        const res = await fetch(`${API_BASE}/api/projects`);
        const data = await res.json();
        if (data.projects) {
            return data.projects;
        }
        return [];
    } catch (err) {
        console.error('Failed to fetch projects:', err);
        return [];
    }
}

async function createProject(data) {
    try {
        const res = await fetch(`${API_BASE}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success && result.project) {
            state.projects.push(result.project);
            filterProjects();
            renderStats();
            return result.project;
        }
        throw new Error('Failed to create project');
    } catch (err) {
        console.error('Failed to create project:', err);
        alert('创建项目失败: ' + err.message);
    }
}

async function updateProject(id, data) {
    try {
        const res = await fetch(`${API_BASE}/api/projects/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success && result.project) {
            const index = state.projects.findIndex(p => p.id === id);
            if (index !== -1) {
                state.projects[index] = result.project;
            }
            filterProjects();
            renderStats();
            return result.project;
        }
        throw new Error('Failed to update project');
    } catch (err) {
        console.error('Failed to update project:', err);
        alert('更新项目失败: ' + err.message);
    }
}

async function deleteProject(id) {
    try {
        const res = await fetch(`${API_BASE}/api/projects/${id}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.success) {
            state.projects = state.projects.filter(p => p.id !== id);
            filterProjects();
            renderStats();
            return true;
        }
        throw new Error('Failed to delete project');
    } catch (err) {
        console.error('Failed to delete project:', err);
        alert('删除项目失败: ' + err.message);
    }
}

async function importProjects() {
    try {
        const res = await fetch(`${API_BASE}/api/projects/import`, {
            method: 'POST'
        });
        const result = await res.json();
        if (result.success) {
            // Reload projects after import
            state.projects = await loadProjects();
            filterProjects();
            renderStats();
            return true;
        }
        throw new Error('Import failed');
    } catch (err) {
        console.error('Failed to import projects:', err);
        alert('扫描导入失败: ' + err.message);
    }
}

async function loadProjectStats(id) {
    try {
        const res = await fetch(`${API_BASE}/api/projects/${id}/stats`);
        if (!res.ok) throw new Error('Failed to fetch stats');
        return await res.json();
    } catch (err) {
        console.error('Failed to fetch project stats:', err);
        // Return empty stats on error (per requirements)
        return {
            todayTasks: 0,
            successRate: null,
            cpuUsage: null,
            memoryUsage: null
        };
    }
}

// === 工具函数 ===
function getTypeLabel(value) {
    const type = typeOptions.find(t => t.value === value);
    return type ? type.label : value;
}

function getModelLabel(value) {
    const model = modelOptions.find(m => m.value === value);
    return model ? model.label : value;
}

function getAgentName(agentId, agents) {
    const agent = agents.find(a => a.agentId === agentId);
    return agent ? (agent.agentName || agent.name || agentId) : agentId;
}

function getAgentStatus(agentId, agents) {
    const agent = agents.find(a => a.agentId === agentId);
    return agent ? agent.status : 'away';
}

function getProjectStatus(project) {
    const agentStatus = getAgentStatus(project.agentId, state.agents);
    return ['idle', 'working', 'meeting'].includes(agentStatus) ? 'active' : 'inactive';
}

function formatStatValue(value, type) {
    if (value === null || value === undefined) {
        return '—';
    }
    if (type === 'rate') {
        return value + '%';
    }
    return value;
}

// === 渲染函数 ===
function renderStats() {
    const total = state.projects.length;
    const active = state.projects.filter(p => getProjectStatus(p) === 'active').length;
    const inactive = total - active;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-inactive').textContent = inactive;
}

function renderProjectGrid() {
    const grid = document.getElementById('project-grid');
    const emptyState = document.getElementById('empty-state');

    if (state.filteredProjects.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';
    grid.innerHTML = '';

    state.filteredProjects.forEach(project => {
        const status = getProjectStatus(project);
        const tasks = project.todayTasks !== undefined ? project.todayTasks : 0;
        const success = project.successRate !== undefined ? project.successRate : null;
        const cpu = project.cpuUsage !== undefined ? project.cpuUsage : null;
        const memory = project.memoryUsage !== undefined ? project.memoryUsage : null;
        const agentName = getAgentName(project.agentId, state.agents);

        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `
            <div class="project-header">
                <div>
                    <div class="project-title">${project.name}</div>
                    <div class="project-path">${project.path || '未设置路径'}</div>
                </div>
                <span class="project-status ${status}">
                    ${status === 'active' ? '● 运行中' : '○ 已停止'}
                </span>
            </div>
            <div class="project-meta">
                <div class="meta-item">
                    <span class="meta-label">Agent</span>
                    <span class="meta-value">${agentName}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">类型</span>
                    <span class="meta-value">${getTypeLabel(project.type)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">模型</span>
                    <span class="meta-value">${getModelLabel(project.model)}</span>
                </div>
            </div>
            <div class="project-stats">
                <div class="stat-item">
                    <div class="stat-value">${tasks}</div>
                    <div class="stat-label">今日任务</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${formatStatValue(success, 'rate')}</div>
                    <div class="stat-label">成功率</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${formatStatValue(cpu, 'percent')}</div>
                    <div class="stat-label">CPU</div>
                </div>
            </div>
            <div class="project-actions">
                <button class="btn btn-secondary" onclick="viewProject('${project.id}')">查看详情</button>
                <button class="btn btn-secondary" onclick="editProject('${project.id}')">编辑</button>
                <button class="btn btn-danger" onclick="confirmDelete('${project.id}')">删除</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderAgentOptions() {
    const select = document.getElementById('project-agent');
    select.innerHTML = '<option value="">-- 选择 Agent --</option>';

    state.agents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent.agentId;
        option.textContent = agent.name || agent.agentId;
        select.appendChild(option);
    });
}

// === 筛选 ===
function filterProjects() {
    const searchQuery = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('status-filter').value;
    const typeFilter = document.getElementById('type-filter').value;

    state.filteredProjects = state.projects.filter(project => {
        // 搜索过滤
        if (searchQuery) {
            const matchName = project.name.toLowerCase().includes(searchQuery);
            const matchPath = (project.path || '').toLowerCase().includes(searchQuery);
            if (!matchName && !matchPath) return false;
        }

        // 状态过滤
        if (statusFilter !== 'all') {
            const status = getProjectStatus(project);
            if (status !== statusFilter) return false;
        }

        // 类型过滤
        if (typeFilter !== 'all') {
            if (project.type !== typeFilter) return false;
        }

        return true;
    });

    renderProjectGrid();
}

// === 弹窗操作 ===
function openProjectModal(editId = null) {
    state.currentEditId = editId;
    const modal = document.getElementById('project-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('project-form');

    if (editId) {
        const project = state.projects.find(p => p.id === editId);
        if (project) {
            title.textContent = '编辑项目';
            document.getElementById('project-id').value = project.id;
            document.getElementById('project-name').value = project.name;
            document.getElementById('project-path').value = project.path || '';
            document.getElementById('project-agent').value = project.agentId || '';
            document.getElementById('project-type').value = project.type || 'chat';
            document.getElementById('project-model').value = project.model || 'qwen2.5';
        }
    } else {
        title.textContent = '新建项目';
        form.reset();
        document.getElementById('project-id').value = '';
    }

    modal.classList.add('active');
}

function closeProjectModal() {
    document.getElementById('project-modal').classList.remove('active');
    state.currentEditId = null;
}

async function viewProject(id) {
    const project = state.projects.find(p => p.id === id);
    if (!project) return;

    const stats = await loadProjectStats(id);
    const status = getProjectStatus(project);
    const agentName = getAgentName(project.agentId, state.agents);
    const agentStatus = getAgentStatus(project.agentId, state.agents);

    document.getElementById('detail-title').textContent = project.name;
    document.getElementById('detail-body').innerHTML = `
        <div class="detail-card">
            <div class="detail-row">
                <span class="detail-label">项目 ID</span>
                <span class="detail-value">${project.id}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">项目名称</span>
                <span class="detail-value">${project.name}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">项目路径</span>
                <span class="detail-value">${project.path || '未设置'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">关联 Agent</span>
                <span class="detail-value">
                    ${agentName}
                    <span class="status-badge ${agentStatus}" style="margin-left: 8px;">
                        ${agentStatus === 'idle' ? '空闲' : agentStatus === 'working' ? '工作中' : agentStatus === 'meeting' ? '会议中' : '离线'}
                    </span>
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">项目类型</span>
                <span class="detail-value">${getTypeLabel(project.type)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">使用模型</span>
                <span class="detail-value">${getModelLabel(project.model)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">状态</span>
                <span class="detail-value">
                    <span class="project-status ${status}">
                        ${status === 'active' ? '● 运行中' : '○ 已停止'}
                    </span>
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">创建时间</span>
                <span class="detail-value">${new Date(project.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">更新时间</span>
                <span class="detail-value">${new Date(project.updatedAt).toLocaleString('zh-CN')}</span>
            </div>
        </div>

        <div class="detail-stats">
            <div class="detail-stat">
                <div class="detail-stat-value">${stats.todayTasks}</div>
                <div class="detail-stat-label">今日任务</div>
            </div>
            <div class="detail-stat">
                <div class="detail-stat-value">${formatStatValue(stats.successRate, 'rate')}</div>
                <div class="detail-stat-label">成功率</div>
            </div>
            <div class="detail-stat">
                <div class="detail-stat-value">${formatStatValue(stats.cpuUsage, 'percent')}</div>
                <div class="detail-stat-label">CPU 使用</div>
            </div>
            <div class="detail-stat">
                <div class="detail-stat-value">${formatStatValue(stats.memoryUsage, 'percent')}</div>
                <div class="detail-stat-label">内存使用</div>
            </div>
        </div>

        <div class="form-actions">
            <button class="btn btn-secondary" onclick="closeDetailModal()">关闭</button>
            <button class="btn btn-primary" onclick="editProjectFromDetail('${project.id}')">编辑项目</button>
        </div>
    `;

    document.getElementById('detail-modal').classList.add('active');
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.remove('active');
}

function editProject(id) {
    closeDetailModal();
    openProjectModal(id);
}

function editProjectFromDetail(id) {
    closeDetailModal();
    openProjectModal(id);
}

function confirmDelete(id) {
    const project = state.projects.find(p => p.id === id);
    if (!project) return;

    state.deleteTargetId = id;
    document.getElementById('delete-project-name').textContent = project.name;
    document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('active');
    state.deleteTargetId = null;
}

function executeDelete() {
    if (state.deleteTargetId) {
        deleteProject(state.deleteTargetId);
        closeDeleteModal();
    }
}

// === 事件绑定 ===
function bindEvents() {
    // 搜索和筛选
    document.getElementById('search-input').addEventListener('input', filterProjects);
    document.getElementById('status-filter').addEventListener('change', filterProjects);
    document.getElementById('type-filter').addEventListener('change', filterProjects);

    // 扫描导入
    document.getElementById('btn-import').addEventListener('click', () => {
        if (confirm('扫描 ~/AI/ 目录导入项目？已存在的项目将被跳过。')) {
            importProjects();
        }
    });

    // 新建项目
    document.getElementById('btn-add').addEventListener('click', () => openProjectModal());

    // 项目表单
    document.getElementById('project-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('project-name').value,
            path: document.getElementById('project-path').value,
            agentId: document.getElementById('project-agent').value,
            type: document.getElementById('project-type').value,
            model: document.getElementById('project-model').value
        };

        if (!data.name) {
            alert('请输入项目名称');
            return;
        }

        if (state.currentEditId) {
            updateProject(state.currentEditId, data);
        } else {
            createProject(data);
        }

        closeProjectModal();
    });

    // 取消按钮
    document.getElementById('btn-cancel').addEventListener('click', closeProjectModal);

    // 弹窗关闭
    document.getElementById('modal-close').addEventListener('click', closeProjectModal);
    document.querySelector('#project-modal .modal-backdrop').addEventListener('click', closeProjectModal);

    document.getElementById('detail-close').addEventListener('click', closeDetailModal);
    document.querySelector('#detail-modal .modal-backdrop').addEventListener('click', closeDetailModal);

    document.getElementById('delete-close').addEventListener('click', closeDeleteModal);
    document.getElementById('btn-delete-cancel').addEventListener('click', closeDeleteModal);
    document.getElementById('btn-delete-confirm').addEventListener('click', executeDelete);
    document.querySelector('#delete-modal .modal-backdrop').addEventListener('click', closeDeleteModal);

    // ESC 关闭弹窗
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeProjectModal();
            closeDetailModal();
            closeDeleteModal();
        }
    });
}

// === 初始化 ===
async function init() {
    state.projects = await loadProjects();
    state.agents = await fetchAgents();

    bindEvents();
    renderAgentOptions();
    filterProjects();
    renderStats();

    console.log('Project page initialized ✓');
}

document.addEventListener('DOMContentLoaded', init);
