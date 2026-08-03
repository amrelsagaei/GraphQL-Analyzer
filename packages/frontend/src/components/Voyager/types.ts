import type { ExplorerSession } from "shared";

export type { ExplorerSession };

export type D3Node = {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fields?: Array<{ name: string; type: string }>;
};

export type D3Link = {
  source: D3Node | number;
  target: D3Node | number | undefined;
  type: string;
  fieldName?: string;
  fromRoot?: boolean;
};

export type VoyagerData = {
  nodes: D3Node[];
  links: D3Link[];
  linksBySource: Map<number, D3Link[]>;
  sourcesByTarget: Map<number, number[]>;
};

export type GraphBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ViewportExtent = [[number, number], [number, number]];

export function getViewportExtent(
  width: number,
  height: number,
): ViewportExtent {
  return [
    [0, 0],
    [Math.max(width, 1), Math.max(height, 1)],
  ];
}

export function getGraphBounds(
  nodes: readonly D3Node[],
  padding = 0,
): GraphBounds {
  if (nodes.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

export type NavItem = {
  name: string;
  type: string;
  parent?: string;
  children?: NavItem[];
  childCount?: number;
  fullSignature?: string;
  fieldData?: unknown;
};

export const LAYOUT = {
  ROOT_SPACING: 80,
  COLUMN_SPACING: 150,
  NODE_SPACING: 40,
  ENUM_SPACING: 40,
  MAX_HEIGHT_PER_COLUMN: 1400,
  MIN_WIDTH: 200,
  MAX_WIDTH: 950,
  MIN_HEIGHT: 80,
  HEADER_HEIGHT: 30,
  FIELD_HEIGHT: 18,
  PADDING: 20,
};

export function extractTypeName(typeString: string): string {
  if (typeString === "") return "";
  return typeString.replace(/[[\]!]/g, "");
}
