<script setup lang="ts">
import Card from "primevue/card";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import { computed, nextTick, onMounted, ref, watch } from "vue";

import CodePanel from "./CodePanel.vue";
import Header from "./Header.vue";
import TreePanel from "./TreePanel.vue";
import { useCodeFormatter } from "./useCodeFormatter";
import { useSessions } from "./useSessions";
import { useTreeData } from "./useTreeData";

import type { TreeItem } from "@/components/common/CTree";
import { SessionTab } from "@/components/dashboard";
import { useSDK } from "@/plugins/sdk";
import { createStorageService } from "@/services/storage";

const props = defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
}>();

const {
  sessions,
  selectedSessionId,
  selectedSession,
  loadSessions,
  selectSession,
  deleteSession,
  renameSession,
  clearAllData,
} = useSessions();
const { getTreeData } = useTreeData(selectedSession);

const treeData = computed(() => getTreeData());
const filter = ref("");

const expandedKeys = ref<Set<string>>(new Set());
const selectedKey = ref<string>();
const selectionKeys = ref<Set<string>>(new Set());

const {
  selectedCode,
  selectedQuery,
  selectedVariables,
  selectedType,
  selectedLanguage,
  handleNodeSelect,
  clearCode,
} = useCodeFormatter(selectedSession);

const sdk = useSDK();
const storageService = createStorageService(sdk);

const onNodeSelect = (item: TreeItem<unknown>) => {
  selectedKey.value = item.id;
  selectionKeys.value = new Set([item.id]);

  const data = item.data as { type: string; content: unknown } | undefined;
  if (data !== undefined) {
    handleNodeSelect({
      data: data,
    });
  }
  saveExplorerState();
};

const saveExplorerState = () => {
  if (selectedSessionId.value !== undefined) {
    storageService.setDeferred(`explorer-state-${selectedSessionId.value}`, {
      expandedKeys: Array.from(expandedKeys.value),
      selectedKey: selectedKey.value,
    });
  }
};

const loadExplorerState = async () => {
  if (selectedSessionId.value === undefined) {
    return;
  }

  await nextTick();
  await nextTick();

  const state = storageService.get<{
    expandedKeys?: string[];
    selectedKey?: string;
  }>(`explorer-state-${selectedSessionId.value}`) ?? {
    expandedKeys: storageService.get<string[]>(
      `explorer-expanded-keys-${selectedSessionId.value}`,
    ),
    selectedKey: storageService.get<string>(
      `explorer-selected-node-${selectedSessionId.value}`,
    ),
  };
  const storedExpandedKeys = state?.expandedKeys;
  if (storedExpandedKeys && Array.isArray(storedExpandedKeys)) {
    expandedKeys.value = new Set(storedExpandedKeys);
    await nextTick();
  } else {
    expandedKeys.value = new Set();
  }

  const storedSelectedNodeKey = state?.selectedKey;

  if (storedSelectedNodeKey !== undefined && storedSelectedNodeKey !== "") {
    selectedKey.value = storedSelectedNodeKey;
    selectionKeys.value = new Set([storedSelectedNodeKey]);
    await nextTick();

    const foundItem = treeData.value.find(
      (i) => i.id === storedSelectedNodeKey,
    );
    if (foundItem) {
      handleNodeSelect({
        data: foundItem.data as { type: string; content: unknown },
      });
    }
  } else {
    selectedKey.value = undefined;
    selectionKeys.value = new Set();
    clearCode();
  }
};

const handleSelectSession = async (sessionId: string) => {
  clearCode();
  selectedKey.value = undefined;
  selectionKeys.value = new Set();
  expandedKeys.value = new Set();
  await selectSession(sessionId);
};

const handleClearAll = async () => {
  clearCode();
  selectedKey.value = undefined;
  selectionKeys.value = new Set();
  expandedKeys.value = new Set();
  await clearAllData();
};

const handleOpenInVoyager = () => {
  if (props.navigateTo) {
    props.navigateTo("Voyager");
  }
};

const handleSendToAttacker = () => {
  if (props.navigateTo) {
    props.navigateTo("Attacks");
  }
};

const handleRenameSession = (sessionId: string, newName: string) => {
  renameSession(sessionId, newName);
};

watch(selectedSessionId, async () => {
  if (selectedSessionId.value !== undefined) {
    await nextTick();
    await nextTick();
    await loadExplorerState();
  } else {
    selectedKey.value = undefined;
    selectionKeys.value = new Set();
    expandedKeys.value = new Set();
  }
});

onMounted(async () => {
  await loadSessions();
  if (selectedSessionId.value !== undefined) {
    await nextTick();
    await nextTick();
    await loadExplorerState();
  }
});
</script>

<template>
  <div class="flex flex-col h-full gap-1 overflow-hidden">
    <Header :on-clear-all="handleClearAll" />

    <Card
      v-if="sessions.length > 0"
      class="h-fit"
      :pt="{
        body: { class: 'h-fit p-0' },
        content: { class: 'h-fit flex flex-col' },
      }"
    >
      <template #content>
        <div class="flex gap-2 p-4 flex-wrap">
          <SessionTab
            v-for="session in sessions"
            :key="session.id"
            :is-selected="selectedSessionId === session.id"
            :label="session.title"
            :status="session.status"
            @select="handleSelectSession(session.id)"
            @rename="(newName) => handleRenameSession(session.id, newName)"
            @delete="deleteSession(session.id)"
          />
        </div>
      </template>
    </Card>

    <div v-if="selectedSession" class="flex-1 min-h-0">
      <Card
        class="h-full"
        :pt="{
          body: { class: 'h-full p-0' },
          content: { class: 'h-full flex flex-col' },
        }"
      >
        <template #content>
          <div class="h-full p-2">
            <Splitter class="h-full">
              <SplitterPanel :size="40" :min-size="20">
                <TreePanel
                  v-model:expanded-keys="expandedKeys"
                  v-model:selection-keys="selectionKeys"
                  :items="treeData"
                  :filter="filter"
                  @update:filter="filter = $event"
                  @node-select="onNodeSelect"
                />
              </SplitterPanel>

              <SplitterPanel :size="60" :min-size="30">
                <CodePanel
                  :selected-code="selectedCode"
                  :selected-query="selectedQuery"
                  :selected-variables="selectedVariables"
                  :selected-type="selectedType"
                  :selected-language="selectedLanguage"
                  :selected-session="selectedSession"
                  @open-in-voyager="handleOpenInVoyager"
                  @send-to-attacker="handleSendToAttacker"
                />
              </SplitterPanel>
            </Splitter>
          </div>
        </template>
      </Card>
    </div>

    <div v-else class="flex-1 flex items-center justify-center">
      <div class="text-center text-surface-500">
        <i class="fas fa-search text-4xl mb-4"></i>
        <div class="text-lg mb-2">No GraphQL sessions found</div>
        <div>
          Go to the <strong>Dashboard</strong> tab to scan a GraphQL endpoint
        </div>
      </div>
    </div>
  </div>
</template>
