import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

import type { SDK } from "caido:plugin";
import { afterEach, describe, expect, it, vi } from "vitest";

import { importSchemaFromFile } from "./graphql";

vi.mock("caido:utils", () => ({ RequestSpec: class {} }));

const gunzipAsync = promisify(gunzip);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("importSchemaFromFile", () => {
  it("reads a native hosted-file path and returns a compressed schema", async () => {
    const directory = await mkdtemp(join(tmpdir(), "graphql-analyzer-test-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "schema.json");
    const schema = {
      queryType: { name: "Query" },
      types: [{ kind: "OBJECT", name: "Query", fields: [] }],
    };
    await writeFile(filePath, JSON.stringify({ data: { __schema: schema } }));

    const result = await importSchemaFromFile(
      {} as SDK,
      filePath,
      "schema.json",
    );

    expect(result.kind).toBe("Ok");
    if (result.kind === "Ok") {
      const decoded = await gunzipAsync(
        Buffer.from(result.value.schema.data, "base64"),
      );
      expect(JSON.parse(decoded.toString("utf8"))).toEqual(schema);
      expect(result.value.fileName).toBe("schema.json");
      expect(result.value.format).toBe("introspection-wrapped");
    }
  });

  it("reports an unreadable hosted-file path", async () => {
    const result = await importSchemaFromFile(
      {} as SDK,
      join(tmpdir(), "missing-graphql-analyzer-schema.json"),
      "missing.json",
    );
    expect(result.kind).toBe("Error");
  });
});
