import { query, queryOne } from "../db/client.js";

export interface SharedMemory {
  id: string;
  project_id?: string;
  scope: string;
  type: string;
  key?: string;
  content: string;
  source?: string;
  importance: number;
  status: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  retrieved_at?: string;
}

export interface CreateMemoryInput {
  project_id?: string;
  scope?: string;
  type: string;
  key?: string;
  content: string;
  source?: string;
  importance?: number;
  tags?: string[];
}

export async function createMemory(input: CreateMemoryInput): Promise<SharedMemory> {
  const row = await queryOne<SharedMemory>(
    `INSERT INTO shared_memory (project_id, scope, type, key, content, source, importance, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.project_id || null,
      input.scope || "project",
      input.type,
      input.key || null,
      input.content,
      input.source || null,
      input.importance || 5,
      JSON.stringify(input.tags || []),
    ],
  );
  return row!;
}

export async function getMemory(id: string): Promise<SharedMemory | null> {
  await query("UPDATE shared_memory SET retrieved_at = now() WHERE id = $1", [id]);
  return queryOne<SharedMemory>("SELECT * FROM shared_memory WHERE id = $1", [id]);
}

export async function searchMemory(
  q: string,
  options?: { project_id?: string; scope?: string; type?: string; limit?: number },
): Promise<SharedMemory[]> {
  const conditions = [
    "status = 'active'",
    "(to_tsvector('simple', content) @@ to_tsquery('simple', $1) OR content ILIKE '%' || $1 || '%')",
  ];
  const params: unknown[] = [q];
  let idx = 2;

  if (options?.project_id) {
    conditions.push(`project_id = $${idx++}`);
    params.push(options.project_id);
  }
  if (options?.scope) {
    conditions.push(`scope = $${idx++}`);
    params.push(options.scope);
  }
  if (options?.type) {
    conditions.push(`type = $${idx++}`);
    params.push(options.type);
  }

  const limit = options?.limit || 20;

  return query<SharedMemory>(
    `SELECT * FROM shared_memory WHERE ${conditions.join(" AND ")} ORDER BY importance DESC, updated_at DESC LIMIT ${limit}`,
    params,
  );
}

export async function listMemory(options?: { project_id?: string; scope?: string; limit?: number }): Promise<SharedMemory[]> {
  const conditions = ["status = 'active'"];
  const params: unknown[] = [];
  let idx = 1;

  if (options?.project_id) {
    conditions.push(`project_id = $${idx++}`);
    params.push(options.project_id);
  }
  if (options?.scope) {
    conditions.push(`scope = $${idx++}`);
    params.push(options.scope);
  }

  const limit = options?.limit || 50;

  return query<SharedMemory>(
    `SELECT * FROM shared_memory WHERE ${conditions.join(" AND ")} ORDER BY importance DESC, updated_at DESC LIMIT ${limit}`,
    params,
  );
}

export async function deleteMemory(id: string): Promise<boolean> {
  const result = await query("UPDATE shared_memory SET status = 'archived', updated_at = now() WHERE id = $1 RETURNING id", [id]);
  return result.length > 0;
}

export async function updateMemory(
  id: string,
  patch: { content?: string; importance?: number; status?: string; tags?: string[] },
): Promise<SharedMemory | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (patch.content !== undefined)    { fields.push(`content = $${idx++}`);    params.push(patch.content); }
  if (patch.importance !== undefined) { fields.push(`importance = $${idx++}`); params.push(patch.importance); }
  if (patch.status !== undefined)     { fields.push(`status = $${idx++}`);     params.push(patch.status); }
  if (patch.tags !== undefined)       { fields.push(`tags = $${idx++}::jsonb`); params.push(JSON.stringify(patch.tags)); }
  if (fields.length === 0) return getMemory(id);
  fields.push(`updated_at = now()`);
  params.push(id);
  return queryOne<SharedMemory>(
    `UPDATE shared_memory SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    params,
  );
}

// --- Dream Mode ---

export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  byImportance: { low: number; medium: number; high: number };
  avgImportance: number;
  active: number;
  archived: number;
}

export async function memoryStats(): Promise<MemoryStats> {
  const rows = await query<{ type: string; count: string }>(
    "SELECT type, COUNT(*)::text as count FROM shared_memory WHERE status = 'active' GROUP BY type",
  );
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.type] = parseInt(r.count, 10);

  const all = await query<{ importance: number; status: string }>(
    "SELECT importance, status FROM shared_memory",
  );

  const byImportance = { low: 0, medium: 0, high: 0 };
  let totalImp = 0;
  let active = 0;
  let archived = 0;

  for (const r of all) {
    totalImp += r.importance;
    if (r.status === 'active') active++;
    else if (r.status === 'archived') archived++;
    if (r.importance <= 3) byImportance.low++;
    else if (r.importance <= 6) byImportance.medium++;
    else byImportance.high++;
  }

  return {
    total: all.length,
    byType,
    byImportance,
    avgImportance: all.length > 0 ? Math.round((totalImp / all.length) * 10) / 10 : 0,
    active,
    archived,
  };
}

export async function dreamConsolidation(): Promise<{ merged: number; archived: number; degraded: number }> {
  console.log('[Memory] Dream consolidation started...');
  let merged = 0;
  let archived = 0;
  let degraded = 0;

  // Step 1: Find similar memories via ILIKE
  const memories = await query<SharedMemory>(
    "SELECT * FROM shared_memory WHERE status = 'active' ORDER BY importance DESC, created_at DESC",
  );

  for (let i = 0; i < memories.length; i++) {
    const m1 = memories[i];
    if (m1.status !== 'active') continue;

    // Split content into keywords (skip short ones)
    const words = m1.content.split(/\s+/).filter(w => w.length > 4);
    if (words.length === 0) continue;

    // Find similar memories sharing at least 2 long keywords
    const similarIds: string[] = [];
    for (let j = i + 1; j < memories.length; j++) {
      const m2 = memories[j];
      if (m2.status !== 'active') continue;
      const matchCount = words.filter(w => m2.content.includes(w)).length;
      if (matchCount >= 2) {
        similarIds.push(m2.id);
      }
    }

    if (similarIds.length > 0) {
      // Merge: keep the highest importance one, archive others
      const toArchive = similarIds.filter(id => id !== m1.id);
      for (const id of toArchive.slice(0, 10)) {
        await query(
          "UPDATE shared_memory SET status = 'archived', updated_at = now() WHERE id = $1 AND status = 'active'",
          [id],
        );
        merged++;
      }
    }
  }

  // Step 2: Degrade memories not retrieved in 30+ days with importance < 5
  const degradedRows = await query(
    `UPDATE shared_memory
     SET importance = GREATEST(1, importance - 1), updated_at = now()
     WHERE (retrieved_at IS NULL OR retrieved_at < now() - interval '30 days')
       AND importance < 5 AND importance > 1 AND status = 'active'
     RETURNING id`,
  );
  degraded = degradedRows.length;

  // Step 3: Archive importance-1 memories that are > 7 days old
  const archivedRows = await query(
    `UPDATE shared_memory
     SET status = 'archived', updated_at = now()
     WHERE importance <= 1 AND status = 'active'
       AND created_at < now() - interval '7 days'
     RETURNING id`,
  );
  archived = archivedRows.length;

  console.log(`[Memory] Dream done: merged=${merged}, degraded=${degraded}, archived=${archived}`);
  return { merged, archived, degraded };
}
