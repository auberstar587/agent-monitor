import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fs from "fs";
import path from "path";
import os from "os";
import { query } from "../db/client.js";

const HOME = os.homedir();

/**
 * Path safety:
 *  - Must be an absolute path that, after resolve(), lives under the user's home.
 *  - Blocks any `..` traversal that escapes HOME.
 *  - Blocks /etc, /tmp, /var, etc. — only the user's own tree is browsable.
 */
function isPathSafe(p: string): boolean {
  const resolved = path.resolve(p);
  // Allow HOME itself or anything strictly under HOME
  return resolved === HOME || resolved.startsWith(HOME + path.sep);
}

interface DirEntry {
  name: string;
  path: string;
  has_children: boolean;
}

async function listDirs(target: string): Promise<DirEntry[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(target, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs: DirEntry[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".")) continue; // skip hidden
    const childPath = path.join(target, e.name);
    let has_children = false;
    try {
      const sub = await fs.promises.readdir(childPath, { withFileTypes: true });
      has_children = sub.some((s) => s.isDirectory() && !s.name.startsWith("."));
    } catch {
      /* ignore permission errors */
    }
    dirs.push({ name: e.name, path: childPath, has_children });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return dirs;
}

export async function fsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/fs/browse?path=<abs>
   * Returns immediate child directories of `path`, plus current + parent pointers.
   */
  fastify.get("/api/fs/browse", async (req: FastifyRequest, reply: FastifyReply) => {
    const { path: rawPath } = req.query as { path?: string };
    const target = rawPath ? path.resolve(rawPath) : HOME;

    if (!isPathSafe(target)) {
      return reply.code(403).send({
        error: "path is outside the allowed home directory",
        current: HOME,
        parent: null,
        dirs: [],
      });
    }

    try {
      const stat = await fs.promises.stat(target);
      if (!stat.isDirectory()) {
        return reply.code(400).send({ error: "not a directory", current: target });
      }
    } catch {
      return reply
        .code(404)
        .send({ error: "path not found", current: target, parent: path.dirname(target), dirs: [] });
    }

    const dirs = await listDirs(target);
    const parent = target === HOME ? null : path.dirname(target);
    return { current: target, parent, dirs };
  });

  /**
   * GET /api/fs/home
   * Returns the user's home + recently registered project paths (for shortcuts).
   */
  fastify.get("/api/fs/home", async () => {
    const recent = await query<{ path: string }>(
      "SELECT path FROM local_projects ORDER BY updated_at DESC LIMIT 10",
    );
    return {
      home: HOME,
      recent: recent.map((r) => r.path),
    };
  });

  /**
   * GET /api/fs/common
   * Returns well-known shortcuts: desktop, documents, downloads, home, cwd.
   */
  fastify.get("/api/fs/common", async () => {
    const candidates: { key: string; label: string; path: string }[] = [
      { key: "home", label: "家目录", path: HOME },
      { key: "desktop", label: "桌面", path: path.join(HOME, "Desktop") },
      { key: "documents", label: "文稿", path: path.join(HOME, "Documents") },
      { key: "downloads", label: "下载", path: path.join(HOME, "Downloads") },
      { key: "cwd", label: "工作目录", path: process.cwd() },
    ];
    const shortcuts = [];
    for (const c of candidates) {
      try {
        const st = await fs.promises.stat(c.path);
        if (st.isDirectory()) shortcuts.push(c);
      } catch {
        /* skip missing */
      }
    }
    return { shortcuts };
  });
}
