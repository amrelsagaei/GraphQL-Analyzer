import { describe, expect, it } from "vitest";

import { minimalIntrospectionSchema } from "../../tests/fixtures/minimalSchema";

import {
  parseIntrospectionResponseBody,
  parseQueryResponseBody,
  unwrapBatchedResponse,
} from "./responseParser";

describe("unwrapBatchedResponse", () => {
  it("returns the first element when given an array", () => {
    const batched = [{ data: { __typename: "Query" } }];
    expect(unwrapBatchedResponse(batched)).toEqual({
      data: { __typename: "Query" },
    });
  });

  it("returns the object as-is when not an array", () => {
    const standard = { data: { __typename: "Query" } };
    expect(unwrapBatchedResponse(standard)).toEqual(standard);
  });

  it("returns empty array as-is", () => {
    expect(unwrapBatchedResponse([])).toEqual([]);
  });

  it("handles null/undefined", () => {
    expect(unwrapBatchedResponse(undefined)).toBeUndefined();
  });
});

describe("parseIntrospectionResponseBody", () => {
  const standardBody = JSON.stringify({
    data: { __schema: minimalIntrospectionSchema },
  });

  const batchedBody = JSON.stringify([
    { data: { __schema: minimalIntrospectionSchema } },
  ]);

  it("parses standard introspection response", () => {
    const result = parseIntrospectionResponseBody(standardBody);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value.supportsIntrospection).toBe(true);
      expect(result.value.introspection).toBeDefined();
      expect(result.value.introspection?.types.length).toBeGreaterThan(0);
    }
  });

  it("parses batched introspection response", () => {
    const result = parseIntrospectionResponseBody(batchedBody);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value.supportsIntrospection).toBe(true);
      expect(result.value.introspection).toBeDefined();
      expect(result.value.introspection?.types.length).toBeGreaterThan(0);
    }
  });

  it("produces identical schemas for standard and batched responses", () => {
    const standardResult = parseIntrospectionResponseBody(standardBody);
    const batchedResult = parseIntrospectionResponseBody(batchedBody);

    expect(standardResult.kind).toBe("Ok");
    expect(batchedResult.kind).toBe("Ok");

    if (standardResult.kind === "Ok" && batchedResult.kind === "Ok") {
      expect(batchedResult.value.introspection).toEqual(
        standardResult.value.introspection,
      );
    }
  });

  it("detects introspection disabled errors", () => {
    const body = JSON.stringify({
      errors: [{ message: "Introspection is not allowed" }],
    });
    const result = parseIntrospectionResponseBody(body);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value.supportsIntrospection).toBe(false);
    }
  });

  it("detects introspection disabled in batched error response", () => {
    const body = JSON.stringify([
      { errors: [{ message: "Introspection is disabled" }] },
    ]);
    const result = parseIntrospectionResponseBody(body);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value.supportsIntrospection).toBe(false);
    }
  });

  it("returns GraphQL error for non-introspection errors", () => {
    const body = JSON.stringify({
      errors: [{ message: "Syntax error in query" }],
    });
    const result = parseIntrospectionResponseBody(body);
    expect(result.kind).toBe("Error");
    if (result.kind === "Error") {
      expect(result.error).toContain("Syntax error in query");
    }
  });

  it("returns error for data without __schema", () => {
    const body = JSON.stringify({ data: { users: [] } });
    const result = parseIntrospectionResponseBody(body);
    expect(result.kind).toBe("Error");
    if (result.kind === "Error") {
      expect(result.error).toContain("introspection is disabled");
    }
  });

  it("returns error for non-GraphQL JSON", () => {
    const body = JSON.stringify({ status: "ok" });
    const result = parseIntrospectionResponseBody(body);
    expect(result.kind).toBe("Error");
    if (result.kind === "Error") {
      expect(result.error).toContain("not a valid GraphQL response");
    }
  });

  it("returns error for invalid JSON", () => {
    const result = parseIntrospectionResponseBody("not-json");
    expect(result.kind).toBe("Error");
    if (result.kind === "Error") {
      expect(result.error).toContain("Invalid JSON response");
    }
  });

  it("returns error for empty string", () => {
    const result = parseIntrospectionResponseBody("");
    expect(result.kind).toBe("Error");
  });
});

describe("parseQueryResponseBody", () => {
  it("parses standard query response", () => {
    const body = JSON.stringify({ data: { users: [{ id: "1" }] } });
    const result = parseQueryResponseBody(body);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value).toEqual({ data: { users: [{ id: "1" }] } });
    }
  });

  it("unwraps batched query response", () => {
    const body = JSON.stringify([
      { data: { users: [{ id: "1" }] } },
      { data: { posts: [] } },
    ]);
    const result = parseQueryResponseBody(body);
    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      expect(result.value).toEqual({ data: { users: [{ id: "1" }] } });
    }
  });

  it("returns error for invalid JSON", () => {
    const result = parseQueryResponseBody("<html>not json</html>");
    expect(result.kind).toBe("Error");
  });
});
