<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { computed, ref } from "vue";

import { useSDK } from "@/plugins/sdk";

defineOptions({ name: "ImportSchemaDialog" });

const props = defineProps<{
  visible: boolean;
  importFile: (file: File) => Promise<boolean>;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
}>();

const sdk = useSDK();

const selectedFile = ref<File | undefined>(undefined);
const isDraggingOver = ref(false);
const isImporting = ref(false);
const fileInputRef = ref<HTMLInputElement | undefined>(undefined);

const triggerFileInput = () => {
  if (isImporting.value) return;
  fileInputRef.value?.click();
};

const isVisible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

const acceptedExtensions = ".json";

const handleFileSelect = (event: Event) => {
  if (isImporting.value) return;
  const input = event.target as HTMLInputElement;
  if (input.files !== null && input.files.length > 0) {
    const file = input.files[0];
    if (file !== undefined) {
      selectedFile.value = file;
    }
  }
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  if (isImporting.value) return;
  isDraggingOver.value = false;

  if (
    event.dataTransfer?.files !== undefined &&
    event.dataTransfer.files.length > 0
  ) {
    const file = event.dataTransfer.files[0];
    if (file !== undefined) {
      selectedFile.value = file;
    }
  }
};

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
  if (isImporting.value) return;
  isDraggingOver.value = true;
};

const handleDragLeave = () => {
  isDraggingOver.value = false;
};

const clearFile = () => {
  if (isImporting.value) return;
  selectedFile.value = undefined;
  if (fileInputRef.value !== undefined) fileInputRef.value.value = "";
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const handleImport = async () => {
  if (selectedFile.value === undefined) {
    sdk.window.showToast("Please select a file first", { variant: "warning" });
    return;
  }

  isImporting.value = true;
  try {
    if (await props.importFile(selectedFile.value)) isVisible.value = false;
  } finally {
    isImporting.value = false;
  }
};

const resetAndClose = () => {
  selectedFile.value = undefined;
  if (fileInputRef.value !== undefined) fileInputRef.value.value = "";
  isImporting.value = false;
  isVisible.value = false;
};
</script>

<template>
  <Dialog
    v-model:visible="isVisible"
    modal
    :style="{ width: '520px' }"
    :closable="!isImporting"
    :pt="{
      root: { class: 'p-0 rounded-lg overflow-hidden' },
      header: {
        class:
          'p-4 border-b border-surface-700 bg-surface-800 flex items-center justify-between',
      },
      content: { class: 'p-4 bg-surface-900' },
      footer: {
        class:
          'p-4 border-t border-surface-700 flex justify-end gap-2 bg-surface-800',
      },
      closeButton: {
        class:
          'text-surface-300 hover:text-surface-100 w-8 h-8 flex items-center justify-center',
      },
      closeButtonIcon: { class: 'text-surface-300 text-lg' },
    }"
    @hide="resetAndClose"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <i class="fas fa-file-import text-primary-400"></i>
        <span class="text-lg font-semibold text-surface-100"
          >Import Schema</span
        >
      </div>
    </template>

    <div class="space-y-4">
      <p class="text-sm text-surface-300">
        Import a GraphQL introspection JSON file to explore the schema in
        Explorer and Voyager.
      </p>

      <div
        :class="{
          'border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200': true,
          'cursor-pointer': !isImporting,
          'cursor-not-allowed opacity-60': isImporting,
          'border-primary-400 bg-primary-900/20': isDraggingOver,
          'border-green-500 bg-green-900/10':
            !isDraggingOver && selectedFile !== undefined,
          'border-surface-600 hover:border-surface-400 bg-surface-800':
            !isDraggingOver && selectedFile === undefined,
        }"
        :aria-disabled="isImporting"
        @drop="handleDrop"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @click="triggerFileInput"
      >
        <input
          ref="fileInputRef"
          type="file"
          :accept="acceptedExtensions"
          :disabled="isImporting"
          class="hidden"
          @change="handleFileSelect"
        />

        <div v-if="selectedFile === undefined">
          <i class="fas fa-cloud-upload-alt text-3xl text-surface-400 mb-3"></i>
          <div class="text-sm font-medium text-surface-200 mb-1">
            Drop a JSON file here or click to browse
          </div>
          <div class="text-xs text-surface-500">
            Supports introspection query results (.json)
          </div>
        </div>

        <div v-else>
          <div class="flex items-center justify-center gap-3">
            <i class="fas fa-file-code text-2xl text-green-400"></i>
            <div class="text-left">
              <div class="text-sm font-medium text-surface-100">
                {{ selectedFile.name }}
              </div>
              <div class="text-xs text-surface-400">
                {{ formatFileSize(selectedFile.size) }}
              </div>
            </div>
            <Button
              v-tooltip="'Remove file'"
              icon="fas fa-times"
              severity="danger"
              size="small"
              text
              :disabled="isImporting"
              @click.stop="clearFile"
            />
          </div>
        </div>
      </div>

      <div
        class="text-xs text-surface-500 border border-surface-700 rounded p-3 bg-surface-800"
      >
        <div class="flex items-center gap-2 mb-2 text-surface-300 font-medium">
          <i class="fas fa-info-circle"></i>
          <span>Supported format</span>
        </div>
        <div class="space-y-1">
          <div>
            <strong>JSON Introspection</strong> - the result of running an
            introspection query against a GraphQL endpoint.
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        severity="secondary"
        outlined
        size="small"
        :disabled="isImporting"
        @click="resetAndClose"
      />
      <Button
        label="Import"
        icon="fas fa-file-import"
        size="small"
        :loading="isImporting"
        :disabled="isImporting || selectedFile === undefined"
        @click="handleImport"
      />
    </template>
  </Dialog>
</template>
