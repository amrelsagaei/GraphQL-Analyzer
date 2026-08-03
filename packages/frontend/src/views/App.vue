<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { Attacks } from "@/components/attacks";
import { Navigation } from "@/components/common";
import { Dashboard } from "@/components/dashboard";
import { Docs } from "@/components/Docs";
import { Explorer } from "@/components/Explorer";
import { Voyager } from "@/components/Voyager";
import { useSDK } from "@/plugins/sdk";
import { createStorageService } from "@/services/storage";

type PageType = "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "Docs";

const sdk = useSDK();
const storage = createStorageService(sdk);
const currentPage = ref<PageType>("Dashboard");

const component = computed(() => {
  switch (currentPage.value) {
    case "Dashboard":
      return Dashboard;
    case "Explorer":
      return Explorer;
    case "Voyager":
      return Voyager;
    case "Attacks":
      return Attacks;
    case "Docs":
      return Docs;
    default:
      return Dashboard;
  }
});

const handlePageChange = (page: PageType) => {
  currentPage.value = page;
};

const handleNavigationEvent = (event: CustomEvent) => {
  const targetPage = event.detail?.page;
  if (targetPage !== undefined && targetPage !== null) {
    currentPage.value = targetPage as PageType;
  }
};

const checkPendingNavigation = async () => {
  try {
    const target = storage.get<string>("graphql-analyzer-navigate-to");
    const timestamp = storage.get<string>(
      "graphql-analyzer-navigate-timestamp",
    );

    if (target !== undefined && timestamp !== undefined) {
      const now = Date.now();
      const parsedTimestamp = parseInt(timestamp);
      const shouldNavigate =
        !Number.isNaN(parsedTimestamp) && now - parsedTimestamp < 5000;

      if (shouldNavigate) {
        currentPage.value = target as PageType;
      }

      await storage.removeMultiple([
        "graphql-analyzer-navigate-to",
        "graphql-analyzer-navigate-timestamp",
      ]);
    }
  } catch {
    // Ignore navigation errors
  }
};

const handleContextScan = (event: CustomEvent) => {
  const requestId = event.detail?.requestId;
  if (requestId !== undefined && requestId !== null) {
    if (currentPage.value !== "Dashboard") {
      currentPage.value = "Dashboard";
    }
    window.dispatchEvent(
      new CustomEvent("graphql-analyzer-context-scan-request", {
        detail: { requestId },
      }),
    );
  }
};

onMounted(async () => {
  await checkPendingNavigation();

  window.addEventListener(
    "graphql-analyzer-navigate",
    handleNavigationEvent as EventListener,
  );
  window.addEventListener(
    "graphql-analyzer-context-scan",
    handleContextScan as EventListener,
  );
  window.addEventListener("focus", checkPendingNavigation);
});

onUnmounted(() => {
  window.removeEventListener(
    "graphql-analyzer-navigate",
    handleNavigationEvent as EventListener,
  );
  window.removeEventListener(
    "graphql-analyzer-context-scan",
    handleContextScan as EventListener,
  );
  window.removeEventListener("focus", checkPendingNavigation);
});
</script>

<template>
  <div class="h-full flex flex-col gap-1">
    <Navigation :current-page="currentPage" @page-change="handlePageChange" />

    <div class="flex-1 min-h-0">
      <KeepAlive>
        <component :is="component" :navigate-to="handlePageChange" />
      </KeepAlive>
    </div>
  </div>
</template>

<style scoped>
#plugin--graphql-analyzer {
  height: 100%;
}
</style>
