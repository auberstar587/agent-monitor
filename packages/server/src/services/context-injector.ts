import { query, queryOne } from "../db/client.js";

export interface ProjectContext {
  project: {
    name: string;
    path: string;
    description?: string;
    goals: string[];
    tech_stack: string[];
    status: string;
  } | null;
  relations: Array<{
    target: string;
    type: string;
    description?: string;
  }>;
  recentDecisions: Array<{
    content: string;
    source?: string;
    created_at: string;
  }>;
  relatedOutputs: Array<{
    source: string;
    title: string;
    direction: string;
    created_at: string;
  }>;
}

export async function buildContext(projectId: string): Promise<ProjectContext> {
  // Project info
  const project = await queryOne<{
    name: string; path: string; description?: string;
    goals: string[]; tech_stack: string[]; status: string;
  }>("SELECT name, path, description, goals, tech_stack, status FROM local_projects WHERE id = $1", [projectId]);

  // Relations
  const relations = await query<{ target: string; type: string; description?: string }>(
    `SELECT pr.relation_type as type, pr.description, lp.name as target
     FROM project_relations pr
     JOIN local_projects lp ON pr.target_id = lp.id
     WHERE pr.source_id = $1`,
    [projectId],
  );

  // Recent decisions (from shared_memory)
  const recentDecisions = await query<{ content: string; source?: string; created_at: string }>(
    `SELECT content, source, created_at
     FROM shared_memory
     WHERE (project_id = $1 OR project_id IS NULL) AND type = 'decision' AND status = 'active'
     ORDER BY importance DESC, created_at DESC LIMIT 10`,
    [projectId],
  );

  // Related outputs
  const relatedOutputs = await query<{ source: string; title: string; direction: string; created_at: string }>(
    `SELECT source, title, direction, created_at
     FROM agent_outputs
     WHERE project_id = $1
     ORDER BY created_at DESC LIMIT 5`,
    [projectId],
  );

  return {
    project: project || null,
    relations,
    recentDecisions,
    relatedOutputs,
  };
}
