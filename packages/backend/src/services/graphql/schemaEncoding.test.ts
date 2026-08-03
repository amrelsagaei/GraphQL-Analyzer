import { promisify } from "node:util";
import { gunzip } from "node:zlib";

import type { IntrospectionSchema } from "shared";
import { describe, expect, it } from "vitest";

import { encodeIntrospectionSchema } from "./schemaEncoding";

const gunzipAsync = promisify(gunzip);

describe("encodeIntrospectionSchema", () => {
  it("round-trips and substantially reduces a repetitive large schema", async () => {
    const schema: IntrospectionSchema = {
      queryType: { name: "Query" },
      types: Array.from({ length: 500 }, (_, index) => ({
        kind: "OBJECT",
        name: index === 0 ? "Query" : `Type${index}`,
        fields: Array.from({ length: 20 }, (_, fieldIndex) => ({
          name: `field${fieldIndex}`,
          args: [],
          type: { kind: "SCALAR", name: "String" },
        })),
      })),
    };
    const json = JSON.stringify(schema);

    const encoded = encodeIntrospectionSchema(schema);
    const decoded = await gunzipAsync(Buffer.from(encoded.data, "base64"));

    expect(encoded.encoding).toBe("gzip-base64");
    expect(encoded.uncompressedSize).toBe(Buffer.byteLength(json));
    expect(decoded.toString("utf8")).toBe(json);
    expect(encoded.data.length).toBeLessThan(json.length / 5);
  });
});
