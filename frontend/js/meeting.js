/**
 * Agent Meeting - 开会可视化
 * 
 * 功能：
 * 1. 角色圆形排列布局
 * 2. 气泡显示和动画
 * 3. 聊天消息管理
 * 4. 计时器
 * 5. Socket.io 实时连接（可选）
 */

// === 配置 ===
const CONFIG = {
    // 角色定义（从 /api/chat/agents 动态加载，demo 为兜底）
    roles: [],  // 由 loadAgents() 填充

    // 气泡配置
    bubble: {
        maxVisible: 5,          // 同时显示的气泡数
        maxHistory: 200,       // 历史消息数
        autoHideDelay: 10000,   // 自动隐藏延迟（毫秒）
        positionRadius: 200,    // 气泡围绕中心的半径
    },

    // Demo 模式（无在线 Agent 时兜底）
    demo: {
        enabled: true,          // 默认 true，等待 loadAgents() 覆盖
        messageInterval: 5000,  // 模拟消息间隔（毫秒）
    }
};

// === 状态 ===
const state = {
    meetingStartTime: null,
    timerInterval: null,
    messages: [],
    activeBubbles: [],
    currentFilter: 'all',
    participants: [],
    meetingTopic: '新产品"智能知识助手"方案讨论',
    meetingGoal: '目标：确定 MVP 版本范围'
};

// === 角色加载（从 ChatRoom API） ===

const AGENT_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#84cc16'];

// Demo 模式兜底角色（ChatRoom 无 Agent 时使用）
const DEMO_ROLES = [
    { id: 'orchestrator', name: '主持', color: '#3b82f6', icon: '🎯' },
    { id: 'product', name: '产品', color: '#22c55e', icon: '📦' },
    { id: 'tech', name: '技术', color: '#a855f7', icon: '🔧' },
    { id: 'data', name: '数据', color: '#f59e0b', icon: '📊' },
    { id: 'ux', name: '体验', color: '#ec4899', icon: '✨' }
];

async function loadAgents() {
    try {
        const res = await fetch('/api/chat/agents');
        const data = await res.json();
        const agents = data.agents || [];

        if (agents.length > 0) {
            CONFIG.roles = agents.map((a, i) => ({
                id: a.agentId,
                name: a.name || a.agentId,
                color: a.color || AGENT_COLORS[i % AGENT_COLORS.length],
                icon: '🤖'
            }));
            CONFIG.demo.enabled = false;  // 有真实 Agent，关闭 demo
        } else {
            // 无在线 Agent，使用 demo 角色
            CONFIG.roles = DEMO_ROLES;
            CONFIG.demo.enabled = true;
        }
    } catch (err) {
        console.warn('[Meeting] 加载 Agent 失败，使用 Demo 模式:', err.message);
        CONFIG.roles = DEMO_ROLES;
        CONFIG.demo.enabled = true;
    }
}

// === 工具函数 ===

/**
 * 生成唯一 ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 格式化时间
 */
function formatTime(date) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * 获取当前时间戳
 */
function getCurrentTime() {
    return formatTime(new Date());
}

// === 角色布局 ===

/**
 * 计算角色在圆形上的位置
 */
function calculateCharacterPositions(containerWidth, containerHeight) {
    const centerX = containerWidth / 2;
    const centerY = containerHeight * 0.85; // 靠近底部
    const radiusX = containerWidth * 0.35; // 椭圆横半轴
    const radiusY = containerHeight * 0.3; // 椭圆纵半轴
    const count = CONFIG.roles.length;
    const positions = [];

    for (let i = 0; i < count; i++) {
        const angle = Math.PI + (i / count) * Math.PI; // 从左下开始逆时针
        positions.push({
            x: centerX + radiusX * Math.cos(angle),
            y: centerY + radiusY * Math.sin(angle),
            role: CONFIG.roles[i]
        });
    }

    return positions;
}

/**
 * 创建角色元素
 */
