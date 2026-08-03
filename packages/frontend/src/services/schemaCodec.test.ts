import type { IntrospectionSchema } from "shared";
import { describe, expect, it } from "vitest";

import { decodeSchemaPayload, encodeSchemaPayload } from "./schemaCodec";

describe("schema codec", () => {
  it("round-trips introspection and hydrates the compact runtime schema", async () => {
    const introspection: IntrospectionSchema = {
      queryType: { name: "RootQuery" },
      types: [
        {
          kind: "OBJECT",
          name: "RootQuery",
          fields: [
            {
              name: "viewer",
              args: [],
              type: { kind: "OBJECT", name: "Viewer" },
            },
          ],
        },
        {
          kind: "OBJECT",
          name: "Viewer",
          fields: [
            {
              name: "name",
              args: [],
              type: { kind: "SCALAR", name: "String" },
            },
          ],
        },
        { kind: "SCALAR", name: "String" },
      ],
    };

    const encoded = await encodeSchemaPayload(introspection);
    const hydrated = await decodeSchemaPayload(encoded);

    expect(hydrated.introspection).toEqual(introspection);
    expect(hydrated.schema.queries[0]).toMatchObject({
      name: "viewer",
      type: "Viewer",
    });
    expect(hydrated.schema.types[0]?.name).toBe("Viewer");
    expect(hydrated.schema.allTypes).toBeUndefined();
  });
});
