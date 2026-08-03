import * as d3 from "d3";
import type { GraphQLField, GraphQLSchema, GraphQLType } from "shared";
import type { Ref } from "vue";

import type { D3Link, D3Node, VoyagerData } from "./types";
import {
  extractTypeName,
  getViewportExtent,
  getVisibleFieldRange,
  LAYOUT,
} from "./types";

import { useSDK } from "@/plugins/sdk";

const NODE_RENDER_MARGIN_PX = 250;
const FIELD_DETAIL_SCALE = 0.55;
const LINK_DETAIL_SCALE = 0.35;
const MAX_VISIBLE_LINKS = 5_000;

type WorldViewport = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function useVoyagerVisualization(
  voyagerContainer: Ref<HTMLDivElement | undefined>,
  currentZoom: Ref<d3.ZoomBehavior<SVGSVGElement, unknown> | undefined>,
  currentTransform: Ref<d3.ZoomTransform>,
  highlightedNodeId: Ref<number | undefined>,
  cachedD3Data: Ref<VoyagerData | undefined>,
  debouncedSearchTerm: Ref<string>,
  updateNodeStyles: (nodes: D3Node[], highlightedIds: number[]) => void,
  toggleNodeHighlight: (nodeData: D3Node) => void,
  refreshNodeStyles: () => void,
  onTransformEnd?: (transform: d3.ZoomTransform) => void,
) {
  const sdk = useSDK();
  let renderFrame: number | undefined;
  let renderVisibleGraph: (() => void) | undefined;

  const calculateBoxDimensions = (
    fields: readonly GraphQLField[],
    title: string,
  ): { width: number; height: number } => {
    let maxWidth = title.length * 12 + 40;
    for (const field of fields) {
      maxWidth = Math.max(
        maxWidth,
        `${field.name}: ${field.type}`.length * 8 + 40,
      );
    }
    return {
      width: Math.max(LAYOUT.MIN_WIDTH, Math.min(maxWidth, LAYOUT.MAX_WIDTH)),
      height: Math.max(
        LAYOUT.MIN_HEIGHT,
        LAYOUT.HEADER_HEIGHT +
          fields.length * LAYOUT.FIELD_HEIGHT +
          LAYOUT.PADDING,
      ),
    };
  };

  const parseSchemaToD3 = (schema: GraphQLSchema): VoyagerData => {
    const nodes: D3Node[] = [];
    const links: D3Link[] = [];
    const nodeByName = new Map<string, D3Node>();
    let nextId = 0;
    let rootY = 50;
    let rootWidth = 0;

    const addRoot = (name: string, fields: GraphQLField[], color: string) => {
      if (fields.length === 0) return;
      const dimensions = calculateBoxDimensions(fields, name);
      const node: D3Node = {
        id: nextId++,
        name,
        type: "root",
        color,
        fields,
        x: 50,
        y: rootY,
        ...dimensions,
      };
      nodes.push(node);
      nodeByName.set(name, node);
      rootY += dimensions.height + LAYOUT.ROOT_SPACING;
      rootWidth = Math.max(rootWidth, dimensions.width);
    };

    addRoot("Query", schema.queries, "hsl(var(--c-primary-600))");
    addRoot("Mutation", schema.mutations, "hsl(var(--c-danger-600))");
    addRoot("Subscription", schema.subscriptions, "hsl(var(--c-info-600))");

    const objectDimensions = schema.types.map((type) =>
      calculateBoxDimensions(type.fields ?? [], type.name),
    );
    const totalObjectHeight = objectDimensions.reduce(
      (sum, dimensions) => sum + dimensions.height + LAYOUT.NODE_SPACING,
      0,
    );
    const averageWidth =
      objectDimensions.length === 0
        ? LAYOUT.MIN_WIDTH
        : objectDimensions.reduce((sum, value) => sum + value.width, 0) /
          objectDimensions.length;
    const targetColumnHeight = Math.max(
      LAYOUT.MAX_HEIGHT_PER_COLUMN,
      Math.sqrt(
        totalObjectHeight * (averageWidth + LAYOUT.COLUMN_SPACING) * 1.5,
      ),
    );

    let currentX = 50 + rootWidth + LAYOUT.COLUMN_SPACING;
    let currentY = 50;
    let columnWidth = 0;
    schema.types.forEach((type: GraphQLType, index: number) => {
      const dimensions = objectDimensions[index];
      if (dimensions === undefined) return;
      if (currentY > 50 && currentY + dimensions.height > targetColumnHeight) {
        currentX += columnWidth + LAYOUT.COLUMN_SPACING;
        currentY = 50;
        columnWidth = 0;
      }
      const node: D3Node = {
        id: nextId++,
        name: type.name,
        type: "object",
        color: "hsl(var(--c-success-600))",
        fields: type.fields ?? [],
        x: currentX,
        y: currentY,
        ...dimensions,
      };
      nodes.push(node);
      nodeByName.set(type.name, node);
      currentY += dimensions.height + LAYOUT.NODE_SPACING;
      columnWidth = Math.max(columnWidth, dimensions.width);
    });

    let enumX = currentX + columnWidth + LAYOUT.COLUMN_SPACING;
    let enumY = 50;
    let enumColumnWidth = 0;
    for (const enumType of schema.enums) {
      const fields: GraphQLField[] = enumType.values.map((value) => ({
        name: value.name,
        args: [],
        type: enumType.name,
      }));
      const dimensions = calculateBoxDimensions(fields, enumType.name);
      if (enumY > 50 && enumY + dimensions.height > targetColumnHeight) {
        enumX += enumColumnWidth + LAYOUT.COLUMN_SPACING;
        enumY = 50;
        enumColumnWidth = 0;
      }
      const node: D3Node = {
        id: nextId++,
        name: enumType.name,
        type: "enum",
        color: "hsl(var(--c-secondary-600))",
        fields,
        x: enumX,
        y: enumY,
        ...dimensions,
      };
      nodes.push(node);
      nodeByName.set(enumType.name, node);
      enumY += dimensions.height + LAYOUT.ENUM_SPACING;
      enumColumnWidth = Math.max(enumColumnWidth, dimensions.width);
    }

    const addLinks = (sourceName: string, fields: readonly GraphQLField[]) => {
      const source = nodeByName.get(sourceName);
      if (source === undefined) return;
      for (const field of fields) {
        const target = nodeByName.get(extractTypeName(field.type));
        if (target !== undefined && target !== source) {
          links.push({
            source,
            target,
            type: "field",
            fieldName: field.name,
            fromRoot: source.type === "root",
          });
        }
      }
    };

    addLinks("Query", schema.queries);
    addLinks("Mutation", schema.mutations);
    addLinks("Subscription", schema.subscriptions);
    for (const type of schema.types) addLinks(type.name, type.fields ?? []);

    const linksBySource = new Map<number, D3Link[]>();
    const sourcesByTarget = new Map<number, number[]>();
    for (const link of links) {
      const sourceId = getNode(link.source)?.id;
      const targetId = getNode(link.target)?.id;
      if (sourceId === undefined || targetId === undefined) continue;
      const sourceLinks = linksBySource.get(sourceId);
      if (sourceLinks === undefined) linksBySource.set(sourceId, [link]);
      else sourceLinks.push(link);

      const targetSources = sourcesByTarget.get(targetId);
      if (targetSources === undefined)
        sourcesByTarget.set(targetId, [sourceId]);
      else targetSources.push(sourceId);
    }

    return { nodes, links, linksBySource, sourcesByTarget };
  };

  const scheduleRender = () => {
    if (renderFrame !== undefined) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = undefined;
      renderVisibleGraph?.();
    });
  };

  const loadVoyagerVisualization = (
    restoreTransform?: d3.ZoomTransform,
    showToasts = false,
  ) => {
    const container = voyagerContainer.value;
    const data = cachedD3Data.value;
    if (container === undefined || data === undefined) return;

    try {
      d3.select(container).selectAll("*").remove();
      d3.selectAll(".voyager-tooltip").remove();

      const svg = d3
        .select(container)
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .style("background", "hsl(var(--c-surface-800))")
        .style("border", "1px solid hsl(var(--c-surface-600))");
      const world = svg.append("g").attr("class", "voyager-world");
      const linkLayer = world.append("g").attr("class", "links");
      const nodeLayer = world.append("g").attr("class", "nodes");

      const viewport = (): WorldViewport => {
        const rect = container.getBoundingClientRect();
        const transform = currentTransform.value;
        const margin = NODE_RENDER_MARGIN_PX / transform.k;
        return {
          left: -transform.x / transform.k - margin,
          top: -transform.y / transform.k - margin,
          right: (rect.width - transform.x) / transform.k + margin,
          bottom: (rect.height - transform.y) / transform.k + margin,
        };
      };

      const renderFields = (
        group: d3.Selection<SVGGElement, D3Node, SVGGElement, unknown>,
        visibleWorld: WorldViewport,
      ) => {
        group.each(function (nodeData) {
          const { firstIndex, lastIndex } = getVisibleFieldRange(
            nodeData.y,
            nodeData.fields?.length ?? 0,
            visibleWorld.top,
            visibleWorld.bottom,
          );
          const fields = (nodeData.fields ?? [])
            .slice(firstIndex, lastIndex)
            .map((field, offset) => ({ field, index: firstIndex + offset }));
          const node = d3.select(this);
          node
            .selectAll<SVGTextElement, (typeof fields)[number]>(".field-name")
            .data(fields, (field) => field.index)
            .join("text")
            .attr("class", "field-name")
            .attr("x", 8)
            .attr("y", (field) => 35 + field.index * LAYOUT.FIELD_HEIGHT)
            .attr("font-size", "11px")
            .attr("fill", "hsl(var(--c-surface-0))")
            .attr("font-family", "monospace")
            .text((field) => field.field.name);
          node
            .selectAll<SVGTextElement, (typeof fields)[number]>(".field-type")
            .data(fields, (field) => field.index)
            .join("text")
            .attr("class", "field-type")
            .attr("x", nodeData.width - 12)
            .attr("y", (field) => 35 + field.index * LAYOUT.FIELD_HEIGHT)
            .attr("text-anchor", "end")
            .attr("font-size", "10px")
            .attr("fill", "hsl(var(--c-surface-300))")
            .attr("font-style", "italic")
            .text((field) => field.field.type);
        });
      };

      renderVisibleGraph = () => {
        const transform = currentTransform.value;
        const visibleWorld = viewport();
        const visibleNodes = data.nodes.filter((node) =>
          intersects(node, visibleWorld),
        );
        const visibleIds = new Set(visibleNodes.map((node) => node.id));
        const search = debouncedSearchTerm.value.trim().toLowerCase();

        const nodeGroups = nodeLayer
          .selectAll<SVGGElement, D3Node>(".node")
          .data(visibleNodes, (node) => node.id)
          .join(
            (enter) => {
              const group = enter
                .append("g")
                .attr("class", "node")
                .style("cursor", "pointer")
                .on("click", (event: MouseEvent, node) => {
                  event.stopPropagation();
                  toggleNodeHighlight(node);
                })
                .on("mouseenter", function (event: MouseEvent, node) {
                  d3.select(this).select(".node-body").attr("stroke-width", 3);
                  showTooltip(event, node);
                })
                .on("mousemove", moveTooltip)
                .on("mouseleave", function () {
                  d3.select(this).select(".node-body").attr("stroke-width", 2);
                  d3.selectAll(".voyager-tooltip").remove();
                });
              group.append("rect").attr("class", "node-body").attr("rx", 8);
              group.append("rect").attr("class", "node-header").attr("rx", 6);
              group
                .append("text")
                .attr("class", "node-title")
                .attr("y", 17)
                .attr("text-anchor", "middle")
                .attr("fill", "#ffffff")
                .attr("font-size", "12px")
                .attr("font-weight", "bold");
              return group;
            },
            (update) => update,
            (exit) => exit.remove(),
          )
          .attr("transform", (node) => `translate(${node.x}, ${node.y})`);

        nodeGroups
          .select(".node-body")
          .attr("width", (node) => node.width)
          .attr("height", (node) => node.height)
          .attr("fill", "hsl(var(--c-surface-700))")
          .attr("stroke", (node) =>
            matchesSearch(node, search)
              ? "hsl(var(--c-warning-400))"
              : node.color,
          )
          .attr("stroke-width", (node) =>
            matchesSearch(node, search) ? 3 : 2,
          );
        nodeGroups
          .select(".node-header")
          .attr("width", (node) => node.width)
          .attr("height", 25)
          .attr("fill", (node) => node.color);
        nodeGroups
          .select(".node-title")
          .attr("x", (node) => node.width / 2)
          .text((node) => node.name);

        if (transform.k >= FIELD_DETAIL_SCALE) {
          renderFields(nodeGroups, visibleWorld);
        } else {
          nodeGroups.selectAll(".field-name,.field-type").remove();
        }

        const visibleLinks: D3Link[] = [];
        if (transform.k >= LINK_DETAIL_SCALE) {
          for (const node of visibleNodes) {
            for (const link of data.linksBySource.get(node.id) ?? []) {
              const target = getNode(link.target);
              if (target !== undefined && visibleIds.has(target.id)) {
                visibleLinks.push(link);
                if (visibleLinks.length >= MAX_VISIBLE_LINKS) break;
              }
            }
            if (visibleLinks.length >= MAX_VISIBLE_LINKS) break;
          }
        }
        linkLayer
          .selectAll<SVGPathElement, D3Link>(".link")
          .data(visibleLinks, linkKey)
          .join("path")
          .attr("class", "link")
          .attr("d", linkPath)
          .attr("stroke", (link) =>
            link.fromRoot === true
              ? "hsl(var(--c-primary-400))"
              : "hsl(var(--c-surface-400))",
          )
          .attr("stroke-width", (link) => (link.fromRoot === true ? 2.5 : 1.5))
          .attr("fill", "none")
          .attr("opacity", 0.7);

        refreshNodeStyles();
      };

      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .extent(() => {
          const rect = container.getBoundingClientRect();
          return getViewportExtent(rect.width, rect.height);
        })
        .scaleExtent([0.01, 3])
        .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
          world.attr("transform", event.transform.toString());
          currentTransform.value = event.transform;
          scheduleRender();
        })
        .on("end", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
          onTransformEnd?.(event.transform);
        });
      svg.call(zoom);
      currentZoom.value = zoom;

      svg.on("click", (event: MouseEvent) => {
        if (event.target === svg.node()) {
          highlightedNodeId.value = undefined;
          updateNodeStyles(data.nodes, []);
        }
      });

      const initialTransform = restoreTransform ?? d3.zoomIdentity;
      svg.call(zoom.transform, initialTransform);
      currentTransform.value = initialTransform;
      renderVisibleGraph();

      if (showToasts) {
        sdk.window.showToast("Graph loaded successfully", {
          variant: "success",
        });
      }
    } catch (error) {
      if (showToasts) {
        sdk.window.showToast(`Failed to load visualization: ${String(error)}`, {
          variant: "error",
        });
      }
    }
  };

  return { parseSchemaToD3, loadVoyagerVisualization, scheduleRender };
}

