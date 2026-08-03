<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";

import type { NavItem } from "./types";

defineProps<{
  isExpanded: boolean;
  searchTerm: string;
  filteredItems: NavItem[];
  expandedSections: Record<string, boolean>;
}>();

defineEmits<{
  "update:searchTerm": [value: string];
  "update:isExpanded": [value: boolean];
  "item-click": [item: NavItem];
}>();

const shouldShowChildren = (
  item: NavItem,
  expandedSections: Record<string, boolean>,
): boolean => {
  return expandedSections[item.name] === true;
};
</script>

<template>
  <div
    v-if="isExpanded"
    class="w-80 bg-surface-900 border-r border-surface-600 flex flex-col overflow-hidden"
  >
    <div class="p-4 border-b border-surface-600">
      <div class="flex items-center justify-between mb-3">
        <h4 class="font-semibold text-surface-100">Schema Navigation</h4>
        <Button
          icon="fas fa-times"
          text
          size="small"
          class="text-surface-400 hover:text-surface-200"
          @click="$emit('update:isExpanded', false)"
        />
      </div>
      <InputText
        :model-value="searchTerm"
        placeholder="Search schema..."
        class="w-full"
        size="small"
        @update:model-value="$emit('update:searchTerm', $event ?? '')"
      />
    </div>

    <div class="flex-1 overflow-y-auto overflow-x-hidden p-2">
      <div
        v-for="item in filteredItems"
        :key="item.name"
        class="mb-1"
        style="content-visibility: auto; contain-intrinsic-size: 40px"
      >
        <div
          class="flex items-center justify-between p-2 rounded cursor-pointer hover:bg-surface-700 transition-colors min-w-0"
          :class="{
            'bg-primary-600': item.type === 'root' && item.name === 'Query',
            'bg-danger-600': item.type === 'root' && item.name === 'Mutation',
            'bg-info-600': item.type === 'root' && item.name === 'Subscription',
            'bg-success-600': item.type === 'type',
            'bg-secondary-600': item.type === 'enum',
          }"
          @click="$emit('item-click', item)"
        >
          <div class="flex items-center min-w-0 flex-1">
            <i
              v-if="
                item.type === 'root' &&
                ['Query', 'Mutation', 'Subscription'].includes(item.name)
              "
              :class="
                expandedSections[item.name]
                  ? 'fas fa-chevron-down'
                  : 'fas fa-chevron-right'
              "
              class="text-xs w-3 mr-2 flex-shrink-0 text-surface-300"
            ></i>

            <i
              :class="{
                'fas fa-play': item.name === 'Query',
                'fas fa-edit': item.name === 'Mutation',
                'fas fa-bell': item.name === 'Subscription',
                'fas fa-cube': item.type === 'type',
                'fas fa-list': item.type === 'enum',
              }"
              class="text-sm w-4 mr-2 flex-shrink-0"
            ></i>
            <span class="font-medium text-surface-100 truncate">{{
              item.name
            }}</span>
          </div>
          <span
            class="text-xs text-surface-400 bg-surface-800 px-2 py-1 rounded flex-shrink-0 ml-2"
          >
            {{ item.childCount ?? item.children?.length ?? 0 }}
          </span>
        </div>

        <div
          v-if="
            item.children?.length &&
            (searchTerm.trim() !== '' ||
              shouldShowChildren(item, expandedSections))
          "
          class="ml-6 mt-1"
        >
          <div
            v-for="child in item.children"
            :key="child.name"
            class="flex items-center p-1.5 rounded cursor-pointer hover:bg-surface-700 transition-colors text-sm min-w-0"
            @click="$emit('item-click', child)"
          >
            <i
              class="fas fa-arrow-right text-xs w-3 mr-2 text-surface-500 flex-shrink-0"
            ></i>
            <span class="text-surface-200 truncate">{{ child.name }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-if="!isExpanded"
    class="w-12 bg-surface-900 border-r border-surface-600 flex items-center justify-center"
  >
    <Button
      icon="fas fa-bars"
      text
      size="small"
      class="text-surface-400 hover:text-surface-200"
      @click="$emit('update:isExpanded', true)"
    />
  </div>
</template>
