import { query, queryOne } from "../db/client.js";

export interface AgentOutput {
  id: string;
  project_id?: string;
  session_id?: string;
  source: string;
  direction: string;
  title: string;
  content: string;
  summary?: string;
  tags: string[];
  parent_id?: string;
  created_at: string;
}

export interface CreateOutputInput {
  project_id?: string;
  session_id?: string;
  source: string;
  direction: string;
  title: string;
  content: string;
  summary?: string;
  tags?: string[];
  parent_id?: string;
}

export interface OutputFilter {
  project_id?: string;
  source?: string;
  direction?: string;
  since?: string;
  limit?: number;
}

export async function createOutput(input: CreateOutputInput): Promise<AgentOutput> {
  const row = await queryOne<AgentOutput>(
    `INSERT INTO agent_outputs (project_id, session_id, source, direction, title, content, summary, tags, parent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.project_id || null,
      input.session_id || null,
      input.source,
      input.direction,
      input.title,
      input.content,
      input.summary || null,
      JSON.stringify(input.tags || []),
      input.parent_id || null,
    ],
  );
  return row!;
}

export async function getOutput(id: string): Promise<AgentOutput | null> {
  return queryOne<AgentOutput>("SELECT * FROM agent_outputs WHERE id = $1", [id]);
}

export async function listOutputs(filter: OutputFilter = {}): Promise<AgentOutput[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filter.project_id) {
    conditions.push(`project_id = $${idx++}`);
    params.push(filter.project_id);
  }
  if (filter.source) {
    conditions.push(`source = $${idx++}`);
    params.push(filter.source);
  }
  if (filter.direction) {
    conditions.push(`direction = $${idx++}`);
    params.push(filter.direction);
  }
  if (filter.since) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(filter.since);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit || 50;

  return query<AgentOutput>(
    `SELECT * FROM agent_outputs ${where} ORDER BY created_at DESC LIMIT ${limit}`,
    params,
  );
}

export async function getOutputTimeline(projectId?: string, limit = 100): Promise<AgentOutput[]> {
  if (projectId) {
    return query<AgentOutput>(
      "SELECT * FROM agent_outputs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2",
      [projectId, limit],
    );
  }
  return query<AgentOutput>(
    "SELECT * FROM agent_outputs ORDER BY created_at DESC LIMIT $1",
    [limit],
  );
}
