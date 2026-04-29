import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ProjectManager - 项目管理核心服务
 *
 * 管理项目的 CRUD 操作，数据持久化到 src/data/projects.json
 * 项目状态根据关联 Agent 的状态汇总计算。
 *
 * 事件:
 * - 'project:created' — 项目创建
 * - 'project:updated' — 项目更新
 * - 'project:deleted' — 项目删除
 */

// Valid project types (固定模板)
const VALID_TYPES = ['chat', 'tool', 'coding', 'research', 'creative'];

// Valid models (固定模板)
const VALID_MODELS = ['qwen2.5', 'deepseek', 'gpt-4', 'glm-4', 'glm-5.1', 'MiniMax-M2.7', 'GLM-4.7-Flash'];

// Agent statuses that count as "active"
const ACTIVE_AGENT_STATUSES = ['idle', 'working', 'meeting', 'speaking'];

export class ProjectManager extends EventEmitter {
  constructor(chatRoom = null) {
    super();

    // Projects storage: Map<projectId, Project>
    this.projects = new Map();

    // Reference to ChatRoom for agent status lookup
    this._chatRoom = null;
    if (chatRoom) {
      this.setChatRoom(chatRoom);
    }

    // Data file path (src/data/projects.json relative to project root)
    this._dataDir = path.join(__dirname, '..', 'data');
    this._dataFile = path.join(this._dataDir, 'projects.json');

    // Ensure data directory exists
    this._ensureDataDir();
  }

  /**
   * Set ChatRoom reference for agent status lookup
   * @param {ChatRoom} chatRoom
   */
  setChatRoom(chatRoom) {
    this._chatRoom = chatRoom;
  }

  /**
   * Ensure data directory exists
   */
  _ensureDataDir() {
    if (!fs.existsSync(this._dataDir)) {
      fs.mkdirSync(this._dataDir, { recursive: true });
      console.log(`[ProjectManager] Created data directory: ${this._dataDir}`);
    }
  }

  /**
   * Load projects from file
   */
  load() {
    try {
      if (fs.existsSync(this._dataFile)) {
        const raw = fs.readFileSync(this._dataFile, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.projects.clear();
          for (const p of data) {
            this.projects.set(p.id, p);
          }
          console.log(`[ProjectManager] Loaded ${this.projects.size} projects from ${this._dataFile}`);
        }
      } else {
        console.log(`[ProjectManager] No data file found at ${this._dataFile}, starting fresh`);
      }
    } catch (err) {
      console.warn(`[ProjectManager] Failed to load projects: ${err.message}`);
    }
  }