function createCharacterElement(position) {
    const div = document.createElement('div');
    div.className = 'character';
    div.id = `character-${position.role.id}`;
    div.style.cssText = `
        position: absolute;
        left: ${position.x}px;
        top: ${position.y}px;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    `;

    div.innerHTML = `
        <div class="character-avatar" style="
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: ${position.role.color}22;
            border: 3px solid ${position.role.color};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            box-shadow: 0 4px 20px ${position.role.color}44;
        ">
            ${position.role.icon}
        </div>
        <span class="character-name" style="
            font-size: 12px;
            font-weight: 600;
            color: #f1f5f9;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        ">${position.role.name}</span>
    `;

    return div;
}

// === 气泡管理 ===

/**
 * 创建气泡元素
 */
function createBubbleElement(message) {
    const role = CONFIG.roles.find(r => r.id === message.role) || CONFIG.roles[0];
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.id = `bubble-${message.id}`;

    // 计算气泡位置（围绕角色）
    const container = document.getElementById('characters-container');
    const containerRect = container.getBoundingClientRect();
    const positions = calculateCharacterPositions(containerRect.width, containerRect.height);
    const roleIndex = CONFIG.roles.findIndex(r => r.id === message.role);
    const rolePosition = positions[roleIndex] || positions[0];

    // 气泡偏移量
    const offsetX = (Math.random() - 0.5) * 100;
    const offsetY = -100 - Math.random() * 50;

    bubble.style.cssText = `
        left: ${rolePosition.x + offsetX}px;
        top: ${rolePosition.y + offsetY}px;
        border-left: 3px solid ${role.color};
    `;

    bubble.innerHTML = `
        <div class="bubble-header">
            <div class="bubble-avatar" style="background: ${role.color}">${role.icon}</div>
            <span class="bubble-name">${role.name}</span>
            <span class="bubble-time">${message.time}</span>
        </div>
        <div class="bubble-content">${message.content}</div>
    `;

    return bubble;
}

/**
 * 显示新气泡
 */
function showBubble(message) {
    const container = document.getElementById('bubbles-container');
    const bubble = createBubbleElement(message);
    container.appendChild(bubble);

    state.activeBubbles.push({
        id: message.id,
        element: bubble,
        timestamp: Date.now()
    });

    // 限制同时显示的气泡数
    while (state.activeBubbles.length > CONFIG.bubble.maxVisible) {
        const oldest = state.activeBubbles.shift();
        oldest.element.remove();
    }

    // 自动隐藏
    setTimeout(() => {
        const index = state.activeBubbles.findIndex(b => b.id === message.id);
        if (index !== -1) {
            state.activeBubbles[index].element.style.opacity = '0';
            setTimeout(() => {
                const idx = state.activeBubbles.findIndex(b => b.id === message.id);
                if (idx !== -1) {
                    state.activeBubbles[idx].element.remove();
                    state.activeBubbles.splice(idx, 1);
                }
            }, 300);
        }
    }, CONFIG.bubble.autoHideDelay);
}

// === 聊天消息 ===

/**
 * 添加聊天消息
 */
