import type { GraphQLSchema } from "shared";
import { computed, ref, type Ref } from "vue";

import type { D3Node, NavItem } from "./types";

export function useVoyagerNavigation(
  currentSchema: Ref<GraphQLSchema | undefined>,
  debouncedSearchTerm: Ref<string>,
  cachedD3Data: Ref<{ nodes: D3Node[]; links: unknown[] } | undefined>,
  focusOnNode: (nodeData: D3Node) => void,
) {
  const expandedSections = ref<Record<string, boolean>>({});

  const filteredItems = computed(() => {
    const schema = currentSchema.value;
    if (schema === undefined) return [];
    const search = debouncedSearchTerm.value.trim().toLowerCase();
    const items: NavItem[] = [];

    const addItem = (
      name: string,
      type: NavItem["type"],
      fields: readonly { name: string }[],
      childType: string,
    ) => {
      if (fields.length === 0) return;
      const nameMatches = name.toLowerCase().includes(search);
      const matchingFields =
        search === ""
          ? fields
          : fields.filter((field) => field.name.toLowerCase().includes(search));
      if (search !== "" && !nameMatches && matchingFields.length === 0) return;

      const shouldMaterializeChildren =
        search !== "" || expandedSections.value[name] === true;
      items.push({
        name,
        type,
        childCount: fields.length,
        children: shouldMaterializeChildren
          ? matchingFields.map((field) => ({
              name: field.name,
              type: childType,
              parent: name,
            }))
          : undefined,
      });
    };

    addItem("Query", "root", schema.queries, "query");
    addItem("Mutation", "root", schema.mutations, "mutation");
    addItem("Subscription", "root", schema.subscriptions, "subscription");
    for (const type of schema.types) {
      addItem(type.name, "type", type.fields ?? [], "field");
    }
    for (const enumType of schema.enums) {
      addItem(enumType.name, "enum", enumType.values, "enumValue");
    }
    return items;
  });

  const toggleSection = (sectionName: string) => {
    expandedSections.value[sectionName] =
      expandedSections.value[sectionName] !== true;
  };

  const onNavItemClick = (item: NavItem) => {
    if (item.type === "root" || item.type === "type" || item.type === "enum") {
      toggleSection(item.name);
    }
    const targetNode = cachedD3Data.value?.nodes.find(
      (node) => node.name === item.name || node.name === item.parent,
    );
    if (targetNode !== undefined) focusOnNode(targetNode);
  };

  return {
    expandedSections,
    filteredItems,
    onNavItemClick,
  };
}
