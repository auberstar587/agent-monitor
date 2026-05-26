import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Task states
const VALID_TASK_STATUSES = ['queued', 'dispatched', 'running', 'completed', 'failed', 'cancelled'];

// Max tasks kept in history
const MAX_COMPLETED_TASKS = 500;

// Default retry config
const DEFAULT_MAX_ATTEMPTS = 3;
const PRIORITY_WEIGHT = { low: 1, medium: 5, high: 10, urgent: 20 };

function priorityWeight(priority) {
  if (typeof priority === 'number') return priority;
  return PRIORITY_WEIGHT[priority] ?? PRIORITY_WEIGHT.medium;
}

/**
 * TaskQueue - Agent task scheduling service
 *
 * Manages task lifecycle: queued → dispatched → running → completed/failed
 * Auto-dispatches tasks when agents become idle.
 *
 * Events:
 * - 'task:created' — Task created
 * - 'task:dispatched' — Task dispatched to agent
 * - 'task:started' — Agent started working
 * - 'task:progress' — Progress update
 * - 'task:completed' — Task completed
 * - 'task:failed' — Task failed
 * - 'task:cancelled' — Task cancelled
 * - 'task:retried' — Task retried
 */
export class TaskQueue extends EventEmitter {
  constructor(options = {}) {
    super();

    this._chatRoom = null;
    this._messageRouter = null;

    // Tasks storage: Map<taskId, Task>
    this.tasks = new Map();

    // Agent concurrency: Map<agentId, runningCount>
    this._runningCount = new Map();

    // Data persistence
    this._dataDir = path.join(__dirname, '..', 'data');
    this._dataFile = path.join(this._dataDir, 'tasks.json');
    this._ensureDataDir();
  }

  /**
   * Set ChatRoom reference for agent status monitoring
   */
  setChatRoom(chatRoom) {
    this._chatRoom = chatRoom;
  }

  /**
   * Set MessageRouter reference for task dispatching
   */
  setMessageRouter(router) {
    this._messageRouter = router;
  }

  _ensureDataDir() {
    if (!fs.existsSync(this._dataDir)) {
      fs.mkdirSync(this._dataDir, { recursive: true });
    }
  }

