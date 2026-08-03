import type {
  DashboardActivity,
  EncodedIntrospectionSchema,
  ExplorerSession,
  Result,
  SchemaDiscoveryResult,
} from "shared";
import { computed, onMounted, onUnmounted, ref } from "vue";

import { useSDK } from "@/plugins/sdk";
import { createExplorerSessionStore } from "@/services/explorerSessions";
import { createStorageService } from "@/services/storage";

const ACTIVITIES_KEY = "dashboardActivities";
const PENDING_SCAN_KEY = "graphql-analyzer-context-scan-request-id";
const NAVIGATE_TO_ATTACK_KEY = "graphql-analyzer-navigate-to-attack";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function getDomainName(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Unknown";
  }
}

export function useScanning(
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void,
) {
  const sdk = useSDK();
  const storage = createStorageService(sdk);
  const sessionStore = createExplorerSessionStore(sdk);

  const scanUrl = ref("");
  const isScanning = ref(false);
  const recentSessions = ref<DashboardActivity[]>([]);
  const customHeaders = ref<Array<{ name: string; value: string }>>([]);
  const isProcessingScanRequest = ref(false);

  const parsedHeaders = computed(() =>
    Object.fromEntries(
      customHeaders.value
        .filter(({ name, value }) => name.trim() !== "" && value.trim() !== "")
        .map(({ name, value }) => [name.trim(), value.trim()]),
    ),
  );

  const addCustomHeader = () => {
    if (customHeaders.value.length < 20) {
      customHeaders.value.push({ name: "", value: "" });
    }
  };

  const removeCustomHeader = (index: number) => {
    customHeaders.value.splice(index, 1);
  };

  const loadRecentSessions = (): void => {
    const activities = storage.get<DashboardActivity[]>(ACTIVITIES_KEY);
    recentSessions.value = (Array.isArray(activities) ? activities : [])
      .map((activity) => ({
        ...activity,
        createdAt: new Date(activity.createdAt),
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  };

  const addActivity = async (activity: DashboardActivity): Promise<void> => {
    const activities = storage.get<DashboardActivity[]>(ACTIVITIES_KEY);
    await storage.set(
      ACTIVITIES_KEY,
      [activity, ...(Array.isArray(activities) ? activities : [])].slice(0, 20),
    );
    loadRecentSessions();
  };

  const createSession = async (
    schemaPayload: EncodedIntrospectionSchema,
    metadata: Omit<
      ExplorerSession,
      "id" | "schemaPayload" | "schema" | "introspection" | "createdAt"
    > & { requestId?: string },
  ): Promise<ExplorerSession> =>
    sessionStore.createSession({
      ...metadata,
      id: generateId(),
      schemaPayload,
      createdAt: new Date(),
    });

  const finishSuccessfulScan = async (
    result: SchemaDiscoveryResult,
    title: string,
    url: string,
    requestId?: string,
  ): Promise<void> => {
    if (result.schema === undefined) {
      throw new Error("Introspection completed without returning a schema");
    }

    const requestSuffix =
      requestId === undefined ? "" : ` (${requestId.slice(0, 8)})`;
    const sessionTitle = `${title}${requestSuffix}`;
    const session = await createSession(result.schema, {
      title: sessionTitle,
      url,
      supportsIntrospection: true,
      status: "success",
      requestId,
    });
    if (requestId === undefined) await sessionStore.add(session);
    else await sessionStore.upsertByRequestId(session);

    await addActivity({
      id: generateId(),
      title: `Schema scan: ${sessionTitle}`,
      url,
      description:
        requestId === undefined
          ? "Successfully scanned GraphQL schema"
          : "GraphQL schema introspection scan",
      createdAt: session.createdAt,
      status: "success",
      type: "scan",
    });

    window.dispatchEvent(new CustomEvent("graphql-analyzer-sessions-updated"));
    sdk.window.showToast("Schema scanned successfully!", {
      variant: "success",
    });
    scanUrl.value = "";
    customHeaders.value = [];
    window.setTimeout(() => navigateTo?.("Explorer"), 800);
  };

  const finishDisabledScan = async (
    title: string,
    url: string,
  ): Promise<void> => {
    await addActivity({
      id: generateId(),
      title: `Scan attempted: ${title}`,
      url,
      description: "GraphQL endpoint found but introspection is disabled",
      createdAt: new Date(),
      status: "warning",
      type: "scan",
    });
    sdk.window.showToast(
      "GraphQL endpoint detected, but introspection is disabled. Cannot explore schema.",
      { variant: "warning" },
    );
    scanUrl.value = "";
  };

  const handleDiscoveryResult = async (
    result: Result<SchemaDiscoveryResult>,
    title: string,
    url: string,
    requestId?: string,
  ): Promise<void> => {
    if (result.kind === "Error") {
      sdk.window.showToast(`Scan failed: ${result.error}`, {
        variant: "error",
      });
      return;
    }
    if (
      result.value.supportsIntrospection &&
      result.value.schema !== undefined
    ) {
      await finishSuccessfulScan(result.value, title, url, requestId);
    } else {
      await finishDisabledScan(title, url);
    }
  };

  const handleScan = async () => {
    const url = scanUrl.value.trim();
    if (url === "") {
      sdk.window.showToast("Please enter a GraphQL endpoint URL", {
        variant: "warning",
      });
      return;
    }

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("Only HTTP and HTTPS protocols are supported");
      }
    } catch (error) {
      sdk.window.showToast(
        `Invalid URL: ${error instanceof Error ? error.message : "invalid format"}`,
        { variant: "error" },
      );
      return;
    }

    isScanning.value = true;
    try {
      const result = await sdk.backend.testGraphQLEndpoint(
        url,
        parsedHeaders.value,
      );
      await handleDiscoveryResult(result, getDomainName(url), url);
    } catch (error) {
      sdk.window.showToast(
        `Scan failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        { variant: "error" },
      );
    } finally {
      isScanning.value = false;
    }
  };

  const handleContextScanRequest = async (event: CustomEvent) => {
    const requestId = event.detail?.requestId;
    if (
      typeof requestId !== "string" ||
      requestId === "" ||
      isProcessingScanRequest.value
    ) {
      return;
    }

    isProcessingScanRequest.value = true;
    isScanning.value = true;
    try {
      const [result, requestInfo] = await Promise.all([
        sdk.backend.testGraphQLEndpointFromRequest(
          requestId,
          parsedHeaders.value,
        ),
        sdk.backend.getRequestInfo(requestId),
      ]);
      const url =
        requestInfo.kind === "Ok"
          ? requestInfo.value.url
          : `request:${requestId}`;
      const parsedDomain =
        requestInfo.kind === "Ok"
          ? getDomainName(requestInfo.value.url)
          : "Unknown";
      const title =
        requestInfo.kind === "Ok"
          ? parsedDomain === "Unknown"
            ? requestInfo.value.host
            : parsedDomain
          : `Request ${requestId.slice(0, 8)}`;
      await handleDiscoveryResult(result, title, url, requestId);
    } catch (error) {
      sdk.window.showToast(
        `Scan failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        { variant: "error" },
      );
    } finally {
      isScanning.value = false;
      isProcessingScanRequest.value = false;
      await storage.remove(PENDING_SCAN_KEY);
    }
  };

  const selectSession = async (session: DashboardActivity) => {
    if (session.type === "attack") {
      await storage.set(NAVIGATE_TO_ATTACK_KEY, session.attackSessionId ?? "");
      navigateTo?.("Attacks");
    } else {
      navigateTo?.("Explorer");
    }
  };

  const deleteAllData = async (): Promise<void> => {
    try {
      await sessionStore.clear();
      await storage.clear();
      recentSessions.value = [];
      sdk.window.showToast("All sessions and data deleted successfully", {
        variant: "success",
      });
    } catch {
      sdk.window.showToast("Failed to delete all data", { variant: "error" });
    }
  };

  onMounted(async () => {
    window.addEventListener(
      "graphql-analyzer-context-scan-request",
      handleContextScanRequest as unknown as EventListener,
    );
    const pendingRequestId = storage.get<string>(PENDING_SCAN_KEY);
    if (pendingRequestId !== undefined && pendingRequestId !== "") {
      await handleContextScanRequest({
        detail: { requestId: pendingRequestId },
      } as CustomEvent);
    }
  });

  onUnmounted(() => {
    window.removeEventListener(
      "graphql-analyzer-context-scan-request",
      handleContextScanRequest as unknown as EventListener,
    );
  });

  return {
    scanUrl,
    isScanning,
    customHeaders,
    parsedHeaders,
    recentSessions,
    addCustomHeader,
    removeCustomHeader,
    handleScan,
    loadRecentSessions,
    selectSession,
    deleteAllData,
  };
}
