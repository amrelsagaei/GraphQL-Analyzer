import { describe, expect, it } from "vitest";

import type { D3Node } from "./types";
import { getGraphBounds, getViewportExtent } from "./types";

describe("Voyager geometry", () => {
  it("handles very large node collections without argument spreading", () => {
    const nodes: D3Node[] = Array.from({ length: 150_000 }, (_, index) => ({
      id: index,
      name: `Type${index}`,
      type: "object",
      x: index * 2,
      y: index,
      width: 200,
      height: 80,
      color: "green",
    }));

    expect(getGraphBounds(nodes, 50)).toEqual({
      x: -50,
      y: -50,
      width: 300_298,
      height: 150_179,
    });
  });

  it("provides a pixel zoom extent without reading relative SVG lengths", () => {
    expect(getViewportExtent(1280, 720)).toEqual([
      [0, 0],
      [1280, 720],
    ]);
    expect(getViewportExtent(0, 0)).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});