  /**
   * Save projects to file
   */
  _save() {
    try {
      const data = Array.from(this.projects.values());
      fs.writeFileSync(this._dataFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[ProjectManager] Failed to save projects: ${err.message}`);
    }
  }

  /**
   * Generate a unique project ID
   * @returns {string}
   */
  _generateId() {
    return 'proj_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  /**
   * Validate project data
   * @param {object} data
   * @param {boolean} isUpdate - If true, fields are optional
   * @returns {{ valid: boolean, errors: string[] }}
   */
  _validate(data, isUpdate = false) {
    const errors = [];

    if (!isUpdate) {
      if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
        errors.push('name is required and must be a non-empty string');
      }
    }

    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || data.name.trim() === '') {
        errors.push('name must be a non-empty string');
      }
    }

    if (data.type !== undefined && !VALID_TYPES.includes(data.type)) {
      errors.push(`type must be one of: ${VALID_TYPES.join(', ')}`);
    }

    if (data.model !== undefined && !VALID_MODELS.includes(data.model)) {
      errors.push(`model must be one of: ${VALID_MODELS.join(', ')}`);
    }

    if (data.agentId !== undefined && typeof data.agentId !== 'string') {
      errors.push('agentId must be a string');
    }

    if (data.path !== undefined && typeof data.path !== 'string') {
      errors.push('path must be a string');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get project status based on associated agent status
   * @param {object} project
   * @returns {'active' | 'inactive'}
   */
  _getProjectStatus(project) {
    if (!project.agentId || !this._chatRoom) {
      return 'inactive';
    }
    const agent = this._chatRoom.getAgent(project.agentId);
    if (!agent) {
      return 'inactive';
    }
    return ACTIVE_AGENT_STATUSES.includes(agent.status) ? 'active' : 'inactive';
  }

  /**
   * Enrich project with computed fields
   * @param {object} project
   * @returns {object}
   */
  _enrichProject(project) {
    let agentStatus = 'away';
    let agentName = null;

    if (project.agentId && this._chatRoom) {
      const agent = this._chatRoom.getAgent(project.agentId);
      if (agent) {
        agentStatus = agent.status;
        agentName = agent.agentName;
      }
    }

    const status = ACTIVE_AGENT_STATUSES.includes(agentStatus) ? 'active' : 'inactive';

    return {
      ...project,
      status,
      agentStatus,
      agentName,
      port: project.port || 0,
    };
  }

  /**
   * Create a new project
   * @param {object} data - { name, path, agentId, type, model }
   * @returns {object} created project
   */
  create(data) {
    const validation = this._validate(data, false);
    if (!validation.valid) {
      throw { statusCode: 400, message: validation.errors.join('; ') };
    }

    const now = Date.now();
    const project = {
      id: this._generateId(),
      name: data.name.trim(),
      path: data.path?.trim() || '',
      agentId: data.agentId || '',
      type: data.type || 'chat',
      model: data.model || 'qwen2.5',
      port: data.port ? parseInt(data.port, 10) || 0 : 0,
      createdAt: now,
      updatedAt: now,
    };

    this.projects.set(project.id, project);
    this._save();
    this.emit('project:created', { project });

    console.log(`[ProjectManager] Created project: ${project.name} (${project.id})`);
    return this._enrichProject(project);
  }

  /**
   * Get all projects
   * @returns {object[]} array of projects with computed status
   */
  getAll() {
    return Array.from(this.projects.values()).map((p) => this._enrichProject(p));
  }

  /**
   * Get a single project by ID
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    const project = this.projects.get(id);
    if (!project) {
      return null;
    }
    return this._enrichProject(project);
  }

  /**
   * Update a project
   * @param {string} id
   * @param {object} data - fields to update
   * @returns {object|null} updated project
   */
  update(id, data) {
    const project = this.projects.get(id);
    if (!project) {
      return null;
    }

    const validation = this._validate(data, true);
    if (!validation.valid) {
      throw { statusCode: 400, message: validation.errors.join('; ') };
    }

    // Apply updates
    if (data.name !== undefined) project.name = data.name.trim();
    if (data.path !== undefined) project.path = data.path.trim();
    if (data.agentId !== undefined) project.agentId = data.agentId;
    if (data.type !== undefined) project.type = data.type;
    if (data.model !== undefined) project.model = data.model;
    if (data.port !== undefined) project.port = parseInt(data.port, 10) || 0;

    project.updatedAt = Date.now();
    this._save();
    this.emit('project:updated', { project });

    console.log(`[ProjectManager] Updated project: ${project.name} (${project.id})`);
    return this._enrichProject(project);
  }

  /**
   * Delete a project
   * @param {string} id
   * @returns {boolean} true if deleted
   */
  delete(id) {
    const project = this.projects.get(id);
    if (!project) {
      return false;
    }

    this.projects.delete(id);
    this._save();
    this.emit('project:deleted', { project });

    console.log(`[ProjectManager] Deleted project: ${project.name} (${project.id})`);
    return true;
  }

  /**
   * Get projects by agent ID
   * @param {string} agentId
   * @returns {object[]}
   */
  getByAgent(agentId) {
    return Array.from(this.projects.values())
      .filter((p) => p.agentId === agentId)
      .map((p) => this._enrichProject(p));
  }

  /**
   * Get a single project's statistics
   * @param {string} id - project ID
   * @returns {object|null}
   */
  getProjectStats(id) {
    const project = this.projects.get(id);
    if (!project) {
      return null;
    }

    // Get associated agent data if available
    let agentStatus = 'away';
    let agentName = null;
    let agentTask = null;
    if (project.agentId && this._chatRoom) {
      const agent = this._chatRoom.getAgent(project.agentId);
      if (agent) {
        agentStatus = agent.status;
        agentName = agent.agentName;
        agentTask = agent.task || null;
      }
    }

    // Simulated stats (can be replaced with real metrics later)
    const todayTasks = Math.floor(Math.random() * 50) + 10;
    const successRate = Math.round((85 + Math.random() * 14) * 10) / 10;
    const cpuUsage = Math.floor(Math.random() * 40) + 10;
    const memoryUsage = Math.floor(Math.random() * 50) + 20;

    return {
      projectId: id,
      todayTasks,
      successRate,
      cpuUsage,
      memoryUsage,
      agentStatus,
      agentName,
      lastTask: agentTask,
    };
  }

  /**
   * Get project statistics
   * @returns {object}
   */
  getStats() {
    const total = this.projects.size;
    const byStatus = { active: 0, inactive: 0 };
    const byType = {};

    for (const project of this.projects.values()) {
      const status = this._getProjectStatus(project);
      byStatus[status]++;

      if (!byType[project.type]) {
        byType[project.type] = 0;
      }
      byType[project.type]++;
    }

    return { total, byStatus, byType };
  }

  /**
   * Scan a directory for projects and import them.
   * Only imports directories that look like actual projects (have package.json or .git).
   * Skips already-imported projects (matched by path).
   * @param {string} dirPath - Directory to scan (e.g. ~/AI)
   * @returns {object[]} imported projects
   */
  async importFromDirectory(dirPath) {
    const expandedPath = dirPath.replace(/^~/, os.homedir());
    let entries = [];
    try {
      entries = fs.readdirSync(expandedPath);
    } catch (err) {
      console.warn(`[ProjectManager] Cannot read directory ${expandedPath}: ${err.message}`);
      return [];
    }

    const imported = [];
    for (const entry of entries) {
      const fullPath = path.join(expandedPath, entry);
      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) continue;

      // Skip hidden and known non-project directories
      if (entry.startsWith('.') || ['tmp', 'BackupFile', 'Documents'].includes(entry)) continue;

      // Check if it looks like a project (has package.json or .git)
      const hasPackageJson = fs.existsSync(path.join(fullPath, 'package.json'));
      const hasGit = fs.existsSync(path.join(fullPath, '.git'));

      if (!hasPackageJson && !hasGit) continue;

      // Check if already imported (by path)
      const alreadyExists = Array.from(this.projects.values()).some((p) => p.path === fullPath);
      if (alreadyExists) {
        console.log(`[ProjectManager] Skipping already-imported project: ${entry}`);
        continue;
      }

      // Read package.json and config.json for name/model/type hints
      let name = entry;
      let type = 'tool';
      let model = 'qwen2.5';
      try {
        // Try config.json first (for models like LLM Router)
        const configPath = path.join(fullPath, 'config.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          if (config.providers) {
            // This looks like an LLM router or proxy
            const providers = Object.keys(config.providers);
            if (providers.includes('minimax') && providers.includes('zai')) {
              model = 'MiniMax-M2.7'; // default tier
              type = 'tool';
            } else if (providers.includes('openai')) {
              model = 'gpt-4';
            }
          }
        }

        // Read package.json
        const pkgPath = path.join(fullPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          name = pkg.name || entry;

          // Infer type from package.json
          if (pkg.keywords) {
            const kw = Array.isArray(pkg.keywords) ? pkg.keywords.join(' ') : '';
            if (kw.includes('chat') || kw.includes('agent')) type = 'chat';
            else if (kw.includes('coding') || kw.includes('dev')) type = 'coding';
            else if (kw.includes('research')) type = 'research';
            else if (kw.includes('creative')) type = 'creative';
          }

          // Infer model from description or dependencies
          const desc = ((pkg.description || '') + ' ' + Object.keys(pkg.dependencies || {}).join(' ')).toLowerCase();
          if (desc.includes('minimax')) model = 'MiniMax-M2.7';
          else if (desc.includes('glm-5') || desc.includes('glm5')) model = 'glm-5.1';
          else if (desc.includes('glm-4') || desc.includes('glm4')) model = 'GLM-4.7-Flash';
          else if (desc.includes('gpt-4') || desc.includes('openai')) model = 'gpt-4';
          else if (desc.includes('deepseek')) model = 'deepseek';
        }
      } catch {
        // ignore parse errors
      }

      const project = this.create({
        name,
        path: fullPath,
        agentId: '',
        type,
        model,
      });
      imported.push(project);
    }

    if (imported.length > 0) {
      console.log(`[ProjectManager] Imported ${imported.length} projects from ${expandedPath}`);
    }
    return imported;
  }
}

export { VALID_TYPES, VALID_MODELS };
export default ProjectManager;