  /**
   * Generate unique task ID
   */
  _generateId() {
    return 'task_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  /**
   * Get max concurrent tasks for an agent (from ChatRoom metadata or default)
   */
  _getMaxConcurrent(agentId) {
    if (!this._chatRoom) return 1;
    const agent = this._chatRoom.getAgent(agentId);
    return agent?.metadata?.maxConcurrentTasks || 1;
  }

  // ===== Persistence =====

  load() {
    try {
      if (fs.existsSync(this._dataFile)) {
        const raw = fs.readFileSync(this._dataFile, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.tasks.clear();
          for (const t of data) {
            this.tasks.set(t.id, t);
            // Restore running counts
            if (t.status === 'running' || t.status === 'dispatched') {
              this._runningCount.set(t.agentId, (this._runningCount.get(t.agentId) || 0) + 1);
            }
          }
          console.log(`[TaskQueue] Loaded ${this.tasks.size} tasks`);
        }
      }
    } catch (err) {
      console.warn(`[TaskQueue] Failed to load tasks: ${err.message}`);
    }
  }

  _save() {
    try {
      // Trim completed/failed/cancelled tasks beyond limit
      const tasks = Array.from(this.tasks.values());
      const active = tasks.filter(t => !['completed', 'failed', 'cancelled'].includes(t.status));
      const done = tasks
        .filter(t => ['completed', 'failed', 'cancelled'].includes(t.status))
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
        .slice(0, MAX_COMPLETED_TASKS);

      const data = [...active, ...done];
      fs.writeFileSync(this._dataFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[TaskQueue] Failed to save tasks: ${err.message}`);
    }
  }

  // ===== Task CRUD =====

  /**
   * Create a new task
   * @param {object} data - { title, description?, agentId?, priority?, maxAttempts? }
   * @returns {object} created task
   */
  create(data) {
    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
      throw { statusCode: 400, message: 'title is required' };
    }

    const now = Date.now();
    const task = {
      id: this._generateId(),
      title: data.title.trim(),
      description: data.description?.trim() || '',
      agentId: data.agentId || '',
      priority: data.priority || 'medium',
      status: 'queued',
      maxAttempts: data.maxAttempts || DEFAULT_MAX_ATTEMPTS,
      attempt: 1,
      progress: null,
      result: null,
      error: null,
      // New fields
      projectId: data.projectId || null,
      position: data.position || 0,
      labels: Array.isArray(data.labels) ? data.labels : [],
      assigneeType: data.assigneeType || null,
      dueDate: data.dueDate || null,
      createdAt: now,
      dispatchedAt: null,
      startedAt: null,
      completedAt: null,
    };

    this.tasks.set(task.id, task);
    this._save();
    this.emit('task:created', { task });

    console.log(`[TaskQueue] Created task: ${task.title} (${task.id})`);

    // Auto-dispatch if agent specified and available
    if (task.agentId) {
      this._tryDispatch(task.agentId);
    }

    return task;
  }

  /**
   * Get all tasks, optionally filtered
   */
  getAll(filter = {}) {
    let tasks = Array.from(this.tasks.values());

    if (filter.agentId) tasks = tasks.filter(t => t.agentId === filter.agentId);
    if (filter.status) tasks = tasks.filter(t => t.status === filter.status);

    // Sort: active first, then by priority desc, then by created asc
    const statusOrder = { running: 0, dispatched: 1, queued: 2, failed: 3, cancelled: 4, completed: 5 };
    tasks.sort((a, b) => {
      const so = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (so !== 0) return so;
      const po = priorityWeight(b.priority) - priorityWeight(a.priority);
      if (po !== 0) return po;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    return tasks;
  }

  /**
   * Get a single task by ID
   */
  get(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Cancel a task
   */
  cancel(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (['completed', 'failed', 'cancelled'].includes(task.status)) {
      throw { statusCode: 400, message: `Cannot cancel task in ${task.status} state` };
    }

    const prevStatus = task.status;
    task.status = 'cancelled';
    task.completedAt = Date.now();

    if (prevStatus === 'running' || prevStatus === 'dispatched') {
      this._decrementRunning(task.agentId);
    }

    this._save();
    this.emit('task:cancelled', { task, prevStatus });

    console.log(`[TaskQueue] Cancelled task: ${task.title} (${task.id})`);
    return task;
  }

  /**
   * Update task fields (title, description, priority, etc.)
   */
  update(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    const allowed = ['title', 'description', 'priority', 'agentId', 'position', 'projectId', 'labels', 'assigneeType', 'dueDate'];
    for (const key of allowed) {
      if (updates[key] !== undefined) task[key] = updates[key];
    }
    this._save();
    this.emit('task:updated', { task });
    return task;
  }

  // ===== Agent-facing operations (called by agents via HTTP) =====

  /**
   * Agent claims next available task (pull mode)
   */
  claimNext(agentId) {
    const maxConcurrent = this._getMaxConcurrent(agentId);
    const current = this._runningCount.get(agentId) || 0;
    if (current >= maxConcurrent) return null;

    // Find highest priority queued task for this agent
    let best = null;
    for (const task of this.tasks.values()) {
      if (task.status !== 'queued') continue;
      if (task.agentId && task.agentId !== agentId) continue;
      // Unassigned tasks are claimable by anyone
      if (!task.agentId || task.agentId === agentId) {
        const taskPriority = priorityWeight(task.priority);
        const bestPriority = priorityWeight(best?.priority);
        if (!best || taskPriority > bestPriority || (taskPriority === bestPriority && task.createdAt < best.createdAt)) {
          best = task;
        }
      }
    }

    if (!best) return null;

    // Assign if unassigned
    if (!best.agentId) {
      best.agentId = agentId;
    }

    this._dispatchTask(best);
    return best;
  }

  /**
   * Agent starts working on a task
   */
  start(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) throw { statusCode: 404, message: 'Task not found' };
    if (task.status !== 'dispatched') {
      throw { statusCode: 400, message: `Task is in ${task.status} state, expected dispatched` };
    }

    task.status = 'running';
    task.startedAt = Date.now();
    this._save();

    this.emit('task:started', { task });
    console.log(`[TaskQueue] Task started: ${task.title} by ${task.agentId}`);

    return task;
  }

  /**
   * Agent completes a task
   */
  complete(taskId, result = {}) {
    const task = this.tasks.get(taskId);
    if (!task) throw { statusCode: 404, message: 'Task not found' };
    if (!['running', 'dispatched'].includes(task.status)) {
      throw { statusCode: 400, message: `Task is in ${task.status} state` };
    }

    task.status = 'completed';
    task.result = result.result || result.summary || null;
    task.completedAt = Date.now();
    this._decrementRunning(task.agentId);
    this._save();

    this.emit('task:completed', { task });
    console.log(`[TaskQueue] Task completed: ${task.title} (${task.id})`);

    // Check if agent has more queued tasks
    this._tryDispatch(task.agentId);

    return task;
  }

  /**
   * Agent reports task failure
   */
  fail(taskId, error = {}) {
    const task = this.tasks.get(taskId);
    if (!task) throw { statusCode: 404, message: 'Task not found' };
    if (!['running', 'dispatched'].includes(task.status)) {
      throw { statusCode: 400, message: `Task is in ${task.status} state` };
    }

    task.error = typeof error === 'string' ? error : (error.error || error.message || 'Unknown error');
    this._decrementRunning(task.agentId);

    // Retry logic
    if (task.attempt < task.maxAttempts) {
      task.attempt++;
      task.status = 'queued';
      task.dispatchedAt = null;
      task.startedAt = null;
      this._save();

      this.emit('task:retried', { task });
      console.log(`[TaskQueue] Task retry (${task.attempt}/${task.maxAttempts}): ${task.title}`);

      // Re-dispatch after retry
      this._tryDispatch(task.agentId);
    } else {
      task.status = 'failed';
      task.completedAt = Date.now();
      this._save();

      this.emit('task:failed', { task });
      console.log(`[TaskQueue] Task failed: ${task.title} (${task.id}) — ${task.error}`);

      // Check for more tasks
      this._tryDispatch(task.agentId);
    }

    return task;
  }

  /**
   * Agent reports progress
   */
  updateProgress(taskId, progress) {
    const task = this.tasks.get(taskId);
    if (!task) throw { statusCode: 404, message: 'Task not found' };
    if (task.status !== 'running') {
      throw { statusCode: 400, message: 'Task is not running' };
    }

    task.progress = {
      step: progress.step || 0,
      total: progress.total || 0,
      summary: progress.summary || '',
      updatedAt: Date.now(),
    };
    this._save();

    this.emit('task:progress', { task, progress: task.progress });
    return task;
  }

  // ===== Auto-dispatch =====

  /**
   * Try to dispatch queued tasks to an agent
   * Only dispatches if ChatRoom confirms agent is available
   */
  _tryDispatch(agentId) {
    if (!agentId) return;

    // Require ChatRoom to verify agent availability
    if (!this._chatRoom) return;

    const agent = this._chatRoom.getAgent(agentId);
    if (!agent || agent.status === 'away' || agent.status === 'meeting') return;

    const maxConcurrent = this._getMaxConcurrent(agentId);
    const current = this._runningCount.get(agentId) || 0;
    const available = maxConcurrent - current;

    if (available <= 0) return;

    // Find queued tasks for this agent
    let dispatched = 0;
    for (const task of this.tasks.values()) {
      if (dispatched >= available) break;
      if (task.status !== 'queued') continue;
      if (task.agentId !== agentId) continue;

      this._dispatchTask(task);
      dispatched++;
    }
  }

  /**
   * Dispatch a single task to its assigned agent
   */
  _dispatchTask(task) {
    task.status = 'dispatched';
    task.dispatchedAt = Date.now();
    this._incrementRunning(task.agentId);
    this._save();

    this.emit('task:dispatched', { task });
    console.log(`[TaskQueue] Dispatched task: ${task.title} → ${task.agentId}`);

    // Update agent status to working
    if (this._chatRoom) {
      this._chatRoom.updateStatus(task.agentId, 'working', {
        task: task.title,
        metadata: { taskId: task.id },
      });
    }

    // Route task message through MessageRouter if available
    if (this._messageRouter) {
      this._messageRouter.routeMessage({
        agentId: 'system',
        content: `[Task] ${task.title}`,
        type: 'task',
        targetAgentId: task.agentId,
        metadata: { taskId: task.id, taskTitle: task.title },
      }).catch(err => {
        console.warn(`[TaskQueue] Failed to route task message: ${err.message}`);
      });
    }

    return task;
  }

  // ===== Concurrency tracking =====

  _incrementRunning(agentId) {
    this._runningCount.set(agentId, (this._runningCount.get(agentId) || 0) + 1);
  }

  _decrementRunning(agentId) {
    const count = this._runningCount.get(agentId) || 0;
    if (count <= 1) {
      this._runningCount.delete(agentId);
    } else {
      this._runningCount.set(agentId, count - 1);
    }
  }

  // ===== Stats =====

  getStats() {
    const byStatus = {};
    const byAgent = {};

    for (const task of this.tasks.values()) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;
      if (task.agentId) {
        byAgent[task.agentId] = (byAgent[task.agentId] || 0) + 1;
      }
    }

    return {
      total: this.tasks.size,
      byStatus,
      byAgent,
      runningCounts: Object.fromEntries(this._runningCount),
    };
  }

  /**
   * Called when agent status changes in ChatRoom.
   * Auto-dispatch when agent becomes idle.
   */
  onAgentStatus(agentId, status) {
    if (status === 'idle') {
      this._tryDispatch(agentId);
    }
  }
}

export { VALID_TASK_STATUSES };
export default TaskQueue;
