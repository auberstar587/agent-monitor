import { Cron } from 'croner';
import { query } from '../db/client.js';
import { runBlueprint } from './blueprint-engine.js';

// In-memory job registry
const jobs = new Map<string, Cron>();

export interface ScheduledJob {
  id: string;
  blueprintId: string;
  blueprintName: string;
  cronExpression: string;
  nextRun: string;
  status: string;
}

/**
 * Load all cron-triggered blueprints from DB and register in-memory jobs.
 * Call on server startup.
 */
export async function initScheduler(): Promise<void> {
  const blueprints = await query<{ id: string; name: string; trigger_config: any }>(
    `SELECT id, name, trigger_config FROM blueprints
     WHERE trigger_type = 'cron' AND status = 'active'`,
  );

  for (const bp of blueprints) {
    const cfg = typeof bp.trigger_config === 'string' ? JSON.parse(bp.trigger_config) : bp.trigger_config;
    if (cfg?.cron) {
      registerJob(bp.id, bp.name, cfg.cron);
      console.log(`[Scheduler] Registered ${bp.name}: "${cfg.cron}"`);
    }
  }

  console.log(`[Scheduler] Loaded ${jobs.size} scheduled blueprints`);
}

/**
 * Schedule a blueprint with a cron expression.
 * Persists to blueprints.trigger_type + trigger_config.
 */
export async function scheduleBlueprint(
  blueprintId: string,
  cronExpression: string,
): Promise<ScheduledJob> {
  const bp = await query<{ id: string; name: string }>(
    `SELECT id, name FROM blueprints WHERE id = $1`,
    [blueprintId],
  );
  if (bp.length === 0) throw new Error('Blueprint not found');

  // Persist (set status to active so listScheduled can find it)
  await query(
    `UPDATE blueprints
     SET trigger_type = 'cron', trigger_config = $1::jsonb, status = 'active', updated_at = now()
     WHERE id = $2`,
    [JSON.stringify({ cron: cronExpression }), blueprintId],
  );

  registerJob(blueprintId, bp[0].name, cronExpression);

  return getJobInfo(blueprintId, bp[0].name, cronExpression);
}

/**
 * Unschedule a blueprint.
 */
export async function unscheduleBlueprint(blueprintId: string): Promise<void> {
  const existing = jobs.get(blueprintId);
  if (existing) {
    existing.stop();
    jobs.delete(blueprintId);
  }

  await query(
    `UPDATE blueprints
     SET trigger_type = 'manual', trigger_config = '{}'::jsonb, updated_at = now()
     WHERE id = $1`,
    [blueprintId],
  );
}

/**
 * List all scheduled jobs.
 */
export async function listScheduled(): Promise<ScheduledJob[]> {
  const blueprints = await query<{ id: string; name: string; trigger_config: any }>(
    `SELECT id, name, trigger_config FROM blueprints
     WHERE trigger_type = 'cron' AND status = 'active'
     ORDER BY name`,
  );

  return blueprints.map((bp) => {
    const cfg = typeof bp.trigger_config === 'string' ? JSON.parse(bp.trigger_config) : bp.trigger_config;
    return getJobInfo(bp.id, bp.name, cfg?.cron || '');
  });
}

function registerJob(blueprintId: string, name: string, cronExpression: string): void {
  // Remove existing if any
  const existing = jobs.get(blueprintId);
  if (existing) existing.stop();

  const job = new Cron(cronExpression, () => {
    console.log(`[Scheduler] Triggering ${name} (${blueprintId})`);
    runBlueprint(blueprintId).catch((err) => {
      console.error(`[Scheduler] ${name} run failed:`, err.message);
    });
  });

  jobs.set(blueprintId, job);
}

function getJobInfo(blueprintId: string, blueprintName: string, cronExpression: string): ScheduledJob {
  const job = jobs.get(blueprintId);
  const nextRun = job?.nextRun()?.toISOString() || '';
  return {
    id: blueprintId,
    blueprintId,
    blueprintName,
    cronExpression,
    nextRun,
    status: job ? 'active' : 'stopped',
  };
}

/**
 * Stop all scheduled jobs (for graceful shutdown).
 */
export function stopAllSchedulers(): void {
  for (const [id, job] of jobs) {
    job.stop();
    jobs.delete(id);
  }
  console.log('[Scheduler] All jobs stopped');
}