function addChatMessage(message) {
    const container = document.getElementById('chat-messages');
    const role = CONFIG.roles.find(r => r.id === message.role) || CONFIG.roles[0];

    const div = document.createElement('div');
    div.className = 'chat-message';
    div.dataset.role = message.role;

    div.innerHTML = `
        <div class="chat-message-avatar" style="background: ${role.color}22; color: ${role.color}">
            ${role.icon}
        </div>
        <div class="chat-message-content">
            <div class="chat-message-header">
                <span class="chat-message-name">${role.name}</span>
                <span class="chat-message-time">${message.time}</span>
            </div>
            <p class="chat-message-text">${message.content}</p>
        </div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    // 限制历史消息数
    state.messages.push(message);
    while (state.messages.length > CONFIG.bubble.maxHistory) {
        state.messages.shift();
    }

    // 过滤显示气泡
    if (state.currentFilter === 'all' || state.currentFilter === message.role) {
        showBubble(message);
    }
}

// === 计时器 ===

/**
 * 更新会议时长显示
 */
function updateDuration() {
    if (!state.meetingStartTime) return;

    const elapsed = Date.now() - state.meetingStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);

    const formatted = [hours, minutes, seconds]
        .map(v => v.toString().padStart(2, '0'))
        .join(':');

    document.getElementById('duration').textContent = formatted;
}

// === 模拟数据 ===

/**
 * 模拟消息数据
 */
const demoMessages = [
    { role: 'orchestrator', content: '大家好，今天我们来讨论新产品的方案。' },
    { role: 'product', content: '我整理了用户需求，主要有三类：问答、文档理解、知识图谱。' },
    { role: 'tech', content: '技术架构我建议用 RAG 方案，支持向量检索。' },
    { role: 'data', content: '目前我们有50万份文档可以使用，覆盖80%的用户需求。' },
    { role: 'ux', content: '界面建议用对话式交互，降低用户学习成本。' },
    { role: 'orchestrator', content: '很好，那 MVP 版本先做问答和文档理解两个核心功能。' },
    { role: 'product', content: '同意，我会在 PRD 里细化具体的需求细节。' },
    { role: 'tech', content: '那技术方案我这边输出，预计下周完成原型。' },
];

/**
 * 启动模拟
 */
function startDemo() {
    let index = 0;

    const interval = setInterval(() => {
        if (index >= demoMessages.length) {
            // 循环模拟
            index = 0;
        }

        const message = {
            id: generateId(),
            role: demoMessages[index].role,
            content: demoMessages[index].content,
            time: getCurrentTime()
        };

        addChatMessage(message);
        index++;
    }, CONFIG.demo.messageInterval);

    return interval;
}

// === 初始化 ===

/**
 * 初始化会议场景
 */
function initMeetingScene() {
    const container = document.getElementById('characters-container');

    // 清空容器
    container.innerHTML = '';

    // 获取容器尺寸
    const containerRect = container.getBoundingClientRect();

    // 计算并创建角色
    const positions = calculateCharacterPositions(containerRect.width, containerRect.height);
    positions.forEach(position => {
        const element = createCharacterElement(position);
        container.appendChild(element);
    });
}

/**
 * 初始化聊天标签
 */
function initChatTabs() {
    const tabs = document.querySelectorAll('.chat-tabs .tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 更新 UI
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // 更新过滤器
            state.currentFilter = tab.dataset.filter;

            // 重新显示符合条件的消息
            const messages = document.querySelectorAll('.chat-message');
            messages.forEach(msg => {
                const role = msg.dataset.role;
                if (state.currentFilter === 'all' || state.currentFilter === role) {
                    msg.style.display = 'flex';
                } else {
                    msg.style.display = 'none';
                }
            });
        });
    });
}

/**
 * 初始化控制按钮
 */
function initControls() {
    // 全屏按钮
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen();
        }
    });

    // 结束会议按钮
    document.getElementById('btn-end').addEventListener('click', () => {
        if (confirm('确定要结束会议吗？')) {
            alert('会议已结束');
            // 后续：发送结束会议事件
        }
    });

    // 发送消息
    const chatInput = document.querySelector('.chat-input-area input');
    const sendBtn = document.querySelector('.chat-input-area .btn-send');

    const sendMessage = () => {
        const content = chatInput.value.trim();
        if (!content) return;

        const message = {
            id: generateId(),
            role: 'orchestrator', // 用户发送的消息算作主持
            content,
            time: getCurrentTime()
        };

        addChatMessage(message);
        chatInput.value = '';
    };

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

/**
 * 初始化会议
 */
async function init() {
    // 设置会议信息
    document.getElementById('meeting-topic').textContent = state.meetingTopic;
    document.getElementById('meeting-goal').textContent = state.meetingGoal;

    // 启动计时器
    state.meetingStartTime = Date.now();
    state.timerInterval = setInterval(updateDuration, 1000);

    // 加载真实 Agent（覆盖 CONFIG.roles）
    await loadAgents();

    // 初始化组件
    initMeetingScene();
    initChatTabs();
    initControls();

    // 启动模拟（Demo 模式）
    if (CONFIG.demo.enabled) {
        // 初始消息
        setTimeout(() => {
            startDemo();
        }, 1000);
    }

    // 窗口大小变化时重新计算角色位置
    window.addEventListener('resize', () => {
        initMeetingScene();
    });

    console.log('Agent Meeting initialized ✓');
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
