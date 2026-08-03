<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Checkbox from "primevue/checkbox";
import ProgressBar from "primevue/progressbar";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import TabPanel from "primevue/tabpanel";
import TabView from "primevue/tabview";
import type {
  AttackConfig,
  AttackResult,
  AttackSession,
  AttackType,
} from "shared";
import {
  computed,
  nextTick,
  onActivated,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";

import { AttackTab } from "@/components/attacks";
import AttackConfiguration from "@/components/attacks/AttackConfiguration.vue";
import AttackResultsTable from "@/components/attacks/AttackResultsTable.vue";
import TargetSelection from "@/components/attacks/TargetSelection.vue";
import { CodeEditor } from "@/components/common";
import { useSDK } from "@/plugins/sdk";
import { createActivityService } from "@/services/activity";
import { createBackgroundAttackService } from "@/services/backgroundAttacks";
import { createExplorerSessionStore } from "@/services/explorerSessions";
import { createReplayService } from "@/services/replay";
import { createStorageService } from "@/services/storage";

const sdk = useSDK();
const replayService = createReplayService(sdk);
const activityService = createActivityService(sdk);
const backgroundAttackService = createBackgroundAttackService(sdk);
const storageService = createStorageService(sdk);
const explorerSessionStore = createExplorerSessionStore(sdk);
const PENDING_ATTACK_SESSION_KEY = "graphql-analyzer-navigate-to-attack";
const PENDING_ATTACK_REQUEST_KEY = "graphql-analyzer-context-attack-request-id";

defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
}>();

type SelectedRequest =
  | {
      id?: string;
      url?: string;
      host?: string;
      port?: number;
      path?: string;
      raw?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      protocol?: string;
      tls?: boolean;
    }
  | undefined;

type CodeEditorInstance =
  | {
      setValue?: (value: string) => void;
      getValue?: () => string;
      getEditorView?: () => EditorView;
      destroy?: () => void;
    }
  | undefined;

const sessions = explorerSessionStore.sessions;
const selectedSessionId = ref<string | undefined>(undefined);
const customUrl = ref("");
const useCustomUrl = ref(false);
const selectedRequest = ref<SelectedRequest>(undefined);
const useSelectedRequest = ref(false);
const isAttacking = ref(false);
const attackProgress = ref(0);
const attackResults = ref<AttackResult[]>([]);
const selectedResult = ref<AttackResult | undefined>(undefined);
const attackCancelled = ref(false);
const currentAttackSessionId = ref<string | undefined>(undefined);
const pollInterval = ref<number | undefined>(undefined);

const attackSessions = ref<AttackSession[]>([]);
const selectedAttackSessionId = ref<string | undefined>(undefined);
const currentActiveAttackId = ref<string | undefined>(undefined);
let contextAttackRequestIdInProgress: string | undefined;
let hasCompletedInitialMount = false;

const requestEditor = ref<CodeEditorInstance>(undefined);
const responseEditor = ref<CodeEditorInstance>(undefined);

const payloadExpanded = ref(false);
const responseExpanded = ref(false);

const activeResultTab = ref(0);

const selectedAttacks = ref<AttackType[]>(["introspection"]);
const maxDepth = ref(10);
const batchSize = ref(5);
const customHeaders = ref<Array<{ name: string; value: string }>>([]);

const addCustomHeader = () => {
  if (customHeaders.value.length < 10) {
    customHeaders.value.push({ name: "", value: "" });
  }
};

const removeCustomHeader = (index: number) => {
  customHeaders.value.splice(index, 1);
};

const availableAttacks = [
  {
    value: "introspection" as AttackType,
    label: "Schema Introspection",
    description: "Tests if schema introspection is enabled",
    severity: "Medium",
  },
  {
    value: "depth-limit" as AttackType,
    label: "Query Depth Limit",
    description: "Tests for query depth restrictions",
    severity: "High",
  },
  {
    value: "query-complexity" as AttackType,
    label: "Query Complexity",
    description: "Tests for query complexity analysis",
    severity: "High",
  },
  {
    value: "batch-query" as AttackType,
    label: "Batch Query Limit",
    description: "Tests batch query processing limits",
    severity: "Medium",
  },
  {
    value: "field-suggestion" as AttackType,
    label: "Field Suggestion",
    description: "Tests for information disclosure in errors",
    severity: "Low",
  },
];

const targetUrl = computed(() => {
  if (
    useSelectedRequest.value === true &&
    selectedRequest.value !== undefined
  ) {
    try {
      const request = selectedRequest.value;

      if (request.url !== undefined && request.url !== "") {
        return request.url;
      }

      if (request.host !== undefined && request.host !== "") {
        const protocol = request.port === 443 ? "https" : "http";
        const portPart =
          request.port === 80 || request.port === 443
            ? ""
            : `:${request.port ?? 80}`;
        const path = request.path ?? "/graphql";
        return `${protocol}://${request.host}${portPart}${path}`;
      }
    } catch {
      return "";
    }
  }

  if (useCustomUrl.value === true) {
    return customUrl.value;
  }
  const session = sessions.value.find((s) => s.id === selectedSessionId.value);
  return session?.url ?? "";
});

const canExecuteAttack = computed(() => {
  return (
    isAttacking.value === false &&
    targetUrl.value.trim() !== "" &&
    selectedAttacks.value.length > 0
  );
});

const selectedAttackSession = computed(() => {
  if (selectedAttackSessionId.value === undefined) {
    return undefined;
  }
  return attackSessions.value.find(
    (s) => s.id === selectedAttackSessionId.value,
  );
});

const attackResultsTableData = computed(() => {
  const deduplicatedResults: AttackResult[] = [];
  const seen = new Set<string>();

  for (const result of attackResults.value) {
    const dedupeKey = `${result.attackType}-${result.targetUrl}`;

    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      deduplicatedResults.push(result);
    } else {
      const existingResult = deduplicatedResults.find(
        (r) =>
          r.attackType === result.attackType &&
          r.targetUrl === result.targetUrl,
      );

      if (existingResult) {
        const findingsSet = new Set<string>();
        const mergedFindings = [...existingResult.findings];

        existingResult.findings.forEach((finding) => {
          findingsSet.add(`${finding.title}-${finding.severity}`);
        });

        result.findings.forEach((finding) => {
          const findingKey = `${finding.title}-${finding.severity}`;
          if (!findingsSet.has(findingKey)) {
            findingsSet.add(findingKey);
            mergedFindings.push(finding);
          }
        });

        existingResult.findings = mergedFindings;
        if (
          result.response?.timing !== undefined &&
          existingResult.response !== undefined
        ) {
          existingResult.response.timing = result.response.timing;
        }
      }
    }
  }

  return deduplicatedResults.map((result, index) => ({
    id: index + 1,
    attackType: result.attackType,
    status: result.status,
    statusCode: result.response?.statusCode ?? 0,
    contentLength: result.response?.body?.length ?? 0,
    timing: result.response?.timing ?? 0,
    findingsCount: result.findings.length,
    highSeverityCount: result.findings.filter(
      (f) => f.severity === "critical" || f.severity === "high",
    ).length,
    statusIcon: getStatusIcon(result.status),
    severityLevel: getMaxSeverity(result.findings),
    rawResult: result,
  }));
});

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return "fas fa-check-circle";
    case "failed":
      return "fas fa-times-circle";
    case "running":
      return "fas fa-spinner fa-spin";
    case "cancelled":
      return "fas fa-ban";
    default:
      return "fas fa-question-circle";
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "text-green-400";
    case "failed":
      return "text-red-400";
    case "running":
      return "text-blue-400";
    case "cancelled":
      return "text-gray-400";
    default:
      return "text-gray-400";
  }
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case "critical":
      return "text-red-600";
    case "high":
      return "text-red-400";
    case "medium":
      return "text-yellow-400";
    case "low":
      return "text-blue-400";
    case "info":
      return "text-gray-400";
    default:
      return "text-gray-400";
  }
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    sdk.window.showToast("Copied to clipboard", { variant: "success" });
  } catch (error) {
    sdk.window.showToast("Failed to copy to clipboard", { variant: "error" });
  }
};

