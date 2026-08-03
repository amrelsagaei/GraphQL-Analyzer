import { describe, expect, it } from "vitest";

import { generateGraphQLQuery } from "./generator";

import type { GraphQLSchema } from "./index";

const createSchema = (types: GraphQLSchema["types"] = []): GraphQLSchema => ({
  queries: [],
  mutations: [],
  subscriptions: [],
  types,
  enums: [],
  interfaces: [],
  unions: [],
  scalars: [],
  pointsOfInterest: [],
});

describe("generateGraphQLQuery", () => {
  it("omits the selection set for a scalar field", () => {
    const query = generateGraphQLQuery(
      { name: "ping", args: [], type: "String" },
      "query",
      createSchema(),
    );

    expect(query).toContain("ping");
    expect(query).not.toContain("ping {");
  });

  it("selects scalar subfields of an object field", () => {
    const query = generateGraphQLQuery(
      { name: "me", args: [], type: "User" },
      "query",
      createSchema([
        {
          kind: "OBJECT",
          name: "User",
          fields: [{ name: "id", args: [], type: "ID" }],
        },
      ]),
    );

    expect(query).toContain("me {");
    expect(query).toContain("id");
  });

  it("falls back to __typename when nested objects yield no fields", () => {
    const query = generateGraphQLQuery(
      { name: "billingAdmin", args: [], type: "BillingAdminQuery" },
      "query",
      createSchema([
        {
          kind: "OBJECT",
          name: "BillingAdminQuery",
          fields: [
            {
              name: "routerEntitlement",
              args: [],
              type: "RouterEntitlement",
            },
          ],
        },
        { kind: "OBJECT", name: "RouterEntitlement", fields: [] },
      ]),
    );

    expect(query).toContain("billingAdmin {");
    expect(query).toContain("__typename");
    expect(query).not.toMatch(/billingAdmin \{\s*\}/);
  });

  it("falls back to __typename when an object has no selectable fields", () => {
    const query = generateGraphQLQuery(
      { name: "empty", args: [], type: "Empty" },
      "query",
      createSchema([{ kind: "OBJECT", name: "Empty", fields: [] }]),
    );

    expect(query).toContain("empty {");
    expect(query).toContain("__typename");
  });

  it("bounds expansion for highly connected schemas", () => {
    const types = Array.from({ length: 100 }, (_, typeIndex) => ({
      kind: "OBJECT",
      name: `Type${typeIndex}`,
      fields: [
        { name: "id", args: [], type: "ID" },
        ...Array.from({ length: 20 }, (_, fieldIndex) => ({
          name: `child${fieldIndex}`,
          args: [],
          type: `Type${(typeIndex + fieldIndex + 1) % 100}`,
        })),
      ],
    }));

    const query = generateGraphQLQuery(
      { name: "root", args: [], type: "Type0" },
      "query",
      createSchema(types),
      20,
    );

    expect(query.length).toBeLessThan(250_000);
    expect(query).toContain("root {");
    expect(query.endsWith("}")).toBe(true);
  });
});
