/**
 * Agent 管理页面逻辑
 */

const API_BASE = '';
const PAGE_SIZE = 10;

const state = {
    agents: [],
    filteredAgents: [],
    currentPage: 1,
    searchQuery: '',
    statusFilter: 'all',
    systemStats: null,
    startupTime: null
};

const statusLabels = {
    idle: '空闲',
    working: '工作中',
    meeting: '会议中',
    speaking: '发言中',
    away: '离线',
    offline: '离线'
};

// === API 请求（来源: /api/config/agents = agents.json 静态配置 + ChatRoom 实时状态）===
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

// === 已删除 fetchStats（ChatRoom stats 不需要了）===

async function fetchSystemStats() {
    try {
        const res = await fetch(`${API_BASE}/api/system/stats`);
        return await res.json();
    } catch (err) {
        console.error('Failed to fetch system stats:', err);
        return null;
    }
}

async function fetchSystemInfo() {
    try {
        const res = await fetch(`${API_BASE}/api/health`);
        const data = await res.json();
        return data;
    } catch (err) {
        return null;
    }
}

// === 工具函数 ===
function getStatusClass(status) {
    return status || 'offline';
}

function getStatusLabel(status) {
    return statusLabels[status] || statusLabels.offline;
}

function getAgentIcon(agentId) {
    const icons = {
        'main': '🤖',
        'QQ': '🤖',
        'xiaoz-zi': '📰',
        'wenwen': '🎨',
        'xiaoma': '🐴',
        'zhuren': '👔',
        'research-expert': '🔍',
        'claudecode': '⚡'
    };
    return icons[agentId] || '🤖';
}

function getAgentColor(agentId) {
    const colors = {
        'main': '#3b82f6',
        'QQ': '#3b82f6',
        'xiaoz-zi': '#10b981',
        'wenwen': '#8b5cf6',
        'xiaoma': '#f59e0b',
        'zhuren': '#ef4444',
        'research-expert': '#06b6d4',
        'claudecode': '#f97316'
    };
    return colors[agentId] || '#6b7280';
}

function getAgentModel(agent) {
    return agent.model || '—';
}

function getAgentFallbacks(agent) {
    return agent.fallbacks || [];
}

function getAgentSkills(agent) {
    return agent.skills || [];
}

// === 渲染函数 ===
function renderKPICards(agents) {
    const total = agents.length;
    const defaultCount = agents.filter(a => a.default).length;
    const withSkillsCount = agents.filter(a => a.skills && a.skills.length > 0).length;
    const withoutSkillsCount = total - withSkillsCount;

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-running').textContent = defaultCount;
    document.getElementById('kpi-idle').textContent = withSkillsCount;
    document.getElementById('kpi-away').textContent = withoutSkillsCount;
}

