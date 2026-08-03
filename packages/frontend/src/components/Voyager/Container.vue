<script setup lang="ts">
import * as d3 from "d3";
import Card from "primevue/card";
import type { GraphQLSchema } from "shared";
import {
  nextTick,
  onActivated,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from "vue";

import Header from "./Header.vue";
import Minimap from "./Minimap.vue";
import NavigationSidebar from "./NavigationSidebar.vue";
import SessionSelector from "./SessionSelector.vue";
import type { VoyagerData } from "./types";
import { useVoyagerSessions } from "./useSessions";
import { useVoyagerHighlight } from "./useVoyagerHighlight";
import { useVoyagerMinimap } from "./useVoyagerMinimap";
import { useVoyagerNavigation } from "./useVoyagerNavigation";
import { useVoyagerVisualization } from "./useVoyagerVisualization";
import { useVoyagerZoom } from "./useVoyagerZoom";
import ZoomControls from "./ZoomControls.vue";

import { useSDK } from "@/plugins/sdk";
import { createStorageService } from "@/services/storage";

defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
}>();

const voyagerContainer = ref<HTMLDivElement | undefined>(undefined);
const minimapSvg = ref<SVGSVGElement | undefined>(undefined);
const currentZoom = ref<d3.ZoomBehavior<SVGSVGElement, unknown> | undefined>(
  undefined,
);
const currentTransform = ref<d3.ZoomTransform>(d3.zoomIdentity);
const cachedD3Data = shallowRef<VoyagerData>();
const currentSchema = shallowRef<GraphQLSchema>();
const searchTerm = ref("");
const debouncedSearchTerm = ref("");
const searchDebounceTimer = ref<number | undefined>(undefined);
const isNavExpanded = ref(true);

const sdk = useSDK();
const storageService = createStorageService(sdk);

const {
  sessions,
  selectedSessionId,
  selectedSession,
  introspectionSessions,
  loadSessions,
  selectSession,
  handleStorageChange,
} = useVoyagerSessions();

const {
  highlightedNodeId,
  updateNodeStyles,
  toggleNodeHighlight,
  refreshNodeStyles,
} = useVoyagerHighlight(voyagerContainer, cachedD3Data);

const { minimapViewBox, minimapViewport, setupMinimapDrag } = useVoyagerMinimap(
  minimapSvg,
  voyagerContainer,
  currentZoom,
  currentTransform,
  cachedD3Data,
);

const { focusOnNode, zoomIn, zoomOut, resetZoom, fitToView } = useVoyagerZoom(
  voyagerContainer,
  currentZoom,
  currentTransform,
  cachedD3Data,
);

const { expandedSections, filteredItems, onNavItemClick } =
  useVoyagerNavigation(
    currentSchema,
    debouncedSearchTerm,
    cachedD3Data,
    focusOnNode,
  );

const { parseSchemaToD3, loadVoyagerVisualization, scheduleRender } =
  useVoyagerVisualization(
    voyagerContainer,
    currentZoom,
    currentTransform,
    highlightedNodeId,
    cachedD3Data,
    debouncedSearchTerm,
    updateNodeStyles,
    toggleNodeHighlight,
    refreshNodeStyles,
    (transform) => saveTransform(selectedSessionId.value, transform),
  );

watch(searchTerm, (newValue: string) => {
  if (searchDebounceTimer.value !== undefined) {
    clearTimeout(searchDebounceTimer.value);
  }
  searchDebounceTimer.value = window.setTimeout(() => {
    debouncedSearchTerm.value = newValue;
  }, 300);
});

watch(debouncedSearchTerm, () => scheduleRender());

watch(cachedD3Data, () => nextTick(setupMinimapDrag));

const saveTransform = (
  sessionId: string | undefined,
  transform: d3.ZoomTransform,
) => {
  if (sessionId === undefined) return;
  const isIdentity =
    transform.x === 0 && transform.y === 0 && transform.k === 1;
  if (isIdentity) {
    storageService.setDeferred(`voyager-transform-${sessionId}`, undefined);
    return;
  }

  const transformData = {
    x: transform.x,
    y: transform.y,
    k: transform.k,
  };
  storageService.setDeferred(`voyager-transform-${sessionId}`, transformData);
};

const getSavedTransform = (
  sessionId: string | undefined,
): d3.ZoomTransform | undefined => {
  if (sessionId === undefined) return undefined;
  const saved = storageService.get<{ x: number; y: number; k: number }>(
    `voyager-transform-${sessionId}`,
  );
  if (
    saved !== undefined &&
    typeof saved.x === "number" &&
    typeof saved.y === "number" &&
    typeof saved.k === "number"
  ) {
    return d3.zoomIdentity.translate(saved.x, saved.y).scale(saved.k);
  }
  return undefined;
};