const getMaxSeverity = (findings: AttackResult["findings"]) => {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.some((f) => f.severity === "medium")) return "medium";
  if (findings.some((f) => f.severity === "low")) return "low";
  return "info";
};

const toggleSelectAll = () => {
  if (selectedAttacks.value.length === availableAttacks.length) {
    selectedAttacks.value = [];
  } else {
    selectedAttacks.value = availableAttacks.map((attack) => attack.value);
  }
};

const toggleAttack = (attackType: AttackType) => {
  const index = selectedAttacks.value.indexOf(attackType);
  if (index > -1) {
    selectedAttacks.value.splice(index, 1);
  } else {
    selectedAttacks.value.push(attackType);
  }
};

const loadSessions = async () => {
  await explorerSessionStore.load();
  if (sessions.value.length > 0 && selectedSessionId.value === undefined) {
    selectedSessionId.value = sessions.value[0]?.id;
  }
};

const saveAttackSessions = async (deferred = false) => {
  try {
    const data = {
      attackSessions: attackSessions.value,
      selectedAttackSessionId: selectedAttackSessionId.value,
    };
    if (deferred) storageService.setMultipleDeferred(data);
    else await storageService.setMultiple(data);
  } catch (error) {
    sdk.window.showToast("Failed to save attack sessions", {
      variant: "error",
    });
  }
};

const loadAttackSessions = () => {
  try {
    const stored = storageService.getAll() as {
      attackSessions?: AttackSession[];
      selectedAttackSessionId?: string;
    };
    if (
      stored?.attackSessions !== undefined &&
      Array.isArray(stored.attackSessions)
    ) {
      attackSessions.value = stored.attackSessions.map((session) => ({
        ...session,
        createdAt: new Date(session.createdAt),
        completedAt: session.completedAt
          ? new Date(session.completedAt)
          : undefined,
      }));
      if (
        stored.selectedAttackSessionId !== undefined &&
        attackSessions.value.some(
          (s) => s.id === stored.selectedAttackSessionId,
        )
      ) {
        selectedAttackSessionId.value = stored.selectedAttackSessionId;
      } else {
        selectedAttackSessionId.value = undefined;
      }
    } else {
      attackSessions.value = [];
      selectedAttackSessionId.value = undefined;
    }
  } catch (error) {
    attackSessions.value = [];
    selectedAttackSessionId.value = undefined;
  }
};

const createAttackSession = async (
  config: AttackConfig,
): Promise<AttackSession> => {
  const now = new Date();
  let domain = "Unknown";
  let requestId: string | undefined = undefined;

  if (config.targetType === "request" && config.selectedRequestData) {
    const requestData = config.selectedRequestData as SelectedRequest;
    if (requestData?.host !== undefined && requestData.host !== "") {
      domain = requestData.host;
    } else if (requestData?.id !== undefined) {
      requestId = requestData.id;
      try {
        const requestInfoResult = await sdk.backend.getRequestInfo(
          requestData.id,
        );
        if (requestInfoResult.kind === "Ok") {
          domain = requestInfoResult.value.host;
        }
      } catch {
        domain = "Unknown";
      }
    }
  } else if (
    config.targetType === "session" &&
    config.sessionId !== undefined
  ) {
    const session = sessions.value.find((s) => s.id === config.sessionId);
    if (session !== undefined) {
      if (session.requestId !== undefined) {
        requestId = session.requestId;
        try {
          const requestInfoResult = await sdk.backend.getRequestInfo(
            session.requestId,
          );
          if (requestInfoResult.kind === "Ok") {
            domain = requestInfoResult.value.host;
          }
        } catch {
          try {
            if (session.url && !session.url.startsWith("request:")) {
              domain = new URL(session.url).hostname;
            } else {
              const titlePart = session.title.split(" (")[0];
              domain =
                titlePart !== undefined &&
                titlePart !== "" &&
                titlePart !== null
                  ? titlePart
                  : "Unknown";
            }
          } catch {
            const titlePart = session.title.split(" (")[0];
            domain =
              titlePart !== undefined && titlePart !== "" && titlePart !== null
                ? titlePart
                : "Unknown";
          }
        }
      } else {
        try {
          if (session.url && !session.url.startsWith("request:")) {
            domain = new URL(session.url).hostname;
          } else {
            const titlePart = session.title.split(" (")[0];
            domain =
              titlePart !== undefined && titlePart !== "" && titlePart !== null
                ? titlePart
                : "Unknown";
          }
        } catch {
          const titlePart = session.title.split(" (")[0];
          domain =
            titlePart !== undefined && titlePart !== "" && titlePart !== null
              ? titlePart
              : "Unknown";
        }
      }
    } else {
      try {
        if (config.targetUrl && !config.targetUrl.startsWith("request:")) {
          domain = new URL(config.targetUrl).hostname;
        }
      } catch {
        domain = "Unknown";
      }
    }
  } else {
    try {
      if (config.targetUrl && !config.targetUrl.startsWith("request:")) {
        domain = new URL(config.targetUrl).hostname;
      }
    } catch (error) {
      domain = "Unknown";
    }
  }

  if (requestId === undefined && config.requestId !== undefined) {
    requestId = config.requestId;
  }

  let title: string;
  if (domain === "Unknown" && requestId === undefined) {
    title = "New Attack Session";
  } else if (requestId !== undefined) {
    title = `${domain} (${requestId.substring(0, 8)})`;
  } else {
    title = domain;
  }

  return {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2),
    title: title,
    targetUrl: config.targetUrl || "",
    config: config,
    results: [],
    createdAt: now,
    status: "pending",
    totalFindings: 0,
    criticalFindings: 0,
  };
};

const selectAttackSession = async (sessionId: string) => {
  selectedAttackSessionId.value = sessionId;
  await saveAttackSessions();
  const session = selectedAttackSession.value;
  if (session) {
    attackResults.value = session.results;
    selectedResult.value = undefined;

    requestEditor.value = undefined;
    responseEditor.value = undefined;

    if (session.config.targetType === "request") {
      useSelectedRequest.value = true;
      useCustomUrl.value = false;
      selectedRequest.value =
        (session.config.selectedRequestData as SelectedRequest | undefined) ??
        undefined;
      selectedSessionId.value = undefined;
    } else if (session.config.targetType === "custom") {
      useSelectedRequest.value = false;
      useCustomUrl.value = true;
      customUrl.value = session.config.targetUrl;
      selectedSessionId.value = undefined;
    } else {
      useSelectedRequest.value = false;
      useCustomUrl.value = false;
      selectedSessionId.value = session.config.sessionId ?? undefined;
    }

    isAttacking.value = session.status === "running";

    if (
      session.status === "running" &&
      currentActiveAttackId.value === sessionId
    ) {
      currentAttackSessionId.value = currentActiveAttackId.value;
    } else if (session.status !== "running") {
      isAttacking.value = false;
      currentAttackSessionId.value = undefined;
    }

    nextTick(() => {
      if (selectedResult.value !== undefined) {
        const currentResult = selectedResult.value;
        selectedResult.value = undefined;
        nextTick(() => {
          selectedResult.value = currentResult;
        });
      }
    });
  }
  saveAttackSessions();
};

const updateAttackSession = (
  sessionId: string,
  updates: Partial<AttackSession>,
) => {
  const index = attackSessions.value.findIndex((s) => s.id === sessionId);
  if (index !== -1 && attackSessions.value[index] !== undefined) {
    const session = attackSessions.value[index];
    if (session !== undefined) {
      attackSessions.value[index] = { ...session, ...updates } as AttackSession;
      saveAttackSessions();
    }
  }
};

const deleteAttackSession = (sessionId: string) => {
  const index = attackSessions.value.findIndex((s) => s.id === sessionId);
  if (index > -1) {
    const session = attackSessions.value[index];
    if (!session) return;

    if (
      session.status === "running" &&
      currentActiveAttackId.value === sessionId
    ) {
      backgroundAttackService.stopBackgroundAttack();
      currentActiveAttackId.value = undefined;
      currentAttackSessionId.value = undefined;
      isAttacking.value = false;
    }

    attackSessions.value.splice(index, 1);

    if (selectedAttackSessionId.value === sessionId) {
      selectedAttackSessionId.value = undefined;
      attackResults.value = [];
      selectedResult.value = undefined;
      requestEditor.value = undefined;
      responseEditor.value = undefined;
    }

    saveAttackSessions();
    sdk.window.showToast("Attack session deleted", { variant: "success" });
  }
};

