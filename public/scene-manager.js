/**
 * SceneManager - 场景管理器
 * 管理工位模式和会议室模式之间的切换
 * 
 * 使用方法:
 *   const scene = new SceneManager();
 *   scene.moveToMeeting();   // 切换到会议室模式
 *   scene.moveToWorkspace(); // 切换到工位模式
 */

class SceneManager {
  constructor(options = {}) {
    this.currentScene = 'workspace'; // 'workspace' | 'meeting'
    this.isAnimating = false;
    
    // 容器选择器
    this.containerSelector = options.container || '#scene-container';
    this.container = document.querySelector(this.containerSelector);
    
    // 工位布局配置
    this.workspaceConfig = {
      distribution: 'horizontal',  // 横向均匀分布
      spacing: 60,                // 角色间距(px)
      avatarWidth: 120,           // 角色宽度
      avatarHeight: 160,           // 角色高度
      bottomMargin: 120,           // 距底部距离
      scale: 1
    };

    // 会议室布局配置 - 椭圆围坐
    this.meetingConfig = {
      ellipseWidth: 700,          // 椭圆宽度
      ellipseHeight: 400,         // 椭圆高度
      avatarWidth: 120,
      avatarHeight: 160,
      scale: 1
    };

    // 角色列表 (按工位从左到右顺序)
    this.agents = [
      { id: 'tim',      name: 'Tim',      role: 'leader' },
      { id: 'canmou',   name: 'canmou',   role: 'monitor' },
      { id: 'creator',  name: 'creator',  role: 'creator' },
      { id: 'yunying',  name: 'yunying',  role: 'operator' },
      { id: 'evolver',  name: 'evolver',  role: 'evolver' }
    ];

    // 每个角色的场景位置数据
    this.positions = {
      workspace: [],
      meeting: []
    };

    // 初始化
    this._init();
  }

