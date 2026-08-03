import type { GraphQLSchema } from "shared";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { useVoyagerNavigation } from "./useVoyagerNavigation";

const schema: GraphQLSchema = {
  queries: [
    { name: "matchingQuery", args: [], type: "String" },
    { name: "anotherQuery", args: [], type: "String" },
  ],
  mutations: [],
  subscriptions: [],
  types: [],
  enums: [],
  interfaces: [],
  unions: [],
  scalars: [],
  pointsOfInterest: [],
};

describe("useVoyagerNavigation", () => {
  it("reports the number of rendered children while searching", () => {
    const search = ref("matching");
    const { filteredItems } = useVoyagerNavigation(
      ref(schema),
      search,
      ref(undefined),
      vi.fn(),
    );

    expect(filteredItems.value[0]?.children).toHaveLength(1);
    expect(filteredItems.value[0]?.childCount).toBe(1);

    search.value = "query";
    expect(filteredItems.value[0]?.children).toHaveLength(2);
    expect(filteredItems.value[0]?.childCount).toBe(2);
  });

  it("keeps the total count without materializing collapsed children", () => {
    const { filteredItems } = useVoyagerNavigation(
      ref(schema),
      ref(""),
      ref(undefined),
      vi.fn(),
    );

    expect(filteredItems.value[0]?.children).toBeUndefined();
    expect(filteredItems.value[0]?.childCount).toBe(2);
  });
});
