import type { ExplorerSession } from "shared";

import { useSDK } from "@/plugins/sdk";
import { createExplorerSessionStore } from "@/services/explorerSessions";

export type { ExplorerSession };

export const useSessions = () => {
  const sdk = useSDK();
  const store = createExplorerSessionStore(sdk);

  const clearAllData = async () => {
    try {
      await store.clear();
      sdk.window.showToast("All sessions and data cleared successfully", {
        variant: "success",
      });
    } catch {
      sdk.window.showToast("Failed to clear data", { variant: "error" });
    }
  };

  return {
    sessions: store.sessions,
    selectedSessionId: store.selectedSessionId,
    selectedSession: store.selectedSession,
    loadSessions: () => store.load(),
    selectSession: (sessionId: string) => store.select(sessionId),
    deleteSession: (sessionId: string) => store.remove(sessionId),
    renameSession: (sessionId: string, title: string) =>
      store.rename(sessionId, title),
    clearAllData,
    saveAllData: () => store.persist(),
  };
};
