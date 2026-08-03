import * as d3 from "d3";
import { computed, type Ref } from "vue";

import type { D3Node } from "./types";
import { getGraphBounds } from "./types";

export function useVoyagerMinimap(
  minimapSvg: Ref<SVGSVGElement | undefined>,
  voyagerContainer: Ref<HTMLDivElement | undefined>,
  currentZoom: Ref<d3.ZoomBehavior<SVGSVGElement, unknown> | undefined>,
  currentTransform: Ref<d3.ZoomTransform>,
  cachedD3Data: Ref<{ nodes: D3Node[]; links: unknown[] } | undefined>,
) {
  const minimapViewBox = computed(() => {
    if (
      cachedD3Data.value === undefined ||
      cachedD3Data.value.nodes.length === 0
    ) {
      return { x: 0, y: 0, width: 1000, height: 1000 };
    }

    return getGraphBounds(cachedD3Data.value.nodes, 50);
  });

  const minimapViewport = computed(() => {
    const transform = currentTransform.value;
    const rect = voyagerContainer.value?.getBoundingClientRect();
    return {
      x: -transform.x / transform.k,
      y: -transform.y / transform.k,
      width: (rect?.width ?? 1) / transform.k,
      height: (rect?.height ?? 1) / transform.k,
    };
  });

  const setupMinimapDrag = () => {
    if (
      minimapSvg.value === undefined ||
      voyagerContainer.value === undefined ||
      currentZoom.value === undefined ||
      cachedD3Data.value === undefined
    )
      return;

    const minimapRect = d3.select(minimapSvg.value).select(".minimap-viewport");
    if (minimapRect.empty()) {
      setTimeout(() => {
        setupMinimapDrag();
      }, 100);
      return;
    }

    minimapRect.on(".drag", null);

    let dragStartX = 0;
    let dragStartY = 0;
    let initialViewportX = 0;
    let initialViewportY = 0;

    const drag = d3
      .drag<SVGRectElement, unknown>()
      .on("start", (event) => {
        if (currentTransform.value === undefined) return;

        dragStartX = event.x;
        dragStartY = event.y;

        initialViewportX = -currentTransform.value.x / currentTransform.value.k;
        initialViewportY = -currentTransform.value.y / currentTransform.value.k;
      })
      .on("drag", (event) => {
        if (
          currentTransform.value === undefined ||
          voyagerContainer.value === undefined ||
          currentZoom.value === undefined
        )
          return;

        const mainSvg = d3.select(voyagerContainer.value).select("svg");
        if (mainSvg.empty()) return;

        const deltaX = event.x - dragStartX;
        const deltaY = event.y - dragStartY;

        const newViewportX = initialViewportX + deltaX;
        const newViewportY = initialViewportY + deltaY;

        const newX = -newViewportX * currentTransform.value.k;
        const newY = -newViewportY * currentTransform.value.k;

        mainSvg.transition().duration(0).call(
          // @ts-expect-error D3.js transition type compatibility
          currentZoom.value.transform,
          d3.zoomIdentity.translate(newX, newY).scale(currentTransform.value.k),
        );
      });

    // @ts-expect-error D3.js drag behavior type compatibility
    minimapRect.call(drag);
    minimapRect.style("cursor", "move");
  };

  return {
    minimapViewBox,
    minimapViewport,
    setupMinimapDrag,
  };
}