const handleSelectSession = async (sessionId: string) => {
  await selectSession(sessionId);
};

const handleMinimapSvgReady = (svg: SVGSVGElement) => {
  minimapSvg.value = svg;
  nextTick(() => {
    setTimeout(() => {
      setupMinimapDrag();
    }, 50);
  });
};

const restoreSessionData = async (sessionId: string, showToasts = false) => {
  const session = sessions.value.find(
    (candidate) => candidate.id === sessionId,
  );
  if (session?.schema !== undefined) {
    currentSchema.value = session.schema;
    cachedD3Data.value = parseSchemaToD3(session.schema);
    highlightedNodeId.value = undefined;
    const savedTransform = getSavedTransform(sessionId);
    await nextTick();
    loadVoyagerVisualization(savedTransform, showToasts);
    await nextTick();
  } else {
    currentSchema.value = undefined;
    cachedD3Data.value = undefined;
    highlightedNodeId.value = undefined;
  }
};

watch(
  selectedSessionId,
  async (newSessionId, oldSessionId) => {
    if (newSessionId !== undefined && newSessionId !== oldSessionId) {
      await restoreSessionData(newSessionId, oldSessionId !== undefined);
    } else if (newSessionId === undefined) {
      currentSchema.value = undefined;
      cachedD3Data.value = undefined;
      highlightedNodeId.value = undefined;
    }
  },
  { immediate: false },
);

onMounted(async () => {
  await loadSessions();

  window.addEventListener("storage", handleStorageChange);
  window.addEventListener(
    "graphql-analyzer-sessions-updated",
    handleStorageChange,
  );
});

onActivated(async () => {
  await handleStorageChange();
});

onUnmounted(() => {
  window.removeEventListener("storage", handleStorageChange);
  window.removeEventListener(
    "graphql-analyzer-sessions-updated",
    handleStorageChange,
  );
});
</script>

<template>
  <div class="flex flex-col h-full gap-1 overflow-hidden">
    <Header :navigate-to="navigateTo" />

    <SessionSelector
      :sessions="introspectionSessions"
      :selected-session-id="selectedSessionId"
      @select="handleSelectSession"
    />

    <div class="flex-1 min-h-0">
      <Card
        class="h-full"
        :pt="{
          body: { class: 'h-full p-0' },
          content: { class: 'h-full flex flex-col' },
        }"
      >
        <template #content>
          <div
            v-if="introspectionSessions.length === 0"
            class="h-full flex items-center justify-center"
          >
            <div class="text-center text-surface-500">
              <i class="fas fa-project-diagram text-4xl mb-4"></i>
              <div class="text-lg mb-2">No Sessions Available</div>
              <div class="text-sm">
                <span v-if="sessions.length === 0"
                  >No sessions found. Go to Dashboard to scan a GraphQL
                  endpoint.</span
                >
                <span v-else
                  >No sessions with introspection support available for
                  viewing.</span
                >
              </div>
            </div>
          </div>
          <div
            v-else-if="
              selectedSession === undefined || cachedD3Data === undefined
            "
            class="h-full flex items-center justify-center"
          >
            <div class="text-center text-surface-500">
              <i class="fas fa-project-diagram text-4xl mb-4"></i>
              <div class="text-lg mb-2">Select a Session</div>
              <div class="text-sm">
                Choose a session above to view its interactive GraphQL schema
                graph.
              </div>
            </div>
          </div>

          <div v-else class="h-full flex">
            <NavigationSidebar
              :is-expanded="isNavExpanded"
              :search-term="searchTerm"
              :filtered-items="filteredItems"
              :expanded-sections="expandedSections"
              @update:search-term="searchTerm = $event"
              @update:is-expanded="isNavExpanded = $event"
              @item-click="onNavItemClick"
            />

            <div class="flex-1 relative">
              <div
                ref="voyagerContainer"
                class="h-full w-full"
                style="background: hsl(var(--c-surface-800))"
              />

              <ZoomControls
                v-if="selectedSession !== undefined"
                @zoom-in="zoomIn"
                @zoom-out="zoomOut"
                @fit-to-view="fitToView"
                @reset-zoom="resetZoom"
              />

              <Minimap
                v-if="
                  selectedSession !== undefined && cachedD3Data !== undefined
                "
                :minimap-view-box="minimapViewBox"
                :minimap-viewport="minimapViewport"
                :cached-d3-data="cachedD3Data"
                @minimap-svg-ready="handleMinimapSvgReady"
              />
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
:deep(svg) {
  cursor: grab;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

:deep(svg:active) {
  cursor: grabbing;
}

:deep(.node) {
  transition: all 0.2s ease;
}

:deep(.link) {
  transition: opacity 0.2s ease;
}
</style>