  _init() {
    // 确保容器存在
    if (!this.container) {
      // 延迟检查，等 DOM 加载完成
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this._init());
      } else {
        this.container = document.createElement('div');
        this.container.id = 'scene-container';
        document.body.appendChild(this.container);
      }
      return;
    }

    // 设置容器样式
    this.container.classList.add('scene-container');
    if (!this.container.classList.contains('scene-workspace')) {
      this.container.classList.add('scene-workspace');
    }

    // 计算位置
    this._calculatePositions();

    // 注册所有角色
    this._registerAgents();

    // 监听窗口大小变化
    window.addEventListener('resize', () => {
      this._calculatePositions();
      this._updateAgentPositions(false); // 不带动画重置位置
    });

    // 初始化场景
    this._applyScene(this.currentScene, false);
  }

  /**
   * 计算所有场景下的位置
   */
  _calculatePositions() {
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width || window.innerWidth;
    const containerHeight = containerRect.height || window.innerHeight;

    // === 工位模式: 5角色横向均匀分布 ===
    const workspacePositions = [];
    const agentCount = this.agents.length;
    const totalWidth = agentCount * this.workspaceConfig.avatarWidth + 
                       (agentCount - 1) * this.workspaceConfig.spacing;
    const startX = (containerWidth - totalWidth) / 2;
    const workspaceY = containerHeight - this.workspaceConfig.bottomMargin - 
                        this.workspaceConfig.avatarHeight;

    this.agents.forEach((agent, i) => {
      workspacePositions.push({
        id: agent.id,
        x: startX + i * (this.workspaceConfig.avatarWidth + this.workspaceConfig.spacing),
        y: workspaceY,
        scale: this.workspaceConfig.scale,
        rotation: 0,
        opacity: 1
      });
    });
    this.positions.workspace = workspacePositions;

    // === 会议室模式: 椭圆围坐布局 ===
    // Tim 在顶部中央，其他4人围绕椭圆分布
    const meetingPositions = [];
    const cx = containerWidth / 2;           // 椭圆中心X
    const cy = containerHeight / 2 + 40;     // 椭圆中心Y (略偏下)
    const rx = Math.min(this.meetingConfig.ellipseWidth / 2, containerWidth * 0.38);
    const ry = Math.min(this.meetingConfig.ellipseHeight / 2, containerHeight * 0.30);

    // 椭圆角度分布 (从顶部开始，顺时针)
    // Tim 在顶部 (90°), 其他人在椭圆上均匀分布
    const meetingAgents = [
      { id: 'tim', angleOffset: 90 },      // 顶部中央
      { id: 'canmou', angleOffset: 145 },
      { id: 'creator', angleOffset: 200 },
      { id: 'yunying', angleOffset: 340 },
      { id: 'evolver', angleOffset: 25 }
    ];

    // 按角度排序，让人在椭圆上均匀
    meetingAgents.sort((a, b) => a.angleOffset - b.angleOffset);

    meetingAgents.forEach((agent, i) => {
      const angleRad = (agent.angleOffset * Math.PI) / 180;
      const x = cx + rx * Math.cos(angleRad);
      const y = cy + ry * Math.sin(angleRad);
      
      // 顶部的人稍微朝前倾
      const rotation = agent.id === 'tim' ? -5 : 0;
      
      meetingPositions.push({
        id: agent.id,
        x: x - this.meetingConfig.avatarWidth / 2,
        y: y - this.meetingConfig.avatarHeight,
        scale: this.meetingConfig.scale,
        rotation: rotation,
        opacity: 1
      });
    });
    this.positions.meeting = meetingPositions;
  }

  /**
   * 注册所有角色到 DOM
   */
  _registerAgents() {
    this.agents.forEach(agent => {
      let avatarEl = document.getElementById(`avatar-${agent.id}`);
      
      if (!avatarEl) {
        // 查找现有的 SVG 元素
        avatarEl = document.querySelector(`svg[data-agent="${agent.id}"]`);
      }
      
      if (avatarEl) {
        avatarEl.classList.add('agent-avatar');
        avatarEl.setAttribute('data-agent', agent.id);
        avatarEl.setAttribute('data-scene', this.currentScene);
        
        // GPU 加速
        avatarEl.style.transform = 'translateZ(0)';
        avatarEl.style.willChange = 'transform';
      }
    });
  }

  /**
   * 更新所有角色的位置
   * @param {boolean} animate - 是否带动画
   */
  _updateAgentPositions(animate = true) {
    const positions = this.positions[this.currentScene];
    const duration = animate ? 1200 : 0;
    const easing = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

    positions.forEach(pos => {
      const avatarEl = document.getElementById(`avatar-${pos.id}`) ||
                       document.querySelector(`svg[data-agent="${pos.id}"]`);
      
      if (avatarEl) {
        if (animate) {
          avatarEl.style.transition = `transform ${duration}ms ${easing}`;
        } else {
          avatarEl.style.transition = 'none';
        }
        
        avatarEl.style.transform = `translateZ(0) translate(${pos.x}px, ${pos.y}px)`;
        avatarEl.setAttribute('data-scene', this.currentScene);
      }
    });

    // 标记动画状态
    if (animate) {
      this.isAnimating = true;
      setTimeout(() => {
        this.isAnimating = false;
      }, duration);
    }
  }

  /**
   * 应用场景
   * @param {string} scene - 'workspace' | 'meeting'
   * @param {boolean} animate - 是否带动画
   */
  _applyScene(scene, animate = true) {
    // 更新容器类
    this.container.classList.remove('scene-workspace', 'scene-meeting');
    this.container.classList.add(`scene-${scene}`);
    
    // 更新场景状态
    this.currentScene = scene;
    
    // 更新角色位置
    this._updateAgentPositions(animate);

    // 触发事件
    this.container.dispatchEvent(new CustomEvent('scene:change', {
      detail: { scene, animate }
    }));
  }

  /**
   * 切换到会议室模式
   * @param {function} onComplete - 动画完成回调
   */
  moveToMeeting(onComplete) {
    if (this.currentScene === 'meeting' || this.isAnimating) {
      return Promise.resolve();
    }

    // 触发场景切换前事件
    this.container.dispatchEvent(new CustomEvent('scene:before-change', {
      detail: { from: this.currentScene, to: 'meeting' }
    }));

    // 缩小阶段 (工位 → 飘起)
    this._phaseShrink();

    // 等待缩小完成后移动
    const duration = 1200;
    return new Promise(resolve => {
      setTimeout(() => {
        this._applyScene('meeting', true);
        
        setTimeout(() => {
          // 恢复尺寸
          this._phaseRestore();
          
          if (onComplete) onComplete();
          resolve();
        }, duration * 0.6);
      }, 150);
    });
  }

  /**
   * 切换到工位模式
   * @param {function} onComplete - 动画完成回调
   */
  moveToWorkspace(onComplete) {
    if (this.currentScene === 'workspace' || this.isAnimating) {
      return Promise.resolve();
    }

    this.container.dispatchEvent(new CustomEvent('scene:before-change', {
      detail: { from: this.currentScene, to: 'workspace' }
    }));

    const duration = 1200;
    return new Promise(resolve => {
      // 直接移动回工位
      this._applyScene('workspace', true);
      
      setTimeout(() => {
        if (onComplete) onComplete();
        resolve();
      }, duration);
    });
  }

  /**
   * 缩小阶段动画
   */
  _phaseShrink() {
    const positions = this.positions.workspace;
    const duration = 300;

    positions.forEach(pos => {
      const avatarEl = document.getElementById(`avatar-${pos.id}`) ||
                       document.querySelector(`svg[data-agent="${pos.id}"]`);
      if (avatarEl) {
        avatarEl.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
        avatarEl.style.transform = `translateZ(0) translate(${pos.x + pos.scale * 30}px, ${pos.y - 30}px) scale(0.85)`;
        avatarEl.style.opacity = '0.7';
      }
    });
  }

  /**
   * 恢复尺寸阶段动画
   */
  _phaseRestore() {
    const positions = this.positions[this.currentScene];

    positions.forEach(pos => {
      const avatarEl = document.getElementById(`avatar-${pos.id}`) ||
                       document.querySelector(`svg[data-agent="${pos.id}"]`);
      if (avatarEl) {
        avatarEl.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease-out';
        avatarEl.style.transform = `translateZ(0) translate(${pos.x}px, ${pos.y}px) scale(1)`;
        avatarEl.style.opacity = '1';
      }
    });
  }

  /**
   * 获取当前场景
   * @returns {string}
   */
  getCurrentScene() {
    return this.currentScene;
  }

  /**
   * 获取角色在当前场景的位置
   * @param {string} agentId
   * @returns {object|null}
   */
  getAgentPosition(agentId) {
    const positions = this.positions[this.currentScene];
    return positions.find(p => p.id === agentId) || null;
  }

  /**
   * 获取所有角色位置
   * @returns {object}
   */
  getAllPositions() {
    return { ...this.positions };
  }

  /**
   * 获取代理器是否正在动画
   * @returns {boolean}
   */
  isMoving() {
    return this.isAnimating;
  }

  /**
   * 添加新角色到场景
   * @param {string} id
   * @param {string} name
   * @param {string} role
   */
  addAgent(id, name, role) {
    if (this.agents.find(a => a.id === id)) return;
    
    this.agents.push({ id, name, role });
    this._calculatePositions();
    
    // 如果新角色已存在于 DOM，立即注册
    const avatarEl = document.getElementById(`avatar-${id}`) ||
                     document.querySelector(`svg[data-agent="${id}"]`);
    if (avatarEl) {
      this._registerAgents();
    }
  }

  /**
   * 移除角色
   * @param {string} id
   */
  removeAgent(id) {
    this.agents = this.agents.filter(a => a.id !== id);
    this._calculatePositions();
  }

  /**
   * 销毁场景管理器
   */
  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.agents = [];
    this.positions = { workspace: [], meeting: [] };
  }
}

// 导出
export { SceneManager };
export default SceneManager;