function renderAgentTable(agents) {
    const tbody = document.getElementById('agent-tbody');
    tbody.innerHTML = '';

    const start = (state.currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageAgents = agents.slice(start, end);

    if (pageAgents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
                    暂无 Agent 数据
                </td>
            </tr>
        `;
        return;
    }

    pageAgents.forEach(agent => {
        const color = getAgentColor(agent.agentId);
        const icon = getAgentIcon(agent.agentId);
        const model = getAgentModel(agent);
        const fallbacks = getAgentFallbacks(agent);
        const skills = getAgentSkills(agent);
        const skillCount = skills.length;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="agent-name-cell">
                    <div class="agent-avatar" style="background: ${color}22; color: ${color}">
                        ${icon}
                    </div>
                    <div>
                        <div class="agent-name">${agent.name || agent.agentId}</div>
                        <div class="agent-id">${agent.agentId}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="status-badge ${getStatusClass(agent.status)}">
                    <span>●</span>
                    ${getStatusLabel(agent.status)}
                </span>
            </td>
            <td>${model}</td>
            <td>${fallbacks.length > 0 ? fallbacks.join(', ') : '—'}</td>
            <td>${skillCount > 0 ? skillCount + ' 个' : '—'}</td>
            <td>${agent.default ? '<span style="color:#f59e0b">默认</span>' : '—'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-icon" title="查看详情" onclick="showAgentDetail('${agent.agentId}')">👁️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    updatePagination(agents.length);
}

function updatePagination(total) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const start = (state.currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(state.currentPage * PAGE_SIZE, total);

    document.getElementById('pagination-info').textContent = 
        total > 0 ? `显示 ${start}-${end} 共 ${total} 条` : '无数据';

    document.getElementById('btn-prev').disabled = state.currentPage <= 1;
    document.getElementById('btn-next').disabled = state.currentPage >= totalPages;
}

async function renderSystemResources() {
    const stats = await fetchSystemStats();

    if (stats) {
        // 操作系统从后端 API 获取
        document.getElementById('sys-os').textContent = stats.os || stats.platform || '—';

        document.getElementById('cpu-value').textContent = `${stats.cpu.usagePercent}%`;
        document.getElementById('cpu-bar').style.width = `${stats.cpu.usagePercent}%`;

        document.getElementById('memory-value').textContent = `${stats.memory.usagePercent}%`;
        document.getElementById('memory-bar').style.width = `${stats.memory.usagePercent}%`;

        document.getElementById('disk-value').textContent = `${stats.disk.usagePercent}%`;
        document.getElementById('disk-bar').style.width = `${stats.disk.usagePercent}%`;
    }
}

function updateUptime() {
    if (!state.startupTime) return;

    const elapsed = Date.now() - state.startupTime;
    const seconds = Math.floor(elapsed / 1000) % 60;
    const minutes = Math.floor(elapsed / 60000) % 60;
    const hours = Math.floor(elapsed / 3600000);

    document.getElementById('sys-uptime').textContent =
        `${hours}小时 ${minutes}分 ${seconds}秒`;
}

function renderSystemInfo() {
    document.getElementById('sys-version').textContent = 'v1.0.0';
    if (state.startupTime) {
        document.getElementById('sys-startup').textContent =
            new Date(state.startupTime).toLocaleString('zh-CN');
        updateUptime();
        setInterval(updateUptime, 1000);
    }
}

function renderConnectionStatus(connected) {
    const indicator = document.querySelector('.status-indicator');
    const text = document.querySelector('.status-text');

    if (connected) {
        indicator.classList.add('online');
        indicator.classList.remove('offline');
        text.textContent = '系统正常';
    } else {
        indicator.classList.remove('online');
        indicator.classList.add('offline');
        text.textContent = '连接断开';
    }
}

// === 弹窗 ===
function showAgentDetail(agentId) {
    const agent = state.agents.find(a => a.agentId === agentId);
    if (!agent) return;

    const fallbacks = getAgentFallbacks(agent);
    const skills = getAgentSkills(agent);

    document.getElementById('modal-title').textContent = agent.name || agentId;
    document.getElementById('modal-body').innerHTML = `
        <div class="detail-card">
            <div class="detail-row">
                <span class="detail-label">Agent ID</span>
                <span class="detail-value">${agent.agentId}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">名称</span>
                <span class="detail-value">${agent.name || '—'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">默认</span>
                <span class="detail-value">${agent.default ? '是' : '否'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">工作区</span>
                <span class="detail-value">${agent.workspace || '—'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">主模型</span>
                <span class="detail-value">${agent.model || '—'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Fallback</span>
                <span class="detail-value">${fallbacks.length > 0 ? fallbacks.join(' → ') : '—'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Skills</span>
                <span class="detail-value">${skills.length > 0 ? skills.join(', ') : '—'}</span>
            </div>
        </div>
    `;

    document.getElementById('agent-modal').classList.add('active');
}

function editAgent(agentId) {
    // TODO: 实现编辑功能
    console.log('Edit agent:', agentId);
    alert('编辑功能开发中...');
}

function closeModal() {
    document.getElementById('agent-modal').classList.remove('active');
}

// === 筛选和搜索 ===
function filterAgents() {
    let filtered = [...state.agents];

    // 搜索过滤
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        filtered = filtered.filter(a => 
            (a.agentId && a.agentId.toLowerCase().includes(query)) ||
            (a.agentName && a.agentName.toLowerCase().includes(query)) ||
            (a.role && a.role.toLowerCase().includes(query))
        );
    }

    // 状态过滤（兼容 'offline' 和 'away' 两种值）
    if (state.statusFilter !== 'all') {
        const filterStatus = state.statusFilter;
        filtered = filtered.filter(a => {
            const s = a.status === 'offline' ? 'away' : a.status;
            return s === filterStatus || a.status === filterStatus;
        });
    }

    state.filteredAgents = filtered;
    state.currentPage = 1;
    renderAgentTable(filtered);
}

// === 事件绑定 ===
function bindEvents() {
    // 搜索
    document.getElementById('search-input').addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        filterAgents();
    });

    // 状态筛选
    document.getElementById('status-filter').addEventListener('change', (e) => {
        state.statusFilter = e.target.value;
        filterAgents();
    });

    // 刷新按钮
    document.getElementById('btn-refresh').addEventListener('click', loadData);

    // 分页
    document.getElementById('btn-prev').addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            renderAgentTable(state.filteredAgents);
        }
    });

    document.getElementById('btn-next').addEventListener('click', () => {
        const totalPages = Math.ceil(state.filteredAgents.length / PAGE_SIZE);
        if (state.currentPage < totalPages) {
            state.currentPage++;
            renderAgentTable(state.filteredAgents);
        }
    });

    // 弹窗
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.querySelector('.modal-backdrop').addEventListener('click', closeModal);

    // ESC 关闭弹窗
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// === 数据加载 ===
async function loadData() {
    const [agents, health] = await Promise.all([
        fetchAgents(),
        fetchSystemInfo()
    ]);

    state.agents = agents;
    state.filteredAgents = agents;

    if (health && health.timestamp) {
        state.startupTime = health.timestamp;
    }

    renderKPICards(agents);
    renderAgentTable(agents);  // 修复：表格没有渲染
    renderSystemInfo();
    await renderSystemResources();

    // 定时刷新系统资源（每30秒，与总览页一致）
    setInterval(renderSystemResources, 30000);
}

// === 初始化 ===
async function init() {
    bindEvents();
    await loadData();
    renderConnectionStatus(true);
    console.log('Agent page initialized ✓');
}

document.addEventListener('DOMContentLoaded', init);
