// Shared UUID validation for route parameters
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

import type { FastifyReply } from "fastify";

export function requireUUID(id: string, reply: FastifyReply): boolean {
  if (!UUID_RE.test(id)) {
    reply.code(400).send({ error: "invalid id format" });
    return false;
  }
  return true;
}