const createNewAttackSession = async (showToast = true) => {
  let config: AttackConfig;
  let targetUrl = "";

  if (
    useSelectedRequest.value === true &&
    selectedRequest.value !== undefined
  ) {
    const request = selectedRequest.value;
    targetUrl = request.url ?? "";
    if (targetUrl === "" && request.host !== undefined) {
      const protocol = request.port === 443 ? "https" : "http";
      const portPart =
        request.port === 80 || request.port === 443
          ? ""
          : `:${request.port ?? 80}`;
      const path = request.path ?? "/graphql";
      targetUrl = `${protocol}://${request.host}${portPart}${path}`;
    }

    config = {
      targetUrl: targetUrl,
      attackTypes: selectedAttacks.value,
      maxDepth: maxDepth.value,
      maxComplexity: 50,
      batchSize: batchSize.value,
      targetType: "request",
      selectedRequestData: request,
    };
  } else if (useCustomUrl.value === true && customUrl.value.trim() !== "") {
    targetUrl = customUrl.value.trim();
    config = {
      targetUrl: targetUrl,
      attackTypes: selectedAttacks.value,
      maxDepth: maxDepth.value,
      maxComplexity: 50,
      batchSize: batchSize.value,
      targetType: "custom",
    };
  } else {
    const session = sessions.value.find(
      (s) => s.id === selectedSessionId.value,
    );
    if (session !== undefined) {
      targetUrl = session.url;
      config = {
        targetUrl: targetUrl,
        attackTypes: selectedAttacks.value,
        maxDepth: maxDepth.value,
        maxComplexity: 50,
        batchSize: batchSize.value,
        targetType: "session",
        sessionId: session.id,
        requestId: session.requestId,
      };
    } else {
      config = {
        targetUrl: "",
        attackTypes: selectedAttacks.value,
        maxDepth: maxDepth.value,
        maxComplexity: 50,
        batchSize: batchSize.value,
        targetType: "session",
      };
    }
  }

  const newSession = await createAttackSession(config);
  attackSessions.value.unshift(newSession);
  selectedAttackSessionId.value = newSession.id;

  attackResults.value = [];
  selectedResult.value = undefined;
  requestEditor.value = undefined;
  responseEditor.value = undefined;

  await saveAttackSessions();

  if (showToast) {
    sdk.window.showToast("New attack session created", { variant: "success" });
  }

  return newSession;
};

const renameAttackSession = (sessionId: string, newTitle: string) => {
  updateAttackSession(sessionId, { title: newTitle });
};

const executeAttacks = async () => {
  if (!canExecuteAttack.value) return;

  isAttacking.value = true;
  attackCancelled.value = false;
  attackProgress.value = 0;
  attackResults.value = [];
  selectedResult.value = undefined;

  try {
    const headersObj: Record<string, string> = {};
    customHeaders.value.forEach((header) => {
      if (header.name.trim() !== "" && header.value.trim() !== "") {
        headersObj[header.name.trim()] = header.value.trim();
      }
    });

    let originalHeaders: Record<string, string> | undefined = undefined;
    let useOriginalHeaders = false;
    let sessionRequestId: string | undefined = undefined;

    if (
      !useSelectedRequest.value &&
      !useCustomUrl.value &&
      selectedSessionId.value !== undefined
    ) {
      const session = sessions.value.find(
        (s) => s.id === selectedSessionId.value,
      );
      if (session !== undefined && session.requestId !== undefined) {
        sessionRequestId = session.requestId;
      }
    }
    if (
      useSelectedRequest.value === true &&
      selectedRequest.value !== undefined
    ) {
      if (selectedRequest.value.id !== undefined) {
        try {
          const requestResult = await sdk.backend.getRequestInfo(
            selectedRequest.value.id,
          );
          if (
            requestResult.kind === "Ok" &&
            selectedRequest.value.raw !== undefined &&
            selectedRequest.value.raw !== ""
          ) {
            useOriginalHeaders = true;
            originalHeaders = {};

            const originalRaw = selectedRequest.value.raw;
            const lines = originalRaw.split(/\r?\n/);
            let inHeaders = false;

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line === undefined || line === "") {
                if (inHeaders === true) break;
                continue;
              }

              const trimmedLine = line.trim();

              if (i === 0) {
                inHeaders = true;
                continue;
              }

              if (inHeaders === true && trimmedLine === "") break;

              if (
                inHeaders === true &&
                typeof trimmedLine === "string" &&
                trimmedLine.includes(":")
              ) {
                const colonIndex = trimmedLine.indexOf(":");
                const headerName = trimmedLine.substring(0, colonIndex).trim();
                const headerValue = trimmedLine
                  .substring(colonIndex + 1)
                  .trim();
                if (
                  headerName !== "" &&
                  headerValue !== "" &&
                  headerName.toLowerCase() !== "content-length"
                ) {
                  originalHeaders[headerName] = headerValue;
                }
              }
            }
          }
        } catch (error) {
          originalHeaders = undefined;
          useOriginalHeaders = false;
        }
      } else if (
        selectedRequest.value.raw !== undefined &&
        selectedRequest.value.raw !== ""
      ) {
        useOriginalHeaders = true;
        originalHeaders = {};

        try {
          const raw = selectedRequest.value.raw;

          const lines = raw.split(/\r?\n/);
          let inHeaders = false;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line === undefined || line === "") {
              if (inHeaders) break;
              continue;
            }

            const trimmedLine = line.trim();

            if (i === 0) {
              inHeaders = true;
              continue;
            }

            if (inHeaders && trimmedLine === "") {
              break;
            }

            if (inHeaders && trimmedLine.includes(":")) {
              const colonIndex = trimmedLine.indexOf(":");
              const headerName = trimmedLine.substring(0, colonIndex).trim();
              const headerValue = trimmedLine.substring(colonIndex + 1).trim();
              if (headerName !== "" && headerValue !== "") {
                if (headerName.toLowerCase() !== "content-length") {
                  originalHeaders[headerName] = headerValue;
                }
              }
            }
          }
        } catch (error) {
          originalHeaders = undefined;
          useOriginalHeaders = false;
        }
      }
    }

    let finalTargetUrl = targetUrl.value;
    if (
      useSelectedRequest.value === true &&
      selectedRequest.value !== undefined
    ) {
      if (
        selectedRequest.value.url !== undefined &&
        selectedRequest.value.url !== "" &&
        !selectedRequest.value.url.startsWith("request:")
      ) {
        finalTargetUrl = selectedRequest.value.url;
      } else if (selectedRequest.value.id !== undefined) {
        try {
          const requestInfoResult = await sdk.backend.getRequestInfo(
            selectedRequest.value.id,
          );
          if (requestInfoResult.kind === "Ok") {
            finalTargetUrl = requestInfoResult.value.url;
          }
        } catch {
          finalTargetUrl = targetUrl.value;
        }
      }
    }

    const config: AttackConfig = {
      targetUrl: finalTargetUrl,
      sessionId: selectedSessionId.value ?? undefined,
      attackTypes: selectedAttacks.value,
      maxDepth: maxDepth.value,
      batchSize: batchSize.value,
      customHeaders:
        Object.keys(headersObj).length > 0 ? headersObj : undefined,
      originalHeaders: originalHeaders,
      useOriginalHeaders: useOriginalHeaders,
      targetType: useSelectedRequest.value
        ? "request"
        : useCustomUrl.value
          ? "custom"
          : "session",
      selectedRequestData: useSelectedRequest.value
        ? selectedRequest.value
        : undefined,
      requestId:
        useSelectedRequest.value && selectedRequest.value?.id !== undefined
          ? selectedRequest.value.id
          : sessionRequestId !== undefined
            ? sessionRequestId
            : undefined,
    };

    const sessionResult = await sdk.backend.startGraphQLAttacks(config);

    if (sessionResult.kind === "Error") {
      sdk.window.showToast(`Failed to start attacks: ${sessionResult.error}`, {
        variant: "error",
      });
      isAttacking.value = false;
      attackProgress.value = 0;
      return;
    }

    currentAttackSessionId.value = sessionResult.value;

    const currentSession = selectedAttackSession.value;
    let attackSession: AttackSession;

    if (currentSession !== undefined) {
      let domain = "Unknown";
      let requestId: string | undefined = config.requestId;

      if (config.targetType === "request" && config.selectedRequestData) {
        const requestData = config.selectedRequestData as SelectedRequest;
        if (requestData?.host !== undefined && requestData.host !== "") {
          domain = requestData.host;
        } else if (requestData?.id !== undefined) {
          requestId = requestData.id;
          try {
            const requestInfoResult = await sdk.backend.getRequestInfo(
              requestData.id,
            );
            if (requestInfoResult.kind === "Ok") {
              domain = requestInfoResult.value.host;
            }
          } catch {
            domain = "Unknown";
          }
        }
      } else if (
        config.targetType === "session" &&
        config.sessionId !== undefined
      ) {
        const session = sessions.value.find((s) => s.id === config.sessionId);
        if (session !== undefined && session.requestId !== undefined) {
          requestId = session.requestId;
          try {
            const requestInfoResult = await sdk.backend.getRequestInfo(
              session.requestId,
            );
            if (requestInfoResult.kind === "Ok") {
              domain = requestInfoResult.value.host;
            }
          } catch {
            try {
              if (session.url && !session.url.startsWith("request:")) {
                domain = new URL(session.url).hostname;
              } else {
                const titlePart = session.title.split(" (")[0];
                domain =
                  titlePart !== undefined &&
                  titlePart !== "" &&
                  titlePart !== null
                    ? titlePart
                    : "Unknown";
              }
            } catch {
              const titlePart = session.title.split(" (")[0];
              domain =
                titlePart !== undefined &&
                titlePart !== "" &&
                titlePart !== null
                  ? titlePart
                  : "Unknown";
            }
          }
        } else if (session !== undefined) {
          try {
            if (session.url && !session.url.startsWith("request:")) {
              domain = new URL(session.url).hostname;
            } else {
              const titlePart = session.title.split(" (")[0];
              domain =
                titlePart !== undefined &&
                titlePart !== "" &&
                titlePart !== null
                  ? titlePart
                  : "Unknown";
            }
          } catch {
            const titlePart = session.title.split(" (")[0];
            domain =
              titlePart !== undefined && titlePart !== "" && titlePart !== null
                ? titlePart
                : "Unknown";
          }
        } else {
          try {
            if (config.targetUrl && !config.targetUrl.startsWith("request:")) {
              domain = new URL(config.targetUrl).hostname;
            }
          } catch {
            domain = "Unknown";
          }
        }
      } else {
        try {
          if (config.targetUrl && !config.targetUrl.startsWith("request:")) {
            domain = new URL(config.targetUrl).hostname;
          }
        } catch (error) {
          domain = "Unknown";
        }
      }

      let title: string;
      if (domain === "Unknown" && requestId === undefined) {
        title = "New Attack Session";
      } else if (requestId !== undefined) {
        title = `${domain} (${requestId.substring(0, 8)})`;
      } else {
        title = domain;
      }

      attackSession = {
        ...currentSession,
        title: title,
        targetUrl: config.targetUrl,
        config: config,
        status: "running",
      };

      const sessionIndex = attackSessions.value.findIndex(
        (s) => s.id === currentSession.id,
      );
      if (sessionIndex !== -1) {
        attackSessions.value[sessionIndex] = attackSession;
      }
    } else {
      const newAttackSession = await createAttackSession(config);
      attackSession = {
        ...newAttackSession,
        status: "running",
      };
      attackSessions.value.unshift(attackSession);
      selectedAttackSessionId.value = attackSession.id;
    }

    currentActiveAttackId.value = attackSession.id;

    attackResults.value = [];
    selectedResult.value = undefined;

    await saveAttackSessions();

    await activityService.addAttackActivity(
      config.targetUrl,
      config.attackTypes,
      attackSession.id,
      config.requestId,
    );

    backgroundAttackService.startBackgroundAttack(
      sessionResult.value,
      config.attackTypes,
    );
  } catch (error) {
    if (attackCancelled.value === false) {
      sdk.window.showToast("Attack execution failed", { variant: "error" });
    }
    isAttacking.value = false;
  }
};

