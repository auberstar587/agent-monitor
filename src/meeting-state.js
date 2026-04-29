import { EventEmitter } from 'events';

/**
 * MeetingStateMachine - 会议状态机
 * 
 * 状态流转:
 * idle → meeting_invited → meeting_joining → meeting → meeting_speaking → meeting_presenting → idle
 * 
 * 触发事件: meeting:start, meeting:end, meeting:join, meeting:leave
 */

// 会议状态枚举
export const MeetingState = {
  IDLE: 'idle',
  MEETING_INVITED: 'meeting_invited',
  MEETING_JOINING: 'meeting_joining',
  MEETING: 'meeting',
  MEETING_SPEAKING: 'meeting_speaking',
  MEETING_PRESENTING: 'meeting_presenting',
};

// 有效触发事件
export const MeetingEvent = {
  MEETING_START: 'meeting:start',
  MEETING_INVITE: 'meeting:invite',
  MEETING_JOIN: 'meeting:join',
  MEETING_LEAVE: 'meeting:leave',
  MEETING_END: 'meeting:end',
  MEETING_SPEAK: 'meeting:speak',
  MEETING_PRESENT: 'meeting:present',
  MEETING_IDLE: 'meeting:idle',
};

// 状态流转规则
const STATE_TRANSITIONS = {
  [MeetingState.IDLE]: {
    [MeetingEvent.MEETING_INVITE]: MeetingState.MEETING_INVITED,
    [MeetingEvent.MEETING_START]: MeetingState.MEETING,
  },
  [MeetingState.MEETING_INVITED]: {
    [MeetingEvent.MEETING_JOIN]: MeetingState.MEETING_JOINING,
    [MeetingEvent.MEETING_LEAVE]: MeetingState.IDLE,
    [MeetingEvent.MEETING_END]: MeetingState.IDLE,
  },
  [MeetingState.MEETING_JOINING]: {
    [MeetingEvent.MEETING_JOIN]: MeetingState.MEETING,
    [MeetingEvent.MEETING_LEAVE]: MeetingState.IDLE,
  },
  [MeetingState.MEETING]: {
    [MeetingEvent.MEETING_SPEAK]: MeetingState.MEETING_SPEAKING,
    [MeetingEvent.MEETING_LEAVE]: MeetingState.IDLE,
    [MeetingEvent.MEETING_END]: MeetingState.IDLE,
  },
  [MeetingState.MEETING_SPEAKING]: {
    [MeetingEvent.MEETING_PRESENT]: MeetingState.MEETING_PRESENTING,
    [MeetingEvent.MEETING_LEAVE]: MeetingState.IDLE,
    [MeetingEvent.MEETING_END]: MeetingState.IDLE,
    [MeetingEvent.MEETING_IDLE]: MeetingState.MEETING,
  },
  [MeetingState.MEETING_PRESENTING]: {
    [MeetingEvent.MEETING_SPEAK]: MeetingState.MEETING_SPEAKING,
    [MeetingEvent.MEETING_LEAVE]: MeetingState.IDLE,
    [MeetingEvent.MEETING_END]: MeetingState.IDLE,
    [MeetingEvent.MEETING_IDLE]: MeetingState.MEETING,
  },
};

