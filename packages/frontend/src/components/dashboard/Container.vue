<script setup lang="ts">
import { onActivated, onMounted, ref } from "vue";

import Header from "./Header.vue";
import HeadersForm from "./HeadersForm.vue";
import ImportSchemaDialog from "./ImportSchemaDialog.vue";
import RecentActivity from "./RecentActivity.vue";
import ScanForm from "./ScanForm.vue";
import { useScanning } from "./useScanning";
import { useSchemaImport } from "./useSchemaImport";

defineOptions({ name: "DashboardContainer" });

const props = defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
}>();

const {
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
} = useScanning(props.navigateTo);

const { importSchemaFile } = useSchemaImport(
  props.navigateTo,
  loadRecentSessions,
);

const showImportDialog = ref(false);

onMounted(() => {
  loadRecentSessions();
});

onActivated(() => {
  loadRecentSessions();
});
</script>

<template>
  <div class="flex flex-col h-full gap-1 overflow-hidden">
    <Header @import-schema="showImportDialog = true" />

    <div class="flex gap-2 flex-1 min-h-0">
      <div class="flex-1 flex flex-col gap-2">
        <ScanForm
          v-model:scan-url="scanUrl"
          :is-scanning="isScanning"
          @scan="handleScan"
          @clear-fields="
            () => {
              scanUrl = '';
              customHeaders = [];
            }
          "
        />
        <HeadersForm
          :custom-headers="customHeaders"
          :parsed-headers="parsedHeaders"
          :is-scanning="isScanning"
          @add-header="addCustomHeader"
          @remove-header="removeCustomHeader"
        />
      </div>

      <RecentActivity
        :recent-sessions="recentSessions"
        @select-session="selectSession"
        @delete-all-data="deleteAllData"
      />
    </div>

    <ImportSchemaDialog
      v-model:visible="showImportDialog"
      :import-file="importSchemaFile"
    />
  </div>
</template>
