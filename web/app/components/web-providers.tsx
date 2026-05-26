"use client";

import { useMemo } from "react";
import { CoreProvider } from "@multica/core/platform";
import packageJson from "../package.json";
import { WebNavigationProvider } from "@/platform/navigation";

export function WebProviders({ children }: { children: React.ReactNode }) {
  const identity = useMemo(
    () => ({ platform: "web", version: packageJson.version || "dev" }),
    [],
  );
  return (
    <CoreProvider
      apiBaseUrl={process.env.NEXT_PUBLIC_API_URL || ""}
      identity={identity}
    >
      <WebNavigationProvider>{children}</WebNavigationProvider>
    </CoreProvider>
  );
}
