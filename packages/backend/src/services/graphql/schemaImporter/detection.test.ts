import { describe, expect, it } from "vitest";

import { minimalIntrospectionSchema } from "../../../tests/fixtures/minimalSchema";

import { detectSchemaFormat } from "./detection";

describe("detectSchemaFormat", () => {
  it("detects wrapped introspection format: { data: { __schema: ... } }", () => {
    const data = { data: { __schema: minimalIntrospectionSchema } };
    const result = detectSchemaFormat(data);
    expect(result.format).toBe("introspection-wrapped");
    expect(result.schema).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("detects unwrapped introspection format: { __schema: ... }", () => {
    const data = { __schema: minimalIntrospectionSchema };
    const result = detectSchemaFormat(data);
    expect(result.format).toBe("introspection-unwrapped");
    expect(result.schema).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("detects direct schema object format", () => {
    const result = detectSchemaFormat(minimalIntrospectionSchema);
    expect(result.format).toBe("introspection-direct");
    expect(result.schema).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("returns unknown for unrelated JSON object", () => {
    const result = detectSchemaFormat({ name: "not a schema", items: [] });
    expect(result.format).toBe("unknown");
    expect(result.schema).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it("returns unknown for null input", () => {
    const result = detectSchemaFormat(null);
    expect(result.format).toBe("unknown");
    expect(result.error).toBe("Input is not a valid object");
  });

  it("returns unknown for a primitive value", () => {
    const result = detectSchemaFormat("just a string" as unknown);
    expect(result.format).toBe("unknown");
  });

  it("returns unknown for an empty object", () => {
    const result = detectSchemaFormat({});
    expect(result.format).toBe("unknown");
  });

  it("rejects __schema that has no types array", () => {
    const result = detectSchemaFormat({
      __schema: { queryType: { name: "Query" } },
    });
    expect(result.format).toBe("unknown");
  });
});
