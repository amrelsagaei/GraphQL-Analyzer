import * as d3 from "d3";
import type { Ref } from "vue";

import type { D3Node } from "./types";
import { getGraphBounds } from "./types";

export function useVoyagerZoom(
  voyagerContainer: Ref<HTMLDivElement | undefined>,
  currentZoom: Ref<d3.ZoomBehavior<SVGSVGElement, unknown> | undefined>,
  currentTransform: Ref<d3.ZoomTransform>,
  cachedD3Data: Ref<{ nodes: D3Node[]; links: unknown[] } | undefined>,
) {
  const zoomIn = () => {
    if (voyagerContainer.value === undefined || currentZoom.value === undefined)
      return;
    const svg = d3.select(voyagerContainer.value).select("svg");
    svg
      .transition()
      .duration(300)
      // @ts-expect-error D3.js transition type compatibility
      .call(currentZoom.value.scaleBy, 1.3);
  };

  const zoomOut = () => {
    if (voyagerContainer.value === undefined || currentZoom.value === undefined)
      return;
    const svg = d3.select(voyagerContainer.value).select("svg");
    // @ts-expect-error D3.js transition type compatibility
    svg.transition().duration(300).call(currentZoom.value.scaleBy, 0.7);
  };

  const resetZoom = () => {
    if (voyagerContainer.value === undefined || currentZoom.value === undefined)
      return;
    const svg = d3.select(voyagerContainer.value).select("svg");
    svg
      .transition()
      .duration(500)
      // @ts-expect-error D3.js transition type compatibility
      .call(currentZoom.value.transform, d3.zoomIdentity);
  };

  const fitToView = () => {
    if (
      voyagerContainer.value === undefined ||
      cachedD3Data.value === undefined ||
      currentZoom.value === undefined
    )
      return;

    const { nodes } = cachedD3Data.value;
    if (nodes.length === 0) return;

    const bounds = getGraphBounds(nodes);
    const contentWidth = bounds.width;
    const contentHeight = bounds.height;

    const containerRect = voyagerContainer.value.getBoundingClientRect();
    const padding = 50;

    const scaleX = (containerRect.width - padding * 2) / contentWidth;
    const scaleY = (containerRect.height - padding * 2) / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1);

    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    const contentCenterX = bounds.x + bounds.width / 2;
    const contentCenterY = bounds.y + bounds.height / 2;

    const translateX = centerX - contentCenterX * scale;
    const translateY = centerY - contentCenterY * scale;

    const svg = d3.select(voyagerContainer.value).select("svg");
    svg.transition().duration(750).call(
      // @ts-expect-error D3.js transition type compatibility
      currentZoom.value.transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale),
    );
  };

  const focusOnNode = (nodeData: D3Node) => {
    if (voyagerContainer.value === undefined || currentZoom.value === undefined)
      return;

    const svg = d3.select(voyagerContainer.value).select("svg");
    const g = svg.select("g");

    const containerRect = voyagerContainer.value.getBoundingClientRect();
    if (containerRect.width === 0 && containerRect.height === 0) return;

    const scale = 1.2;
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    const nodeX = nodeData.x + nodeData.width / 2;
    const nodeY = nodeData.y + nodeData.height / 2;

    const translateX = centerX - nodeX * scale;
    const translateY = centerY - nodeY * scale;

    svg.transition().duration(750).call(
      // @ts-expect-error D3.js transition type compatibility
      currentZoom.value.transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale),
    );

    g.selectAll<SVGGElement, D3Node>(".node")
      .filter((d: D3Node) => d.id === nodeData.id)
      .select("rect")
      .transition()
      .duration(300)
      .attr("stroke-width", 4)
      .attr("stroke", "hsl(var(--c-primary-400))")
      .transition()
      .delay(1000)
      .duration(300)
      .attr("stroke-width", 2)
      .attr("stroke", (d: D3Node) => d.color);
  };

  return {
    zoomIn,
    zoomOut,
    resetZoom,
    fitToView,
    focusOnNode,
  };
}
