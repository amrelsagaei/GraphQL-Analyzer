import { describe, expect, it } from "vitest";

import { minimalIntrospectionSchema } from "../../../tests/fixtures/minimalSchema";

import { parseSchemaFromFileContent } from "./index";

describe("parseSchemaFromFileContent", () => {
  it("parses wrapped introspection JSON", () => {
    const content = JSON.stringify({
      data: { __schema: minimalIntrospectionSchema },
    });
    const result = parseSchemaFromFileContent(content);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value.format).toBe("introspection-wrapped");
      expect(result.value.introspection).toEqual(minimalIntrospectionSchema);
    }
  });

  it("parses unwrapped introspection JSON", () => {
    const content = JSON.stringify({
      __schema: minimalIntrospectionSchema,
    });
    const result = parseSchemaFromFileContent(content);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value.format).toBe("introspection-unwrapped");
      expect(result.value.introspection).toEqual(minimalIntrospectionSchema);
    }
  });

  it("parses direct schema object JSON", () => {
    const content = JSON.stringify(minimalIntrospectionSchema);
    const result = parseSchemaFromFileContent(content);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value.format).toBe("introspection-direct");
      expect(result.value.introspection).toEqual(minimalIntrospectionSchema);
    }
  });

  it("returns error for invalid JSON", () => {
    const result = parseSchemaFromFileContent("not json at all");
    expect(result.kind).toBe("Error");
    if (result.kind === "Error") {
      expect(result.error).toContain("Invalid JSON");
    }
  });

  it("returns error for valid JSON that is not a schema", () => {
    const result = parseSchemaFromFileContent('{"users": [1, 2, 3]}');
    expect(result.kind).toBe("Error");
  });
});