export class MeetingStateMachine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.state = MeetingState.IDLE;
    this.currentMeeting = null;
    this.participants = new Map();
    this.meetingHistory = [];
    
    this.config = {
      joinTimeout: options.joinTimeout || 30000, // 30s 等待加入
      idleTimeout: options.idleTimeout || 60000, // 60s 空闲自动回到 meeting
      maxParticipants: options.maxParticipants || 10,
      ...options,
    };
    
    // 超时定时器
    this.timers = {
      join: null,
      idle: null,
    };
    
    // 统计信息
    this.stats = {
      totalMeetings: 0,
      totalDuration: 0,
      stateChanges: 0,
    };
  }
  
  /**
   * 获取当前状态
   */
  getState() {
    return {
      state: this.state,
      meeting: this.currentMeeting,
      participants: Array.from(this.participants.values()),
      stats: { ...this.stats },
    };
  }
  
  /**
   * 获取当前会议信息
   */
  getCurrentMeeting() {
    return this.currentMeeting;
  }
  
  /**
   * 是否处于会议中
   */
  isInMeeting() {
    return this.state !== MeetingState.IDLE;
  }

  /**
   * 获取当前会议参与者 ID 列表
   * @returns {string[]}
   */
  getParticipantIds() {
    // 从 ChatRoom 的在线 Agent 推断参与者
    // 如果没有显式参与者记录，返回空数组
    if (this.participants.size > 0) {
      return Array.from(this.participants.keys());
    }
    return [];
  }
  
  /**
   * 检查是否可以进行状态转换
   */
  canTransition(event) {
    const transitions = STATE_TRANSITIONS[this.state];
    return transitions && event in transitions;
  }
  
  /**
   * 触发事件，驱动状态机
   */
  async emitEvent(event, data = {}) {
    const startTime = Date.now();
    
    // 检查是否允许此转换
    if (!this.canTransition(event)) {
      console.warn(`[MeetingState] Invalid transition: ${event} from ${this.state}`);
      return { success: false, error: 'Invalid transition', currentState: this.state };
    }
    
    const prevState = this.state;
    const transitions = STATE_TRANSITIONS[this.state];
    const nextState = transitions[event];
    
    // 清除相关定时器
    this._clearTimer('join');
    this._clearTimer('idle');
    
    // 执行转换前钩子
    const beforeResult = await this._beforeTransition(event, data);
    if (beforeResult === false) {
      return { success: false, error: 'Transition blocked', currentState: this.state };
    }
    
    // 更新状态
    this.state = nextState;
    this.stats.stateChanges++;
    
    console.log(`[MeetingState] ${prevState} --(${event})--> ${nextState}`);
    
    // 发射状态变更事件
    const eventData = {
      event,
      prevState,
      currentState: nextState,
      meeting: this.currentMeeting,
      timestamp: Date.now(),
      latencyMs: Date.now() - startTime,
      ...data,
    };
    
    this.emit('stateChange', eventData);
    this.emit('meeting:state', eventData);
    
    // 执行转换后钩子
    await this._afterTransition(event, data);
    
    return { success: true, prevState, currentState: nextState, eventData };
  }
  
  /**
   * 转换前钩子
   */
  async _beforeTransition(event, data) {
    switch (event) {
      case MeetingEvent.MEETING_START:
      case MeetingEvent.MEETING_INVITE:
        return this._handleMeetingStart(data);
        
      case MeetingEvent.MEETING_JOIN:
        return this._handleMeetingJoin(data);
        
      case MeetingEvent.MEETING_LEAVE:
        return this._handleMeetingLeave(data);
        
      case MeetingEvent.MEETING_END:
        return this._handleMeetingEnd(data);
        
      default:
        return true;
    }
  }
  
  /**
   * 转换后钩子
   */
  async _afterTransition(event, data) {
    switch (event) {
      case MeetingEvent.MEETING_INVITE:
        // 启动加入超时定时器
        this._startTimer('join', this.config.joinTimeout, () => {
          console.log('[MeetingState] Join timeout, cancelling invitation');
          this.emitEvent(MeetingEvent.MEETING_END, { reason: 'join_timeout' });
        });
        break;
        
      case MeetingEvent.MEETING_SPEAK:
      case MeetingEvent.MEETING_PRESENT:
        // 启动空闲超时定时器
        this._startTimer('idle', this.config.idleTimeout, () => {
          console.log('[MeetingState] Idle timeout, returning to meeting');
          this.emitEvent(MeetingEvent.MEETING_IDLE, { reason: 'idle_timeout' });
        });
        break;
    }
  }
  
  /**
   * 处理会议开始
   */
  _handleMeetingStart(data) {
    if (this.isInMeeting()) {
      console.warn('[MeetingState] Already in meeting');
      return false;
    }

    const now = Date.now();
    this.currentMeeting = {
      id: data.meetingId || `meeting_${now}_${Math.random().toString(36).substr(2, 8)}`,
      title: data.title || 'Untitled Meeting',
      agenda: data.agenda || [],
      hostId: data.hostId || 'unknown',
      participants: [],
      createdAt: now,
      startedAt: now,
      endedAt: null,
    };

    this.stats.totalMeetings++;

    return true;
  }
  
  /**
   * 处理加入会议
   */
  _handleMeetingJoin(data) {
    const participant = {
      id: data.agentId || data.participantId,
      agentId: data.agentId,
      name: data.name || data.agentId,
      role: data.role || 'participant',
      joinedAt: Date.now(),
      status: 'active',
    };
    
    this.participants.set(participant.id, participant);
    
    if (this.currentMeeting) {
      this.currentMeeting.participants.push(participant);
    }
    
    return true;
  }
  
  /**
   * 处理离开会议
   */
  _handleMeetingLeave(data) {
    const participantId = data.agentId || data.participantId;
    const participant = this.participants.get(participantId);
    
    if (participant) {
      participant.leftAt = Date.now();
      participant.status = 'left';
      this.participants.delete(participantId);
    }
    
    // 如果所有参与者都离开，结束会议
    if (this.participants.size === 0 && this.isInMeeting()) {
      console.log('[MeetingState] All participants left, ending meeting');
      // 延迟一点再结束，让状态稳定
      setTimeout(() => {
        if (this.participants.size === 0) {
          this.emitEvent(MeetingEvent.MEETING_END, { reason: 'all_left' });
        }
      }, 1000);
    }
    
    return true;
  }
  
  /**
   * 处理会议结束
   */
  _handleMeetingEnd(data) {
    if (this.currentMeeting) {
      this.currentMeeting.endedAt = Date.now();
      
      // 记录到历史
      this.meetingHistory.push({
        ...this.currentMeeting,
        endedReason: data.reason || 'normal_end',
        duration: this.currentMeeting.endedAt - this.currentMeeting.startedAt,
      });
      
      // 累计时长
      if (this.currentMeeting.startedAt) {
        this.stats.totalDuration += this.currentMeeting.endedAt - this.currentMeeting.startedAt;
      }
      
      this.currentMeeting = null;
    }
    
    // 清理参与者
    this.participants.clear();
    
    return true;
  }
  
  /**
   * 开始会议（所有受邀者都已加入）
   */
  startMeeting() {
    if (this.currentMeeting && this.state === MeetingState.MEETING_JOINING) {
      this.currentMeeting.startedAt = Date.now();
      return this.emitEvent(MeetingEvent.MEETING_JOIN, {});
    }
    return { success: false, error: 'Cannot start meeting from current state' };
  }
  
  /**
   * 离开会议
   */
  leaveMeeting(agentId) {
    return this.emitEvent(MeetingEvent.MEETING_LEAVE, { agentId });
  }
  
  /**
   * 结束会议
   */
  endMeeting(reason = 'manual') {
    return this.emitEvent(MeetingEvent.MEETING_END, { reason });
  }
  
  /**
   * 开始发言
   */
  startSpeaking(agentId) {
    return this.emitEvent(MeetingEvent.MEETING_SPEAK, { agentId });
  }
  
  /**
   * 开始演示
   */
  startPresenting(agentId) {
    return this.emitEvent(MeetingEvent.MEETING_PRESENT, { agentId });
  }
  
  /**
   * 定时器管理
   */
  _startTimer(name, delay, callback) {
    this._clearTimer(name);
    this.timers[name] = setTimeout(callback, delay);
  }
  
  _clearTimer(name) {
    if (this.timers[name]) {
      clearTimeout(this.timers[name]);
      this.timers[name] = null;
    }
  }
  
  /**
   * 销毁，清理资源
   */
  destroy() {
    this._clearTimer('join');
    this._clearTimer('idle');
    this.removeAllListeners();
  }
}

// ============ 便捷函数 ============

/**
 * 创建会议状态机实例
 */
export function createMeetingStateMachine(options = {}) {
  return new MeetingStateMachine(options);
}

export default MeetingStateMachine;