const stopAttackPolling = () => {
  if (pollInterval.value !== undefined) {
    clearInterval(pollInterval.value);
    pollInterval.value = undefined;
  }
};

const cancelAttack = async () => {
  attackCancelled.value = true;
  isAttacking.value = false;
  attackProgress.value = 0;

  if (currentAttackSessionId.value !== undefined) {
    try {
      await sdk.backend.cancelAttackSession(currentAttackSessionId.value);
    } catch {
      // Ignore cancellation
    }
  }

  backgroundAttackService.stopBackgroundAttack();

  stopAttackPolling();

  if (currentActiveAttackId.value !== undefined) {
    const session = attackSessions.value.find(
      (s) => s.id === currentActiveAttackId.value,
    );
    if (session !== undefined) {
      session.status = "cancelled";
      session.completedAt = new Date();
      await saveAttackSessions();
    }
    currentActiveAttackId.value = undefined;
  }

  currentAttackSessionId.value = undefined;
  attackResults.value = [];
  selectedResult.value = undefined;

  sdk.window.showToast("Attack cancelled", { variant: "info" });
};

const selectResult = (result: AttackResult) => {
  selectedResult.value = result;

  payloadExpanded.value = false;
  responseExpanded.value = false;

  activeResultTab.value = 0;

  nextTick(() => {
    mountSDKEditors();
  });
};

type EditorView =
  | {
      dispatch: (changes: {
        changes: { from: number; to: number; insert: string };
      }) => void;
      state?: { doc: { length: number } };
    }
  | undefined;

let requestEditorView: EditorView = undefined;
let responseEditorView: EditorView = undefined;

const updateEditorContent = (editorView: EditorView, content: string) => {
  if (editorView !== undefined && editorView.state !== undefined) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: content,
      },
    });
  }
};

const mountSDKEditors = async () => {
  const requestContainer = document.getElementById("request-editor-container");
  const responseContainer = document.getElementById(
    "response-editor-container",
  );

  if (selectedResult.value === undefined) {
    if (requestContainer)
      requestContainer.innerHTML =
        '<div class="h-full flex items-center justify-center text-surface-500">No request selected</div>';
    if (responseContainer)
      responseContainer.innerHTML =
        '<div class="h-full flex items-center justify-center text-surface-500">No response data</div>';
    return;
  }

  await nextTick();

  if (requestEditor.value !== undefined && requestEditor.value !== null) {
    try {
      if (
        typeof requestEditor.value === "object" &&
        "destroy" in requestEditor.value &&
        typeof requestEditor.value.destroy === "function"
      ) {
        requestEditor.value.destroy();
      }
    } catch {
      // Ignore destroy errors
    }
    requestEditor.value = undefined;
    requestEditorView = undefined;
  }
  if (responseEditor.value !== undefined && responseEditor.value !== null) {
    try {
      if (
        typeof responseEditor.value === "object" &&
        "destroy" in responseEditor.value &&
        typeof responseEditor.value.destroy === "function"
      ) {
        responseEditor.value.destroy();
      }
    } catch {
      // Ignore destroy errors
    }
    responseEditor.value = undefined;
    responseEditorView = undefined;
  }

  if (requestContainer) {
    try {
      if (selectedResult.value.rawRequest !== undefined) {
        requestContainer.innerHTML = "";
        const editor = sdk.ui.httpRequestEditor();
        const editorElement = editor.getElement();

        editorElement.style.height = "100%";

        requestContainer.appendChild(editorElement);
        requestEditorView = editor.getEditorView();
        requestEditor.value = editor as CodeEditorInstance;

        updateEditorContent(requestEditorView, selectedResult.value.rawRequest);
      } else {
        requestContainer.innerHTML =
          '<div class="h-full flex items-center justify-center text-surface-400">No request data</div>';
      }
    } catch (error) {
      requestContainer.innerHTML = `<div class="h-full flex items-center justify-center text-red-400">Error: ${error instanceof Error ? error.message : String(error)}</div>`;
    }
  }

  if (responseContainer) {
    try {
      if (
        selectedResult.value.rawResponse !== undefined &&
        selectedResult.value.rawResponse !== ""
      ) {
        responseContainer.innerHTML = "";
        const editor = sdk.ui.httpResponseEditor();
        const editorElement = editor.getElement();

        editorElement.style.height = "100%";

        responseContainer.appendChild(editorElement);
        responseEditorView = editor.getEditorView();
        responseEditor.value = editor as CodeEditorInstance;

        updateEditorContent(
          responseEditorView,
          selectedResult.value.rawResponse,
        );
      } else {
        responseContainer.innerHTML =
          '<div class="h-full flex items-center justify-center text-surface-400">No response data</div>';
      }
    } catch (error) {
      responseContainer.innerHTML = `<div class="h-full flex items-center justify-center text-red-400">Error: ${error instanceof Error ? error.message : String(error)}</div>`;
    }
  }
};

