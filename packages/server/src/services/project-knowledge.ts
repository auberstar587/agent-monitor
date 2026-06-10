import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { queryOne } from '../db/client.js';

interface ProjectRow {
  name: string;
  path: string;
}

/**
 * 从项目目录读取关键知识文件，格式化为 systemPrompt 可用的文本。
 * 只提取最有价值的部分，控制总 token 量。
 */
export async function buildProjectKnowledge(projectId: string): Promise<string | null> {
  // 1. 获取项目路径
  const project = await queryOne<ProjectRow>(
    'SELECT name, path FROM local_projects WHERE id = $1',
    [projectId],
  );
  if (!project?.path) return null;

  const sections: string[] = [];

  // 2. 读取 MEMORY.md（项目记忆索引）
  const memoryContent = await readSection(
    join(project.path, 'MEMORY.md'),
    '项目记忆',
  );
  if (memoryContent) sections.push(memoryContent);

  // 3. 读取 CLAUDE.md（项目协作规范）
  const claudeContent = await readSection(
    join(project.path, 'CLAUDE.md'),
    '项目协作规则',
  );
  if (claudeContent) sections.push(claudeContent);

  // 4. 读取 .claude 目录下的记忆文件（如果有）
  const memDir = join(project.path, '.claude', 'projects');
  // 只尝试读取 MEMORY.md 索引
  const memIndex = await readSection(
    join(memDir, 'MEMORY.md'),
    'Agent 记忆索引',
  );
  if (memIndex) sections.push(memIndex);

  if (sections.length === 0) return null;

  return [
    '# 项目领域知识（自动注入）',
    '',
    '以下内容来自项目的知识文件，帮助你理解项目约定和经验教训。',
    '',
    ...sections,
  ].join('\n');
}

/**
 * 读取一个文件，截取前 maxChars 字符，格式化为 markdown section。
 * 文件不存在或读取失败返回 null。
 */
async function readSection(filePath: string, title: string, maxChars = 3000): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    if (!content.trim()) return null;
    // 截取前 maxChars 字符，避免 token 爆炸
    const truncated = content.length > maxChars
      ? content.slice(0, maxChars) + '\n... (已截断)'
      : content;
    return [
      `## ${title}`,
      '',
      `> 来源: \`${filePath.split('/').slice(-3).join('/')}\``,
      '',
      truncated,
    ].join('\n');
  } catch {
    return null;
  }
}