function getNode(value: D3Node | number | undefined): D3Node | undefined {
  return typeof value === "object" ? value : undefined;
}

function intersects(node: D3Node, viewport: WorldViewport): boolean {
  return (
    node.x + node.width >= viewport.left &&
    node.x <= viewport.right &&
    node.y + node.height >= viewport.top &&
    node.y <= viewport.bottom
  );
}

function matchesSearch(node: D3Node, search: string): boolean {
  return (
    search !== "" &&
    (node.name.toLowerCase().includes(search) ||
      node.fields?.some((field) =>
        field.name.toLowerCase().includes(search),
      ) === true)
  );
}

function linkKey(link: D3Link): string {
  return `${getNode(link.source)?.id ?? ""}:${getNode(link.target)?.id ?? ""}:${link.fieldName ?? ""}`;
}

function linkPath(link: D3Link): string {
  const source = getNode(link.source);
  const target = getNode(link.target);
  if (source === undefined || target === undefined) return "";
  const fieldIndex = Math.max(
    0,
    source.fields?.findIndex((field) => field.name === link.fieldName) ?? 0,
  );
  const x1 = source.x + source.width;
  const y1 =
    source.y + LAYOUT.HEADER_HEIGHT + 10 + fieldIndex * LAYOUT.FIELD_HEIGHT;
  const x2 = target.x;
  const y2 = target.y + target.height / 2;
  const midX = (x1 + x2) / 2;
  return `M ${x1},${y1} C ${midX},${y1} ${midX},${y2} ${x2},${y2}`;
}

function showTooltip(event: MouseEvent, node: D3Node): void {
  d3.selectAll(".voyager-tooltip").remove();
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "voyager-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "hsl(var(--c-surface-900))")
    .style("border", "1px solid hsl(var(--c-surface-600))")
    .style("padding", "8px")
    .style("border-radius", "6px")
    .style("color", "hsl(var(--c-surface-200))");
  tooltip.append("div").style("font-weight", "bold").text(node.name);
  tooltip
    .append("div")
    .style("font-size", "11px")
    .text(`Type: ${node.type} · Fields: ${node.fields?.length ?? 0}`);
  moveTooltip(event);
}

function moveTooltip(event: MouseEvent): void {
  d3.selectAll<HTMLElement, unknown>(".voyager-tooltip")
    .style("left", `${event.pageX + 10}px`)
    .style("top", `${event.pageY - 28}px`);
}