watch(
  selectedResult,
  () => {
    if (selectedResult.value !== undefined) {
      mountSDKEditors();
    }
  },
  { immediate: true },
);

const clearResults = () => {
  attackResults.value = [];
  selectedResult.value = undefined;
};

const createCaidoFinding = async (
  finding: AttackResult["findings"][number],
) => {
  try {
    if (selectedResult.value?.requestId === undefined) {
      sdk.window.showToast("No request ID available for finding creation", {
        variant: "error",
      });
      return;
    }

    if (sdk.backend?.createCaidoFinding === undefined) {
      sdk.window.showToast("Create finding functionality not available", {
        variant: "error",
      });
      return;
    }

    const result = await sdk.backend.createCaidoFinding(
      finding,
      selectedResult.value.requestId,
    );

    if (result.kind === "Ok") {
      sdk.window.showToast(`Created finding: ${finding.title}`, {
        variant: "success",
      });
    } else {
      sdk.window.showToast(`Failed to create finding: ${result.error}`, {
        variant: "error",
      });
    }
  } catch (error) {
    sdk.window.showToast(
      `Error creating finding: ${error instanceof Error ? error.message : "Unknown error"}`,
      { variant: "error" },
    );
  }
};

const createFindingFromResult = async (result: AttackResult) => {
  if (result.findings.length === 0) {
    sdk.window.showToast("No findings available to create", {
      variant: "error",
    });
    return;
  }

  const sortedFindings = result.findings.sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    return (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0);
  });

  const finding = sortedFindings[0];
  if (finding === undefined) {
    sdk.window.showToast("No finding to create", {
      variant: "error",
    });
    return;
  }

  try {
    if (result.requestId === undefined) {
      sdk.window.showToast("No request ID available for finding creation", {
        variant: "error",
      });
      return;
    }

    const createResult = await sdk.backend.createCaidoFinding(
      finding,
      result.requestId,
    );

    if (createResult.kind === "Ok") {
      sdk.window.showToast(`Created finding: ${finding.title}`, {
        variant: "success",
      });
    } else {
      sdk.window.showToast(`Failed to create finding: ${createResult.error}`, {
        variant: "error",
      });
    }
  } catch (error) {
    sdk.window.showToast(
      `Error creating finding: ${error instanceof Error ? error.message : "Unknown error"}`,
      { variant: "error" },
    );
  }
};

const sendToReplay = async (result: AttackResult) => {
  if (result.rawRequest === undefined || result.rawRequest === "") {
    sdk.window.showToast("No request data available for replay", {
      variant: "error",
    });
    return;
  }

  const replayResult = await replayService.createReplayFromRequest(
    result.rawRequest,
    result.targetUrl,
  );

  if (replayResult.kind === "Error") {
    sdk.window.showToast(`Failed to create replay: ${replayResult.error}`, {
      variant: "error",
    });
    return;
  }

  sdk.window.showToast(
    `Created replay session: ${replayResult.value.sessionName}`,
    { variant: "success" },
  );
};

const getAttackTypeLabel = (attackType: string) => {
  return (
    availableAttacks.find((a) => a.value === attackType)?.label ?? attackType
  );
};

