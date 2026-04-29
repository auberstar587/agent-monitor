import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TaskQueue } from '../../src/services/task-queue.js';
import { ChatRoom } from '../../src/services/chat-room.js';
import fs from 'fs';
import path from 'path';

// Use a temp file for test persistence
const testDataFile = path.join(import.meta.dirname, '..', '.test-tasks.json');

function createQueue() {
  const q = new TaskQueue();
  q._dataFile = testDataFile;
  return q;
}

describe('TaskQueue', () => {
  beforeEach(() => {
    // Clean up test data
    try { fs.unlinkSync(testDataFile); } catch {}
  });

  describe('create', () => {
    it('creates a task with required fields', () => {
      const q = createQueue();
      const task = q.create({ title: 'Test task', agentId: 'agent-1' });
      assert.equal(task.title, 'Test task');
      assert.equal(task.agentId, 'agent-1');
      assert.equal(task.status, 'queued');
      assert.equal(task.priority, 0);
      assert.ok(task.id);
      assert.ok(task.createdAt);
    });

    it('rejects empty title', () => {
      const q = createQueue();
      assert.throws(() => q.create({}), { message: 'title is required' });
    });
  });

  describe('claimNext', () => {
    it('claims highest priority task for agent', () => {
      const q = createQueue();
      q.create({ title: 'Low priority', agentId: 'a1', priority: 1 });
      q.create({ title: 'High priority', agentId: 'a1', priority: 10 });

      const task = q.claimNext('a1');
      assert.equal(task.title, 'High priority');
      assert.equal(task.status, 'dispatched');
    });

    it('claims unassigned tasks', () => {
      const q = createQueue();
      q.create({ title: 'Unassigned task' });

      const task = q.claimNext('a1');
      assert.equal(task.title, 'Unassigned task');
      assert.equal(task.agentId, 'a1');
    });

    it('respects concurrency limit', () => {
      const q = createQueue();
      const cr = new ChatRoom();
      cr.join('a1', { metadata: { maxConcurrentTasks: 1 } });
      q.setChatRoom(cr);

      // Create without agentId to avoid auto-dispatch
      q.create({ title: 'Task 1' });
      q.create({ title: 'Task 2' });

      const t1 = q.claimNext('a1');
      assert.equal(t1.title, 'Task 1');

      const t2 = q.claimNext('a1');
      assert.equal(t2, null); // concurrency limit reached
    });
  });

  describe('lifecycle', () => {
    it('full lifecycle: create → claim → start → complete', () => {
      const q = createQueue();
      const events = [];
      q.on('task:created', e => events.push({ type: 'created', id: e.task.id }));
      q.on('task:dispatched', e => events.push({ type: 'dispatched' }));
      q.on('task:started', e => events.push({ type: 'started' }));
      q.on('task:completed', e => events.push({ type: 'completed' }));

      const task = q.create({ title: 'Full cycle', agentId: 'a1' });
      assert.equal(events[0].type, 'created');

      const claimed = q.claimNext('a1');
      assert.equal(claimed.status, 'dispatched');
      assert.equal(events[1].type, 'dispatched');

      const started = q.start(claimed.id);
      assert.equal(started.status, 'running');
      assert.equal(events[2].type, 'started');

      const completed = q.complete(claimed.id, { result: 'Done!' });
      assert.equal(completed.status, 'completed');
      assert.equal(completed.result, 'Done!');
      assert.equal(events[3].type, 'completed');
    });

    it('handles failure with retry', () => {
      const q = createQueue();
      q.create({ title: 'Retry test', agentId: 'a1', maxAttempts: 3 });

      const t1 = q.claimNext('a1');
      q.start(t1.id);

      const failed = q.fail(t1.id, 'timeout');
      assert.equal(failed.status, 'queued');
      assert.equal(failed.attempt, 2);
    });

    it('exhausts retries and marks failed', () => {
      const q = createQueue();
      q.create({ title: 'Max retry', agentId: 'a1', maxAttempts: 1 });

      const t1 = q.claimNext('a1');
      q.start(t1.id);

      const failed = q.fail(t1.id, 'fatal error');
      assert.equal(failed.status, 'failed');
      assert.equal(failed.error, 'fatal error');
    });

    it('updates progress', () => {
      const q = createQueue();
      q.create({ title: 'Progress test', agentId: 'a1' });
      const t = q.claimNext('a1');
      q.start(t.id);

      const updated = q.updateProgress(t.id, { step: 2, total: 5, summary: 'Working...' });
      assert.equal(updated.progress.step, 2);
      assert.equal(updated.progress.summary, 'Working...');
    });
  });

  describe('cancel', () => {
    it('cancels a queued task', () => {
      const q = createQueue();
      const task = q.create({ title: 'Cancel me' });
      const cancelled = q.cancel(task.id);
      assert.equal(cancelled.status, 'cancelled');
    });

    it('rejects cancelling completed task', () => {
      const q = createQueue();
      q.create({ title: 'Done', agentId: 'a1' });
      const t = q.claimNext('a1');
      q.start(t.id);
      q.complete(t.id);

      assert.throws(() => q.cancel(t.id), { message: /completed/ });
    });
  });

  describe('auto-dispatch', () => {
    it('dispatches when agent becomes idle', () => {
      const q = createQueue();
      const cr = new ChatRoom();
      cr.join('a1', { status: 'idle' });
      q.setChatRoom(cr);

      q.create({ title: 'Auto task', agentId: 'a1' });

      // Simulate agent becoming idle
      q.onAgentStatus('a1', 'idle');

      const tasks = q.getAll();
      assert.equal(tasks[0].status, 'dispatched');
    });

    it('does not dispatch when agent is away', () => {
      const q = createQueue();
      const cr = new ChatRoom();
      cr.join('a1', { status: 'away' });
      q.setChatRoom(cr);

      q.create({ title: 'Wait task', agentId: 'a1' });
      q.onAgentStatus('a1', 'idle'); // agent is away in ChatRoom

      const tasks = q.getAll();
      assert.equal(tasks[0].status, 'queued');
    });
  });

  describe('persistence', () => {
    it('persists and loads tasks', () => {
      const q1 = createQueue();
      q1.create({ title: 'Persist test', agentId: 'a1' });

      // Load into new instance
      const q2 = createQueue();
      q2.load();
      assert.equal(q2.tasks.size, 1);

      const loaded = q2.getAll()[0];
      assert.equal(loaded.title, 'Persist test');
    });
  });

  describe('getStats', () => {
    it('returns correct stats', () => {
      const q = createQueue();
      q.create({ title: 'T1', agentId: 'a1' });
      q.create({ title: 'T2', agentId: 'a2' });

      const stats = q.getStats();
      assert.equal(stats.total, 2);
      assert.equal(stats.byStatus.queued, 2);
      assert.equal(stats.byAgent.a1, 1);
      assert.equal(stats.byAgent.a2, 1);
    });
  });

  describe('getAll with filters', () => {
    it('filters by agentId and status', () => {
      const q = createQueue();
      q.create({ title: 'T1', agentId: 'a1' });
      q.create({ title: 'T2', agentId: 'a2' });

      const filtered = q.getAll({ agentId: 'a1' });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].title, 'T1');
    });
  });
});
