import * as d3 from "d3";
import { ref, type Ref } from "vue";

import type { D3Link, D3Node, VoyagerData } from "./types";

export function useVoyagerHighlight(
  voyagerContainer: Ref<HTMLDivElement | undefined>,
  cachedD3Data: Ref<VoyagerData | undefined>,
) {
  const highlightedNodeId = ref<number | undefined>(undefined);

  const findParentChain = (
    nodeId: number,
    sourcesByTarget: ReadonlyMap<number, readonly number[]>,
  ): number[] => {
    const visited = new Set<number>();
    const pending = [nodeId];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined || visited.has(current)) continue;
      visited.add(current);
      for (const source of sourcesByTarget.get(current) ?? []) {
        if (!visited.has(source)) pending.push(source);
      }
    }
    return [...visited];
  };

  const updateNodeStyles = (nodes: D3Node[], highlightedIds: number[]) => {
    if (voyagerContainer.value === undefined) return;

    const svg = d3.select(voyagerContainer.value).select("svg");
    const highlighted = new Set(highlightedIds);

    svg.selectAll<SVGGElement, D3Node>(".node").each(function (d: D3Node) {
      const nodeGroup = d3.select(this as SVGElement);
      const isHighlighted = highlighted.has(d.id);

      nodeGroup
        .style(
          "opacity",
          highlightedIds.length === 0 ? 1 : isHighlighted ? 1 : 0.3,
        )
        .select("rect")
        .attr("stroke-width", isHighlighted ? 3 : 2);
    });

    svg.selectAll<SVGPathElement, D3Link>(".link").each(function (d: D3Link) {
      const link = d3.select(this as SVGElement);
      const sourceId = typeof d.source === "object" ? d.source.id : d.source;
      const targetId =
        typeof d.target === "object" && d.target !== undefined
          ? d.target.id
          : typeof d.target === "number"
            ? d.target
            : undefined;
      const isLinkHighlighted =
        targetId !== undefined &&
        highlighted.has(sourceId) &&
        highlighted.has(targetId);
      link.style(
        "opacity",
        highlightedIds.length === 0 ? 0.9 : isLinkHighlighted ? 0.9 : 0.2,
      );
    });
  };

  const toggleNodeHighlight = (nodeData: D3Node) => {
    if (cachedD3Data.value === undefined) return;

    const { nodes, sourcesByTarget } = cachedD3Data.value;

    if (highlightedNodeId.value === nodeData.id) {
      highlightedNodeId.value = undefined;
      updateNodeStyles(nodes, []);
    } else {
      highlightedNodeId.value = nodeData.id;
      const parentChain = findParentChain(nodeData.id, sourcesByTarget);
      updateNodeStyles(nodes, parentChain);
    }
  };

  const refreshNodeStyles = () => {
    if (cachedD3Data.value === undefined) return;
    const { nodes, sourcesByTarget } = cachedD3Data.value;
    const highlightedIds =
      highlightedNodeId.value === undefined
        ? []
        : findParentChain(highlightedNodeId.value, sourcesByTarget);
    updateNodeStyles(nodes, highlightedIds);
  };

  return {
    highlightedNodeId,
    updateNodeStyles,
    toggleNodeHighlight,
    refreshNodeStyles,
  };
}
