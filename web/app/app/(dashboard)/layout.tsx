"use client";

import { WorkspaceSlugProvider } from "@multica/core/paths";
import { setCurrentWorkspace } from "@multica/core/platform";

// Hardcoded workspace slug for single-workspace agent-monitor mode
const WORKSPACE_SLUG = "default";
const WORKSPACE_ID = "ws_default";

// Sync immediately (render-phase) so child components can call useWorkspaceId()
if (typeof window !== "undefined") {
  try { setCurrentWorkspace(WORKSPACE_SLUG, WORKSPACE_ID); } catch {}
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceSlugProvider slug={WORKSPACE_SLUG}>
      {children}
    </WorkspaceSlugProvider>
  );
}
