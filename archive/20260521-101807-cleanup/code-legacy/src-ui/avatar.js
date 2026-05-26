/**
 * AvatarController - Agent人形形象状态控制器
 * 
 * 功能：
 * - 状态切换 (idle/working/speaking/moving/in-meeting)
 * - 位置移动
 * - 场景切换
 * - CSS动画性能优化
 */

const AVATAR_STATES = ['idle', 'working', 'speaking', 'moving', 'in-meeting'];

class AvatarController {
  /**
   * @param {HTMLElement|SVGElement} element - SVG avatar DOM元素
   * @param {string} agentType - Agent类型 (canmou/creator/yunying/evolver)
   */
  constructor(element, agentType) {
    if (!element) {
      throw new Error('[AvatarController] element is required');
    }
    
    this.el = element;
    this.agentType = agentType;
    this.currentState = 'idle';
    this.currentPosition = { x: 0, y: 0 };
    this._isMoving = false;
    this._moveTimeout = null;
    
    // 初始化：设置 data 属性便于 CSS 选择器
    this.el.setAttribute('data-agent', agentType);
    this.el.classList.add('agent-avatar');
    
    // 绑定方法
    this.setState = this.setState.bind(this);
    this.speak = this.speak.bind(this);
    this.idle = this.idle.bind(this);
    this.work = this.work.bind(this);
    this.moveTo = this.moveTo.bind(this);
    this.enterMeeting = this.enterMeeting.bind(this);
    this.leaveMeeting = this.leaveMeeting.bind(this);
  }

  /**
   * 设置状态
   * @param {string} newState - 目标状态
   */
  setState(newState) {
    if (!AVATAR_STATES.includes(newState)) {
      console.warn(`[AvatarController] Unknown state: ${newState}`);
      return;
    }
    
    if (this.currentState === newState) return;
    
    // 移除旧状态 class，添加新状态 class
    this.el.classList.remove(`state-${this.currentState}`);
    this.el.classList.add(`state-${newState}`);
    this.currentState = newState;
    
    // 状态变化事件
    this.el.dispatchEvent(new CustomEvent('avatar:state-change', {
      detail: { from: this._prevState, to: newState, agent: this.agentType }
    }));
    
    this._prevState = this.currentState;
  }

  /**
   * 进入发言状态
   */
  speak() {
    this.setState('speaking');
  }

  /**
   * 进入空闲状态
   */
  idle() {
    this.setState('idle');
  }

  /**
   * 进入工作状态
   */
  work() {
    this.setState('working');
  }

  /**
   * 移动到指定位置
   * @param {number} x - X坐标 (px)
   * @param {number} y - Y坐标 (px)
   * @param {number} duration - 动画时长 (ms)，默认 500
   */
  moveTo(x, y, duration = 500) {
    // 停止之前的移动
    if (this._moveTimeout) {
      clearTimeout(this._moveTimeout);
    }
    
    this.setState('moving');
    this._isMoving = true;
    this.el.setAttribute('data-moving', 'true');
    
    // 使用 CSS transition 处理平滑移动
    this.el.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
    this.el.style.transform = `translate(${x}px, ${y}px)`;
    
    this.currentPosition = { x, y };
    
    // 移动结束后恢复 idle
    this._moveTimeout = setTimeout(() => {
      this._isMoving = false;
      this.el.setAttribute('data-moving', 'false');
      this.el.style.transition = '';
      if (this.currentState === 'moving') {
        this.setState('idle');
      }
    }, duration);
  }

  /**
   * 进入会议室
   * @param {number} x - 会议室中的X坐标
   * @param {number} y - 会议室中的Y坐标
   */
  enterMeeting(x = 0, y = 0) {
    this.setState('in-meeting');
    if (x !== 0 || y !== 0) {
      this.el.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
      this.el.style.transform = `translate(${x}px, ${y}px)`;
      this.currentPosition = { x, y };
    }
  }

  /**
   * 离开会议室
   */
  leaveMeeting() {
    this.el.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    this.setState('idle');
  }

  /**
   * 获取当前状态
   * @returns {string}
   */
  getState() {
    return this.currentState;
  }

  /**
   * 获取当前位置
   * @returns {{x: number, y: number}}
   */
  getPosition() {
    return { ...this.currentPosition };
  }

  /**
   * 销毁控制器
   */
  destroy() {
    if (this._moveTimeout) {
      clearTimeout(this._moveTimeout);
    }
    AVATAR_STATES.forEach(s => this.el.classList.remove(`state-${s}`));
    this.el.classList.remove('agent-avatar');
    this.el.removeAttribute('data-agent');
    this.el.removeAttribute('data-moving');
  }
}


/**
 * AvatarManager - 多Agent管理器
 * 方便批量管理多个AvatarController实例
 */
class AvatarManager {
  constructor() {
    /** @type {Map<string, AvatarController>} */
    this.avatars = new Map();
  }

  /**
   * 注册一个Avatar
   * @param {string} id - 唯一标识
   * @param {HTMLElement|SVGElement} element - DOM元素
   * @param {string} agentType - Agent类型
   * @returns {AvatarController}
   */
  register(id, element, agentType) {
    if (this.avatars.has(id)) {
      console.warn(`[AvatarManager] Avatar "${id}" already registered, replacing.`);
      this.avatars.get(id).destroy();
    }
    
    const controller = new AvatarController(element, agentType);
    this.avatars.set(id, controller);
    
    element.setAttribute('data-avatar-id', id);
    
    return controller;
  }

  /**
   * 获取AvatarController
   * @param {string} id
   * @returns {AvatarController|undefined}
   */
  get(id) {
    return this.avatars.get(id);
  }

  /**
   * 获取所有注册过的ID
   * @returns {string[]}
   */
  list() {
    return Array.from(this.avatars.keys());
  }

  /**
   * 批量设置状态
   * @param {string} state
   * @param {string[]} excludeIds - 排除的ID
   */
  setAllState(state, excludeIds = []) {
    this.avatars.forEach((ctrl, id) => {
      if (!excludeIds.includes(id)) {
        ctrl.setState(state);
      }
    });
  }

  /**
   * 销毁所有Avatar
   */
  destroyAll() {
    this.avatars.forEach(ctrl => ctrl.destroy());
    this.avatars.clear();
  }

  /**
   * 销毁单个Avatar
   */
  unregister(id) {
    const ctrl = this.avatars.get(id);
    if (ctrl) {
      ctrl.destroy();
      this.avatars.delete(id);
    }
  }
}

// 自动从 DOM 注册已存在的 SVG avatar
function autoRegisterAvatars() {
  const manager = new AvatarManager();
  const svgElements = document.querySelectorAll('svg.agent-avatar[data-agent]');
  
  svgElements.forEach(svg => {
    const agentType = svg.getAttribute('data-agent');
    const id = svg.id || `avatar-${agentType}-${Date.now()}`;
    manager.register(id, svg, agentType);
  });
  
  return manager;
}

// 导出
export { AvatarController, AvatarManager, autoRegisterAvatars, AVATAR_STATES };
export default AvatarController;
