import type { IntrospectionSchema } from "shared";
import { describe, expect, it } from "vitest";

import { ExplorerSessionStore } from "./explorerSessions";
import { encodeSchemaPayload } from "./schemaCodec";

import type { FrontendSDK } from "@/types";

describe("ExplorerSessionStore", () => {
  it("hydrates runtime data but persists only one compressed schema payload", async () => {
    let persisted: Record<string, unknown> = {};
    const sdk = {
      storage: {
        get: () => persisted,
        set: (value: Record<string, unknown>) => {
          persisted = value;
          return Promise.resolve();
        },
      },
    } as unknown as FrontendSDK;
    const introspection: IntrospectionSchema = {
      queryType: { name: "Query" },
      types: [
        {
          kind: "OBJECT",
          name: "Query",
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
          fields: [],
        },
      ],
    };
    const payload = await encodeSchemaPayload(introspection);
    const store = new ExplorerSessionStore(sdk);
    const session = await store.createSession({
      id: "session-1",
      title: "Example",
      url: "https://example.test/graphql",
      schemaPayload: payload,
      supportsIntrospection: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      status: "success",
    });

    await store.add(session);

    expect(store.sessions.value[0]?.schema?.queries[0]?.name).toBe("viewer");
    expect(store.sessions.value[0]?.introspection).toEqual(introspection);
    const persistedSession = (
      persisted.explorerSessions as Array<Record<string, unknown>>
    )[0];
    expect(persistedSession?.schemaPayload).toEqual(payload);
    expect(persistedSession?.schema).toBeUndefined();
    expect(persistedSession?.introspection).toBeUndefined();
    expect(persistedSession?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
