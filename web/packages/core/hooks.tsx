"use client";

import { getCurrentWsId } from "./platform/workspace-storage";

/**
 * Returns the current workspace UUID.
 * Agent Monitor is single-workspace — always returns the hardcoded default.
 */
export function useWorkspaceId(): string {
  return getCurrentWsId() ?? "default";
}
