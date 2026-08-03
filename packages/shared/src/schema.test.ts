import { describe, expect, it } from "vitest";

import { parseIntrospectionResult } from "./schema";

import type { IntrospectionSchema, IntrospectionType } from "./index";

describe("parseIntrospectionResult", () => {
  it("creates a compact schema without retaining raw introspection objects", () => {
    const introspection = createLargeSchema(100, 20);
    const parsed = parseIntrospectionResult(introspection);
    const serialized = JSON.stringify(parsed);

    expect(parsed.types).toHaveLength(100);
    expect(parsed.queries).toHaveLength(100);
    expect(parsed.allTypes).toBeUndefined();
    expect(serialized).not.toContain("rawField");
    expect(serialized).not.toContain("rawType");
    expect(serialized).not.toContain("rawIntrospection");
    expect(serialized.length).toBeLessThan(
      JSON.stringify(introspection).length,
    );
  });

  it("preserves operation roots, custom types, and deprecation metadata", () => {
    const introspection = createLargeSchema(2, 2);
    introspection.types[2]?.fields?.push({
      name: "oldField",
      args: [],
      type: { kind: "SCALAR", name: "String" },
      isDeprecated: true,
    });

    const parsed = parseIntrospectionResult(introspection);
    expect(parsed.queries[0]?.type).toBe("Type0");
    expect(parsed.queries[0]?.args[0]).toMatchObject({
      name: "id",
      type: "ID!",
    });
    expect(parsed.queries[1]?.type).toBe("[Type1]");
    expect(parsed.mutations[0]?.name).toBe("updateUser");
    expect(parsed.types.map((type) => type.name)).toEqual(["Type0", "Type1"]);
    expect(parsed.enums[0]?.values.map((value) => value.name)).toEqual([
      "ADMIN",
      "USER",
    ]);
    expect(parsed.interfaces[0]).toMatchObject({
      name: "Node",
      possibleTypes: ["Type0"],
    });
    expect(parsed.scalars[0]?.name).toBe("DateTime");
    expect(parsed.pointsOfInterest).toContainEqual(
      expect.objectContaining({
        name: "Type0.email",
        reason: "Potentially sensitive data field",
      }),
    );
    expect(
      parsed.types[0]?.fields?.find((field) => field.name === "oldField"),
    ).toMatchObject({ isDeprecated: true });
  });
});

function createLargeSchema(typeCount: number, fieldsPerType: number) {
  const query: IntrospectionType = {
    kind: "OBJECT",
    name: "Query",
    fields: Array.from({ length: typeCount }, (_, index) => ({
      name: `item${index}`,
      args:
        index === 0
          ? [
              {
                name: "id",
                type: {
                  kind: "NON_NULL",
                  ofType: { kind: "SCALAR", name: "ID" },
                },
              },
            ]
          : [],
      type:
        index === 1
          ? {
              kind: "LIST",
              ofType: { kind: "OBJECT", name: `Type${index}` },
            }
          : { kind: "OBJECT", name: `Type${index}` },
    })),
  };
  const mutation: IntrospectionType = {
    kind: "OBJECT",
    name: "Mutation",
    fields: [
      {
        name: "updateUser",
        args: [],
        type: { kind: "OBJECT", name: "Type0" },
      },
    ],
  };
  const types: IntrospectionType[] = Array.from(
    { length: typeCount },
    (_, typeIndex) => ({
      kind: "OBJECT",
      name: `Type${typeIndex}`,
      fields: [
        ...Array.from({ length: fieldsPerType }, (_, fieldIndex) => ({
          name: `field${fieldIndex}`,
          args: [],
          type: { kind: "SCALAR", name: "String" },
        })),
        ...(typeIndex === 0
          ? [
              {
                name: "email",
                args: [],
                type: { kind: "SCALAR", name: "String" },
              },
            ]
          : []),
      ],
    }),
  );
  return {
    queryType: { name: "Query" },
    mutationType: { name: "Mutation" },
    types: [
      query,
      mutation,
      ...types,
      {
        kind: "ENUM",
        name: "Role",
        enumValues: [{ name: "ADMIN" }, { name: "USER" }],
      },
      {
        kind: "INTERFACE",
        name: "Node",
        fields: [],
        possibleTypes: [{ kind: "OBJECT", name: "Type0" }],
      },
      { kind: "SCALAR", name: "String" },
      { kind: "SCALAR", name: "ID" },
      { kind: "SCALAR", name: "DateTime" },
    ],
  } satisfies IntrospectionSchema;
}