const handleContextAttack = async (event: CustomEvent) => {
  const requestId = event.detail?.requestId as string | undefined;
  if (requestId !== undefined && requestId !== null && requestId !== "") {
    if (contextAttackRequestIdInProgress === requestId) return;
    contextAttackRequestIdInProgress = requestId;
    try {
      if (
        storageService.get<string>(PENDING_ATTACK_REQUEST_KEY) === requestId
      ) {
        try {
          await storageService.remove(PENDING_ATTACK_REQUEST_KEY);
        } catch (error) {
          console.error(
            `Failed to clear pending attack request: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      const requestInfoResult = await sdk.backend.getRequestInfo(requestId);
      if (requestInfoResult.kind === "Ok") {
        selectedRequest.value = {
          id: requestId,
          host: requestInfoResult.value.host,
          port: requestInfoResult.value.port,
          path: requestInfoResult.value.path,
          url: requestInfoResult.value.url,
          method: requestInfoResult.value.method,
        };
      } else {
        selectedRequest.value = { id: requestId };
      }
      useSelectedRequest.value = true;
      useCustomUrl.value = false;
      selectedSessionId.value = undefined;

      const newSession = await createNewAttackSession(false);
      if (newSession !== undefined) {
        selectedAttackSessionId.value = newSession.id;
        await nextTick();
      }
    } catch (error) {
      sdk.window.showToast(
        `Failed to create attack session: ${error instanceof Error ? error.message : "Unknown error"}`,
        { variant: "error" },
      );
    } finally {
      contextAttackRequestIdInProgress = undefined;
    }
  }
};

const handleAttackProgress = async (event: CustomEvent) => {
  const { sessionId, status, progress, results } = event.detail;

  if (sessionId === currentAttackSessionId.value) {
    attackProgress.value = progress;
    attackResults.value = results;

    if (currentActiveAttackId.value !== undefined) {
      const session = attackSessions.value.find(
        (s) => s.id === currentActiveAttackId.value,
      );
      if (session !== undefined) {
        session.results = results;
        session.status = status.isComplete === true ? "completed" : "running";
        void saveAttackSessions(true);
      }
    }

    if (status.isComplete === true) {
      isAttacking.value = false;
      attackProgress.value = 100;

      const totalFindings = results.reduce(
        (sum: number, r: AttackResult) => sum + r.findings.length,
        0,
      );
      const criticalFindings = results.reduce(
        (sum: number, r: AttackResult) =>
          sum +
          r.findings.filter(
            (f) => f.severity === "critical" || f.severity === "high",
          ).length,
        0,
      );

      if (currentActiveAttackId.value !== undefined) {
        const session = attackSessions.value.find(
          (s) => s.id === currentActiveAttackId.value,
        );
        if (session !== undefined) {
          session.completedAt = new Date();
          session.status = "completed";
          session.totalFindings = totalFindings;
          session.criticalFindings = criticalFindings;
          session.results = results;
          await saveAttackSessions();
        }
      }

      currentActiveAttackId.value = undefined;
      currentAttackSessionId.value = undefined;

      sdk.window.showToast("Attack completed successfully", {
        variant: "success",
      });
    }
  }
};

const handleAttackComplete = async (event: CustomEvent) => {
  const { sessionId, totalFindings, criticalFindings } = event.detail;

  if (sessionId === currentAttackSessionId.value) {
    isAttacking.value = false;
    attackProgress.value = 100;

    if (currentActiveAttackId.value !== undefined) {
      const session = attackSessions.value.find(
        (s) => s.id === currentActiveAttackId.value,
      );
      if (session !== undefined) {
        session.completedAt = new Date();
        session.status = "completed";
        session.totalFindings = totalFindings ?? 0;
        session.criticalFindings = criticalFindings ?? 0;
        await saveAttackSessions();
      }
      currentActiveAttackId.value = undefined;
    }
  }
};

const restoreBackgroundAttack = () => {
  if (!backgroundAttackService.hasBackgroundAttack()) return;
  const attackInfo = backgroundAttackService.getBackgroundAttackInfo();
  if (attackInfo === undefined) return;

  nextTick(() => {
    const attackSession = attackSessions.value.find(
      (session) =>
        session.status === "running" &&
        session.createdAt.getTime() >= Date.now() - 5 * 60 * 1000,
    );

    if (attackSession !== undefined) {
      isAttacking.value = true;
      currentAttackSessionId.value = attackInfo.sessionId;
      currentActiveAttackId.value = attackSession.id;
      selectedAttackSessionId.value = attackSession.id;
      attackResults.value = attackSession.results;
    } else {
      void backgroundAttackService.stopBackgroundAttack();
    }
  });
};

const consumePendingAttackNavigation = async () => {
  const attackSessionId = storageService.get<string>(
    PENDING_ATTACK_SESSION_KEY,
  );
  if (attackSessionId !== undefined && attackSessionId !== "") {
    try {
      await storageService.remove(PENDING_ATTACK_SESSION_KEY);
    } catch (error) {
      console.error(
        `Failed to clear pending attack session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await nextTick();
    if (
      attackSessions.value.some((session) => session.id === attackSessionId)
    ) {
      await selectAttackSession(attackSessionId);
      sdk.window.showToast("Navigated to attack session", {
        variant: "success",
      });
    }
  }

  const requestId = storageService.get<string>(PENDING_ATTACK_REQUEST_KEY);
  if (requestId !== undefined && requestId !== "") {
    await handleContextAttack({ detail: { requestId } } as CustomEvent);
  }
};

const refreshAttackPage = async () => {
  await loadSessions();
  loadAttackSessions();
  await consumePendingAttackNavigation();
  restoreBackgroundAttack();
};

onMounted(async () => {
  window.addEventListener(
    "graphql-analyzer-context-attack",
    handleContextAttack as unknown as EventListener,
  );
  window.addEventListener(
    "graphql-analyzer-attack-progress",
    handleAttackProgress as unknown as EventListener,
  );
  window.addEventListener(
    "graphql-analyzer-attack-complete",
    handleAttackComplete as unknown as EventListener,
  );

  try {
    await refreshAttackPage();
  } finally {
    hasCompletedInitialMount = true;
  }
});

onActivated(async () => {
  if (!hasCompletedInitialMount) return;
  await refreshAttackPage();
});

onUnmounted(() => {
  stopAttackPolling();
  window.removeEventListener(
    "graphql-analyzer-context-attack",
    handleContextAttack as unknown as EventListener,
  );
  window.removeEventListener(
    "graphql-analyzer-attack-progress",
    handleAttackProgress as unknown as EventListener,
  );
  window.removeEventListener(
    "graphql-analyzer-attack-complete",
    handleAttackComplete as unknown as EventListener,
  );

  if (requestEditor.value) {
    requestEditor.value.destroy?.();
  }
  if (responseEditor.value) {
    responseEditor.value.destroy?.();
  }
});
</script>

<script lang="ts">
export default {
  name: "Attacks",
};
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Attack Sessions Tabs -->
    <Card
      v-if="attackSessions.length > 0"
      class="h-fit mb-1"
      :pt="{
        body: { class: 'h-fit p-0' },
        content: { class: 'h-fit flex flex-col' },
      }"
    >
      <template #content>
        <div class="flex gap-2 p-4 flex-wrap">
          <AttackTab
            v-for="session in attackSessions"
            :key="session.id"
            :is-selected="selectedAttackSessionId === session.id"
            :attack-session="session"
            @select="selectAttackSession(session.id)"
            @rename="(newName) => renameAttackSession(session.id, newName)"
            @delete="deleteAttackSession(session.id)"
          />

          <!-- Plus Tab to Create New Attack Session -->
          <Button
            v-tooltip="'Create new attack session'"
            icon="fas fa-plus"
            severity="secondary"
            outlined
            size="small"
            class="min-w-12 h-8"
            @click="createNewAttackSession"
          />
        </div>
      </template>
    </Card>

    <!-- Main Content -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <Splitter class="h-full">
        <!-- Configuration Panel (Left 40%) -->
        <SplitterPanel :size="40" :min-size="30" class="overflow-hidden">
          <div class="h-full overflow-auto pr-2 space-y-3">
            <!-- Attack Session Required State -->
            <div
              v-if="!selectedAttackSessionId && attackSessions.length === 0"
              class="h-full flex items-center justify-center"
            >
              <div class="text-center text-surface-500">
                <i class="fas fa-plus-circle text-4xl mb-4"></i>
                <div class="text-lg mb-2">No Attack Sessions</div>
                <div class="text-sm mb-4">
                  Create a new attack session to get started
                </div>
                <Button
                  label="Create Attack Session"
                  icon="fas fa-plus"
                  size="large"
                  @click="createNewAttackSession"
                />
              </div>
            </div>

            <div
              v-else-if="!selectedAttackSessionId"
              class="h-full flex items-center justify-center"
            >
              <div class="text-center text-surface-500">
                <i class="fas fa-mouse-pointer text-4xl mb-4"></i>
                <div class="text-lg mb-2">Select Attack Session</div>
                <div class="text-sm">
                  Please select an attack session from the tabs above to
                  configure attacks
                </div>
              </div>
            </div>

            <!-- Configuration Content (only show when session is selected) -->
            <template v-else>
              <!-- Target Selection -->
              <TargetSelection
                :use-custom-url="useCustomUrl"
                :use-selected-request="useSelectedRequest"
                :selected-session-id="selectedSessionId"
                :sessions="sessions"
                :custom-url="customUrl"
                :selected-request="selectedRequest"
                :target-url="targetUrl"
                @update:use-custom-url="useCustomUrl = $event"
                @update:use-selected-request="useSelectedRequest = $event"
                @update:selected-session-id="selectedSessionId = $event"
                @update:custom-url="customUrl = $event"
              >
              </TargetSelection>

              <!-- Attack Selection -->
              <Card
                class="h-fit"
                :pt="{
                  body: { class: 'h-fit p-0' },
                  content: { class: 'h-fit flex flex-col' },
                }"
              >
                <template #content>
                  <div class="p-4">
                    <div class="flex items-center justify-between mb-3">
                      <h4 class="text-base font-semibold">Attack Vectors</h4>
                      <Button
                        v-tooltip="
                          selectedAttacks.length === availableAttacks.length
                            ? 'Deselect all attack vectors'
                            : 'Select all attack vectors'
                        "
                        :label="
                          selectedAttacks.length === availableAttacks.length
                            ? 'Deselect All'
                            : 'Select All'
                        "
                        :icon="
                          selectedAttacks.length === availableAttacks.length
                            ? 'fas fa-times-circle'
                            : 'fas fa-check-circle'
                        "
                        size="small"
                        text
                        @click="toggleSelectAll"
                      />
                    </div>

                    <!-- Attack Grid - 2 per row -->
                    <div class="grid grid-cols-2 gap-3">
                      <div
                        v-for="(attack, index) in availableAttacks"
                        :key="attack.value"
                        class="flex items-start gap-3 p-3 border border-surface-600 rounded hover:border-surface-500 transition-colors"
                        :class="
                          index === availableAttacks.length - 1 &&
                          availableAttacks.length % 2 === 1
                            ? 'col-span-2'
                            : ''
                        "
                      >
                        <Checkbox
                          :model-value="selectedAttacks.includes(attack.value)"
                          :binary="true"
                          :input-id="`attack-${attack.value}`"
                          @update:model-value="toggleAttack(attack.value)"
                        />
                        <div class="flex-1">
                          <label
                            :for="`attack-${attack.value}`"
                            class="text-sm font-medium cursor-pointer"
                          >
                            {{ attack.label }}
                          </label>
                          <p class="text-xs text-surface-400 mt-1">
                            {{ attack.description }}
                          </p>
                          <div class="flex items-center gap-2 mt-2">
                            <div class="flex items-center gap-1">
                              <i
                                class="fas fa-exclamation-triangle text-xs"
                                :class="
                                  getSeverityColor(
                                    attack.severity.toLowerCase(),
                                  )
                                "
                              ></i>
                              <span
                                class="text-xs font-medium"
                                :class="
                                  getSeverityColor(
                                    attack.severity.toLowerCase(),
                                  )
                                "
                              >
                                {{ attack.severity }}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </Card>

              <!-- Attack Configuration -->
              <AttackConfiguration
                :max-depth="maxDepth"
                :batch-size="batchSize"
                :custom-headers="customHeaders"
                @update:max-depth="maxDepth = $event"
                @update:batch-size="batchSize = $event"
                @update:custom-headers="customHeaders = $event"
                @add-header="addCustomHeader"
                @remove-header="removeCustomHeader"
              ></AttackConfiguration>

              <!-- Execute Button -->
              <Card
                class="h-fit"
                :pt="{
                  body: { class: 'h-fit p-0' },
                  content: { class: 'h-fit flex flex-col' },
                }"
              >
                <template #content>
                  <div class="p-4">
                    <div v-if="!isAttacking">
                      <Button
                        label="Execute Attacks"
                        icon="fas fa-bolt"
                        :disabled="!canExecuteAttack"
                        class="w-full"
                        severity="danger"
                        @click="executeAttacks"
                      />
                    </div>

                    <div v-if="isAttacking" class="space-y-3">
                      <div class="flex gap-2">
                        <Button
                          label="Running..."
                          icon="fas fa-spinner fa-spin"
                          disabled
                          class="flex-1"
                          severity="info"
                        />
                        <Button
                          label="Cancel"
                          icon="fas fa-times"
                          severity="secondary"
                          outlined
                          @click="cancelAttack"
                        />
                      </div>

                      <div>
                        <div class="text-sm text-surface-300 mb-2">
                          Running security tests...
                          {{ Math.round(attackProgress) }}%
                        </div>
                        <ProgressBar :value="attackProgress" />
                      </div>
                    </div>

                    <div
                      v-if="attackResults.length > 0"
                      class="mt-3 flex justify-between items-center"
                    >
                      <div class="text-sm text-surface-300">
                        {{ attackResults.length }} attacks completed
                      </div>
                      <Button
                        label="Clear"
                        icon="fas fa-trash"
                        size="small"
                        text
                        severity="secondary"
                        @click="clearResults"
                      />
                    </div>
                  </div>
                </template>
              </Card>
            </template>
          </div>
        </SplitterPanel>

        <!-- Results Panel (Right 60%) -->
        <SplitterPanel :size="60" :min-size="40" class="overflow-hidden">
          <div class="h-full pl-2 flex flex-col">
            <!-- Resizable Layout: Attack Results + Details -->
            <div v-if="attackResults.length > 0" class="h-full">
              <Splitter layout="vertical" class="h-full">
                <!-- Attack Results Panel -->
                <SplitterPanel
                  :size="40"
                  :min-size="25"
                  class="overflow-hidden"
                >
                  <AttackResultsTable
                    :table-data="attackResultsTableData"
                    :selected-result="selectedResult"
                    @select-result="selectResult"
                    @create-finding="createFindingFromResult"
                    @send-to-replay="sendToReplay"
                  >
                  </AttackResultsTable>
                </SplitterPanel>

                <!-- Details Panel -->
                <SplitterPanel
                  :size="60"
                  :min-size="35"
                  class="overflow-hidden"
                >
                  <Card
                    v-if="selectedResult"
                    class="h-full"
                    :pt="{
                      body: { class: 'h-full p-0' },
                      content: { class: 'h-full flex flex-col' },
                    }"
                  >
                    <template #content>
                      <div class="h-full flex flex-col">
                        <div class="p-3 border-b border-surface-600">
                          <div class="flex items-center justify-between">
                            <h4 class="text-base font-semibold">
                              {{
                                getAttackTypeLabel(selectedResult.attackType)
                              }}
                              Details
                            </h4>
                            <div class="flex items-center gap-2">
                              <span
                                :class="[
                                  getStatusIcon(selectedResult.status),
                                  getStatusColor(selectedResult.status),
                                ]"
                              ></span>
                              <span class="text-sm capitalize">{{
                                selectedResult.status
                              }}</span>
                            </div>
                          </div>
                        </div>

                        <div
                          class="flex-1 min-h-0"
                          style="height: 100%; max-height: 100%"
                        >
                          <TabView
                            :active-index="activeResultTab"
                            class="h-full"
                            :pt="{
                              panelContainer: {
                                class: 'h-full overflow-hidden',
                              },
                              panels: { class: 'h-full' },
                            }"
                            @update:active-index="activeResultTab = $event"
                          >
                            <!-- Request/Response Tab using Caido SDK -->
                            <TabPanel
                              header="Request/Response"
                              :pt="{ content: { class: 'h-full p-0' } }"
                            >
                              <div class="h-full flex">
                                <!-- Request Section (50% left) -->
                                <div
                                  class="w-1/2 border-r border-surface-600 flex flex-col"
                                >
                                  <div
                                    id="request-editor-container"
                                    style="height: 100%; flex: 1"
                                  ></div>
                                </div>

                                <!-- Response Section (50% right) -->
                                <div class="w-1/2 flex flex-col">
                                  <div
                                    id="response-editor-container"
                                    style="height: 100%; flex: 1"
                                  ></div>
                                </div>
                              </div>
                            </TabPanel>

                            <!-- Attack Data Tab -->
                            <TabPanel
                              header="Attack Data"
                              :pt="{ content: { class: 'h-full p-0' } }"
                            >
                              <div class="h-full flex flex-col">
                                <!-- Side-by-side Layout (Default) -->
                                <div
                                  v-if="!payloadExpanded && !responseExpanded"
                                  class="h-full flex"
                                >
                                  <!-- Attack Payload (50% width, 70% of container height) -->
                                  <div
                                    class="w-1/2 border-r border-surface-600 flex flex-col"
                                  >
                                    <div
                                      class="flex-shrink-0 flex items-center justify-between p-3 bg-surface-800 border-b border-surface-600"
                                    >
                                      <div>
                                        <div
                                          class="text-sm font-medium text-surface-200"
                                        >
                                          Attack Payload
                                        </div>
                                        <div class="text-xs text-surface-400">
                                          {{ selectedResult.attackType }} attack
                                          payload
                                        </div>
                                      </div>
                                      <div class="flex items-center gap-2">
                                        <button
                                          class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                          title="Copy payload"
                                          @click="
                                            copyToClipboard(
                                              selectedResult.payload,
                                            )
                                          "
                                        >
                                          <i class="fas fa-copy"></i>
                                        </button>
                                        <button
                                          class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                          title="Expand to full width"
                                          @click="payloadExpanded = true"
                                        >
                                          <i
                                            class="fas fa-expand-arrows-alt"
                                          ></i>
                                        </button>
                                      </div>
                                    </div>
                                    <div class="flex-1 overflow-auto min-h-0">
                                      <CodeEditor
                                        :content="selectedResult.payload"
                                        language="json"
                                        :read-only="true"
                                        :font-size="12"
                                      />
                                    </div>
                                  </div>

                                  <!-- Attack Response (50% width, 70% of container height) -->
                                  <div class="w-1/2 flex flex-col">
                                    <div
                                      class="flex-shrink-0 flex items-center justify-between p-3 bg-surface-800 border-b border-surface-600"
                                    >
                                      <div>
                                        <div
                                          class="text-sm font-medium text-surface-200"
                                        >
                                          Attack Response
                                        </div>
                                        <div class="text-xs text-surface-400">
                                          {{
                                            selectedResult.response
                                              ? `${selectedResult.response.body.length} bytes`
                                              : "No response"
                                          }}
                                        </div>
                                      </div>
                                      <div class="flex items-center gap-2">
                                        <button
                                          v-if="selectedResult.response"
                                          class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                          title="Copy response"
                                          @click="
                                            copyToClipboard(
                                              selectedResult.response.body,
                                            )
                                          "
                                        >
                                          <i class="fas fa-copy"></i>
                                        </button>
                                        <button
                                          class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                          title="Expand to full width"
                                          @click="responseExpanded = true"
                                        >
                                          <i
                                            class="fas fa-expand-arrows-alt"
                                          ></i>
                                        </button>
                                      </div>
                                    </div>
                                    <div class="flex-1 overflow-auto min-h-0">
                                      <CodeEditor
                                        v-if="selectedResult.response"
                                        :content="selectedResult.response.body"
                                        language="json"
                                        :read-only="true"
                                        :font-size="12"
                                      />
                                      <div
                                        v-else
                                        class="h-full flex items-center justify-center text-surface-500"
                                      >
                                        <div class="text-center">
                                          <i
                                            class="fas fa-times-circle text-3xl mb-3"
                                          ></i>
                                          <div>No response data available</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <!-- Expanded Layouts (stacked vertically with container scrolling and 45% height each) -->
                                <div v-else class="h-full overflow-auto">
                                  <div
                                    class="p-3 space-y-3 h-full flex flex-col gap-3"
                                  >
                                    <!-- Attack Payload (45% of container height when stacked) -->
                                    <div
                                      class="border border-surface-600 rounded flex-1"
                                    >
                                      <div
                                        class="flex items-center justify-between p-3 bg-surface-800 border-b border-surface-600"
                                      >
                                        <div>
                                          <div
                                            class="text-sm font-medium text-surface-200"
                                          >
                                            Attack Payload
                                          </div>
                                          <div class="text-xs text-surface-400">
                                            {{ selectedResult.attackType }}
                                            attack payload
                                          </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                          <button
                                            class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                            title="Copy payload"
                                            @click="
                                              copyToClipboard(
                                                selectedResult.payload,
                                              )
                                            "
                                          >
                                            <i class="fas fa-copy"></i>
                                          </button>
                                          <button
                                            class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                            title="Back to side-by-side"
                                            @click="
                                              payloadExpanded = false;
                                              responseExpanded = false;
                                            "
                                          >
                                            <i
                                              class="fas fa-compress-arrows-alt"
                                            ></i>
                                          </button>
                                        </div>
                                      </div>
                                      <div class="h-full overflow-auto min-h-0">
                                        <CodeEditor
                                          :content="selectedResult.payload"
                                          language="json"
                                          :read-only="true"
                                          :font-size="12"
                                        />
                                      </div>
                                    </div>

                                    <!-- Attack Response (45% of container height when stacked) -->
                                    <div
                                      class="border border-surface-600 rounded flex-1"
                                    >
                                      <div
                                        class="flex items-center justify-between p-3 bg-surface-800 border-b border-surface-600"
                                      >
                                        <div>
                                          <div
                                            class="text-sm font-medium text-surface-200"
                                          >
                                            Attack Response
                                          </div>
                                          <div class="text-xs text-surface-400">
                                            {{
                                              selectedResult.response
                                                ? `${selectedResult.response.body.length} bytes`
                                                : "No response"
                                            }}
                                          </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                          <button
                                            v-if="selectedResult.response"
                                            class="text-surface-400 hover:text-surface-200 p-1 rounded"
                                            title="Copy response"
                                            @click="
                                              copyToClipboard(
                                                selectedResult.response.body,
                                              )
                                            "
                                          >
                                            <i class="fas fa-copy"></i>
                                          </button>
                                        </div>
                                      </div>
                                      <div class="h-full overflow-auto min-h-0">
                                        <CodeEditor
                                          v-if="selectedResult.response"
                                          :content="
                                            selectedResult.response.body
                                          "
                                          language="json"
                                          :read-only="true"
                                          :font-size="12"
                                        />
                                        <div
                                          v-else
                                          class="h-full flex items-center justify-center text-surface-500"
                                        >
                                          <div class="text-center">
                                            <i
                                              class="fas fa-times-circle text-3xl mb-3"
                                            ></i>
                                            <div>
                                              No response data available
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TabPanel>

                            <!-- Security Findings Tab (show for all attacks with findings) -->
                            <TabPanel
                              v-if="selectedResult.findings.length > 0"
                              header="Security Findings"
                              :pt="{ content: { class: 'h-full p-0' } }"
                            >
                              <div class="h-full overflow-auto p-3">
                                <div class="space-y-4">
                                  <div
                                    v-for="finding in selectedResult.findings"
                                    :key="finding.title"
                                    class="border rounded p-4"
                                    :class="{
                                      'border-red-500 bg-red-950 bg-opacity-20':
                                        finding.severity === 'critical' ||
                                        finding.severity === 'high',
                                      'border-yellow-500 bg-yellow-950 bg-opacity-20':
                                        finding.severity === 'medium',
                                      'border-blue-500 bg-blue-950 bg-opacity-20':
                                        finding.severity === 'low',
                                      'border-gray-500 bg-gray-950 bg-opacity-20':
                                        finding.severity === 'info',
                                    }"
                                  >
                                    <div
                                      class="flex items-start justify-between mb-3"
                                    >
                                      <h5
                                        class="font-semibold text-surface-100 flex-1"
                                      >
                                        {{ finding.title }}
                                      </h5>
                                      <div class="flex items-center gap-2 ml-4">
                                        <span
                                          class="px-2 py-1 rounded text-xs font-medium uppercase"
                                          :class="{
                                            'bg-red-600 text-red-100':
                                              finding.severity === 'critical',
                                            'bg-red-500 text-red-100':
                                              finding.severity === 'high',
                                            'bg-yellow-500 text-yellow-100':
                                              finding.severity === 'medium',
                                            'bg-blue-500 text-blue-100':
                                              finding.severity === 'low',
                                            'bg-gray-500 text-gray-100':
                                              finding.severity === 'info',
                                          }"
                                        >
                                          {{ finding.severity }}
                                        </span>

                                        <!-- Create Finding Button (for all severities) -->
                                        <Button
                                          label="Create Finding"
                                          icon="fas fa-plus"
                                          size="small"
                                          :severity="
                                            finding.severity === 'critical' ||
                                            finding.severity === 'high'
                                              ? 'danger'
                                              : finding.severity === 'medium'
                                                ? 'warn'
                                                : finding.severity === 'low'
                                                  ? 'info'
                                                  : 'secondary'
                                          "
                                          @click="createCaidoFinding(finding)"
                                        />
                                      </div>
                                    </div>

                                    <p
                                      class="text-sm text-surface-300 mb-3 leading-relaxed"
                                    >
                                      {{ finding.description }}
                                    </p>

                                    <div v-if="finding.evidence" class="mb-3">
                                      <div
                                        class="text-xs font-medium text-surface-400 mb-2"
                                      >
                                        Evidence:
                                      </div>
                                      <div
                                        class="text-xs font-mono text-surface-200 bg-surface-800 p-3 rounded border overflow-auto max-h-32"
                                      >
                                        {{ finding.evidence }}
                                      </div>
                                    </div>

                                    <div
                                      v-if="finding.recommendation"
                                      class="bg-blue-950 bg-opacity-30 border border-blue-700 rounded p-3"
                                    >
                                      <div
                                        class="text-xs font-medium text-blue-300 mb-2"
                                      >
                                        <i class="fas fa-lightbulb"></i>
                                        Recommendation:
                                      </div>
                                      <div
                                        class="text-sm text-blue-200 leading-relaxed"
                                      >
                                        {{ finding.recommendation }}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TabPanel>
                          </TabView>
                        </div>
                      </div>
                    </template>
                  </Card>
                </SplitterPanel>
              </Splitter>
            </div>

            <!-- Empty State -->
            <div v-else class="flex-1 flex items-center justify-center">
              <div class="text-center text-surface-500">
                <i class="fas fa-shield-alt text-4xl mb-4"></i>
                <div class="text-lg mb-2">No attack results</div>
                <div class="text-sm">
                  Configure and execute attacks to see results here
                </div>
              </div>
            </div>
          </div>
        </SplitterPanel>
      </Splitter>
    </div>
  </div>
</template>
