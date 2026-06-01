import fs from "fs";
import path from "path";
import { query, queryOne, execute } from "../db/client.js";

export interface LocalProject {
  id: string;
  name: string;
  path: string;
  description?: string;
  tech_stack: string[];
  goals: string[];
  status: string;
  source: string;
  last_activity?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRelation {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  description?: string;
}

export async function registerProject(
  projectPath: string,
  name?: string,
  description?: string,
): Promise<LocalProject> {
  const resolved = path.resolve(projectPath);

  const existing = await queryOne<LocalProject>(
    "SELECT * FROM local_projects WHERE path = $1",
    [resolved],
  );
  if (existing) {
    if (name && name !== existing.name) {
      await query("UPDATE local_projects SET name = $1, updated_at = now() WHERE id = $2", [
        name,
        existing.id,
      ]);
      existing.name = name;
    }
    return existing;
  }

  const detected = detectProjectMeta(resolved);
  const projectName = name || detected.name || path.basename(resolved);

  const row = await queryOne<LocalProject>(
    `INSERT INTO local_projects (name, path, description, tech_stack, goals, status, source, last_activity)
     VALUES ($1, $2, $3, $4, '[]'::jsonb, 'active', 'manual', now())
     RETURNING *`,
    [projectName, resolved, description || detected.description || null, JSON.stringify(detected.techStack)],
  );

  return row!;
}

export async function listProjects(status?: string): Promise<LocalProject[]> {
  if (status) {
    return query<LocalProject>("SELECT * FROM local_projects WHERE status = $1 ORDER BY updated_at DESC", [status]);
  }
  return query<LocalProject>("SELECT * FROM local_projects ORDER BY updated_at DESC");
}

export async function getProject(id: string): Promise<LocalProject | null> {
  return queryOne<LocalProject>("SELECT * FROM local_projects WHERE id = $1", [id]);
}

export async function updateProject(
  id: string,
  updates: Partial<Pick<LocalProject, "name" | "description" | "tech_stack" | "goals" | "status">>,
): Promise<LocalProject | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.name !== undefined) { sets.push(`name = $${idx++}`); params.push(updates.name); }
  if (updates.description !== undefined) { sets.push(`description = $${idx++}`); params.push(updates.description); }
  if (updates.tech_stack !== undefined) { sets.push(`tech_stack = $${idx++}::jsonb`); params.push(JSON.stringify(updates.tech_stack)); }
  if (updates.goals !== undefined) { sets.push(`goals = $${idx++}::jsonb`); params.push(JSON.stringify(updates.goals)); }
  if (updates.status !== undefined) { sets.push(`status = $${idx++}`); params.push(updates.status); }

  if (sets.length === 0) return getProject(id);
  sets.push("updated_at = now()");
  params.push(id);

  return queryOne<LocalProject>(
    `UPDATE local_projects SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params,
  );
}

export async function deleteProject(id: string): Promise<boolean> {
  const result = await execute("DELETE FROM local_projects WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function addRelation(
  sourceId: string,
  targetId: string,
  relationType: string,
  description?: string,
): Promise<ProjectRelation> {
  const row = await queryOne<ProjectRelation>(
    `INSERT INTO project_relations (source_id, target_id, relation_type, description)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_id, target_id, relation_type) DO UPDATE SET description = EXCLUDED.description
     RETURNING *`,
    [sourceId, targetId, relationType, description || null],
  );
  return row!;
}

export async function getRelations(projectId: string): Promise<ProjectRelation[]> {
  return query<ProjectRelation>(
    "SELECT * FROM project_relations WHERE source_id = $1 OR target_id = $1",
    [projectId],
  );
}

export async function removeRelation(id: string): Promise<boolean> {
  const result = await execute("DELETE FROM project_relations WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

function detectProjectMeta(projectPath: string): { name?: string; description?: string; techStack: string[] } {
  const techStack: string[] = [];

  if (fs.existsSync(path.join(projectPath, "package.json"))) {
    techStack.push("Node.js");
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
      if (pkg.name) return { name: pkg.name, description: pkg.description, techStack };
    } catch { /* ignore */ }
  }

  if (fs.existsSync(path.join(projectPath, "go.mod"))) {
    techStack.push("Go");
    try {
      const mod = fs.readFileSync(path.join(projectPath, "go.mod"), "utf-8");
      const match = mod.match(/^module\s+(.+)$/m);
      if (match) return { name: path.basename(match[1]), techStack };
    } catch { /* ignore */ }
  }

  if (fs.existsSync(path.join(projectPath, "Cargo.toml"))) techStack.push("Rust");
  if (fs.existsSync(path.join(projectPath, "pyproject.toml"))) techStack.push("Python");
  if (fs.existsSync(path.join(projectPath, "requirements.txt"))) techStack.push("Python");

  return { techStack };
}
