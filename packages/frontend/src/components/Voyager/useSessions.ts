import { computed, ref } from "vue";

import { useSDK } from "@/plugins/sdk";
import { createExplorerSessionStore } from "@/services/explorerSessions";
import { createStorageService } from "@/services/storage";

const AUTO_SELECT_KEY = "voyager-auto-select-session";
const SELECTED_KEY = "voyager-selected-session-id";

export function useVoyagerSessions() {
  const sdk = useSDK();
  const sessionStore = createExplorerSessionStore(sdk);
  const storage = createStorageService(sdk);
  const selectedSessionId = ref<string>();

  const selectedSession = computed(() =>
    sessionStore.sessions.value.find(
      (session) => session.id === selectedSessionId.value,
    ),
  );
  const introspectionSessions = computed(() =>
    sessionStore.sessions.value.filter(
      (session) =>
        session.supportsIntrospection === true && session.schema !== undefined,
    ),
  );

  const selectSession = async (sessionId: string) => {
    if (
      !introspectionSessions.value.some((session) => session.id === sessionId)
    ) {
      return;
    }
    selectedSessionId.value = sessionId;
    await storage.set(SELECTED_KEY, sessionId);
  };

  const loadSessions = async () => {
    await sessionStore.load();
    const requestedId =
      storage.get<string>(AUTO_SELECT_KEY) ?? storage.get<string>(SELECTED_KEY);
    const fallbackId = sessionStore.selectedSessionId.value;
    const selectedId = [requestedId, fallbackId].find(
      (id) =>
        id !== undefined &&
        introspectionSessions.value.some((session) => session.id === id),
    );
    selectedSessionId.value = selectedId;
    if (storage.get<string>(AUTO_SELECT_KEY) !== undefined) {
      await storage.remove(AUTO_SELECT_KEY);
    }
  };

  const handleStorageChange = async () => {
    const previousId = selectedSessionId.value;
    await loadSessions();
    if (
      previousId !== undefined &&
      introspectionSessions.value.some((session) => session.id === previousId)
    ) {
      selectedSessionId.value = previousId;
    }
  };

  return {
    sessions: sessionStore.sessions,
    selectedSessionId,
    selectedSession,
    introspectionSessions,
    loadSessions,
    selectSession,
    handleStorageChange,
  };
}
