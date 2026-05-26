"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { ApiClient } from "../api/client";
import { setApiInstance } from "../api";
import { registerAuthStore, type AuthState } from "../auth";
import { createChatStore, registerChatStore } from "../chat";
import { QueryProvider } from "../provider";
import { createLogger } from "../logger";
import { I18nProvider } from "../i18n";
import { defaultStorage } from "./storage";
import { setCurrentWorkspace } from "./workspace-storage";
import type { CoreProviderProps, ClientIdentity } from "./types";
import type { StorageAdapter } from "../types/storage";

// Module-level singletons — created once at first render, never recreated.
let initialized = false;
let chatStore: ReturnType<typeof createChatStore>;

// Create a stub auth store that pretends to always be logged in
function createStubAuthStore() {
  return create<AuthState>(() => ({
    user: {
      id: "local",
      email: "local@agent-monitor",
      name: "Local User",
      avatar_url: null,
      onboarding_state: "complete",
      onboarded_at: new Date().toISOString(),
      starter_content_state: "imported",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as import("../types").User,
    isLoading: false,
    initialize: async () => {},
    sendCode: async () => {},
    verifyCode: async () => ({}) as unknown as import("../types").User,
    loginWithGoogle: async () => ({}) as unknown as import("../types").User,
    loginWithToken: async () => ({}) as unknown as import("../types").User,
    logout: () => {},
    setUser: () => {},
    refreshMe: async () => {},
  }));
}

function initCore(
  apiBaseUrl: string,
  storage: StorageAdapter,
  identity?: ClientIdentity,
) {
  if (initialized) return;

  const api = new ApiClient(apiBaseUrl, {
    logger: createLogger("api"),
    identity,
  });
  setApiInstance(api);

  // Register stub auth store (always "logged in")
  const authStore = createStubAuthStore();
  registerAuthStore(authStore);

  // Hardcode single workspace mode
  setCurrentWorkspace("default", "default");

  chatStore = createChatStore({ storage });
  registerChatStore(chatStore);

  initialized = true;
}

export function CoreProvider({
  children,
  apiBaseUrl = "",
  storage = defaultStorage,
  identity,
}: CoreProviderProps) {
  useMemo(() => initCore(apiBaseUrl, storage, identity), []);

  return (
    <I18nProvider>
      <QueryProvider>
        {children}
      </QueryProvider>
    </I18nProvider>
  );
}
