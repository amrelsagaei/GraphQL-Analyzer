<script setup lang="ts">
import Button from "primevue/button";
import { computed } from "vue";

import type { ExplorerSession } from "./useSessions";

import { CodeEditor } from "@/components/common";
import { useSDK } from "@/plugins/sdk";
import { createReplayService } from "@/services/replay";
import { createStorageService } from "@/services/storage";
import { replaceHttpBody } from "@/utils/graphql";

const sdk = useSDK();
const storage = createStorageService(sdk);

const props = defineProps<{
  selectedCode: string;
  selectedQuery?: string;
  selectedVariables?: Record<string, string>;
  selectedType: string;
  selectedLanguage: "json" | "javascript" | "graphql";
  selectedSession: ExplorerSession | undefined;
}>();

const emit = defineEmits<{
  copy: [];
  openInVoyager: [];
  sendToAttacker: [];
}>();

const isFileImport = computed(
  () => props.selectedSession?.sourceType === "file-import",
);

const copyToClipboard = async () => {
  if (props.selectedCode !== "") {
    try {
      await navigator.clipboard.writeText(props.selectedCode);
      sdk.window.showToast("Code copied to clipboard!", { variant: "success" });
      emit("copy");
    } catch (error) {
      sdk.window.showToast("Failed to copy to clipboard", { variant: "error" });
    }
  }
};

const openInVoyager = async () => {
  if (props.selectedSession !== undefined) {
    await storage.set("voyager-auto-select-session", props.selectedSession.id);
    emit("openInVoyager");
  }
};

const sendToAttacker = async () => {
  if (props.selectedSession === undefined) return;

  const requestId =
    props.selectedSession?.requestId ??
    props.selectedSession?.url?.replace("request:", "");
  if (requestId === undefined || requestId === null || requestId === "") {
    sdk.window.showToast("No request ID available", { variant: "error" });
    return;
  }

  await storage.setMultiple({
    "graphql-analyzer-navigate-to": "Attacks",
    "graphql-analyzer-navigate-timestamp": Date.now().toString(),
    "graphql-analyzer-context-attack-request-id": requestId,
  });

  window.dispatchEvent(
    new CustomEvent("graphql-analyzer-navigate", {
      detail: { page: "Attacks" },
    }),
  );

  window.dispatchEvent(
    new CustomEvent("graphql-analyzer-context-attack", {
      detail: { requestId },
    }),
  );

  emit("sendToAttacker");
};

const replayRequestId = computed(
  () =>
    props.selectedSession?.requestId ??
    props.selectedSession?.url?.replace("request:", ""),
);

const canSendToReplay = computed(
  () =>
    props.selectedQuery !== undefined &&
    !isFileImport.value &&
    replayRequestId.value !== undefined &&
    replayRequestId.value !== "",
);

const sendToReplay = async () => {
  const query = props.selectedQuery;
  const requestId = replayRequestId.value;
  if (query === undefined || requestId === undefined || requestId === "") {
    return;
  }

  const info = await sdk.backend.getRequestInfo(requestId);
  if (info.kind === "Error") {
    sdk.window.showToast(info.error, { variant: "error" });
    return;
  }

  const variables = props.selectedVariables;
  const body =
    variables !== undefined
      ? JSON.stringify({ query, variables })
      : JSON.stringify({ query });
  const raw = replaceHttpBody(info.value.raw, body);

  const result = await createReplayService(sdk).createReplayFromRequest(
    raw,
    info.value.url,
  );
  if (result.kind === "Error") {
    sdk.window.showToast(`Failed to send to Replay: ${result.error}`, {
      variant: "error",
    });
    return;
  }

  sdk.window.showToast(`Sent to Replay: ${result.value.sessionName}`, {
    variant: "success",
  });
};
</script>

<template>
  <div class="h-full overflow-hidden pl-2 flex flex-col">
    <div v-if="selectedCode" class="h-full flex flex-col">
      <div class="flex justify-between items-center mb-3 pt-2">
        <div class="text-sm font-medium capitalize text-surface-200">
          {{ selectedType.replace("-", " ") }}
        </div>
        <div class="flex gap-2">
          <Button
            v-tooltip="
              canSendToReplay
                ? 'Send to Replay'
                : 'Select a query or mutation from an introspected endpoint'
            "
            icon="fas fa-paper-plane"
            size="small"
            text
            severity="primary"
            class="text-xs"
            :disabled="!canSendToReplay"
            @click="sendToReplay"
          />
          <Button
            v-tooltip="
              isFileImport
                ? 'Cannot attack imported schemas (no endpoint)'
                : 'Send to Attacker'
            "
            icon="fas fa-shield-alt"
            size="small"
            text
            severity="danger"
            class="text-xs"
            :disabled="isFileImport"
            @click="sendToAttacker"
          />
          <Button
            v-tooltip="'View in Voyager'"
            icon="fas fa-project-diagram"
            size="small"
            text
            severity="secondary"
            class="text-xs"
            @click="openInVoyager"
          />
          <Button
            v-tooltip="'Copy to clipboard'"
            icon="fas fa-copy"
            size="small"
            text
            severity="secondary"
            class="text-xs"
            @click="copyToClipboard"
          />
        </div>
      </div>
      <div class="flex-1 min-h-0">
        <CodeEditor
          :content="selectedCode"
          :language="selectedLanguage"
          :read-only="true"
        />
      </div>
    </div>
    <div v-else class="text-center text-surface-500 py-8">
      <i class="fas fa-mouse-pointer text-3xl mb-3"></i>
      <div>Select an item from the tree to view details</div>
    </div>
  </div>
</template>
