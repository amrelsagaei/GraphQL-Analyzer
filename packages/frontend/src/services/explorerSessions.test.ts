import type { IntrospectionSchema } from "shared";
import { describe, expect, it, vi } from "vitest";

import { ExplorerSessionStore } from "./explorerSessions";
import { encodeSchemaPayload } from "./schemaCodec";
import { StorageService } from "./storage";

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
        onChange: () => undefined,
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
    const store = new ExplorerSessionStore(sdk, new StorageService(sdk));
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

  it("preserves an unreadable session when migration or later writes persist", async () => {
    const unreadableSession = {
      id: "unreadable-session",
      title: "Unreadable",
      url: "https://unreadable.test/graphql",
      supportsIntrospection: true,
      createdAt: "2026-01-02T00:00:00.000Z",
      status: "success",
      schemaPayload: {
        encoding: "future-encoding",
        data: "unchanged-payload",
        uncompressedSize: 17,
      },
    };
    let persisted: Record<string, unknown> = {
      explorerSessions: [
        {
          id: "legacy-session",
          title: "Legacy",
          url: "https://legacy.test/graphql",
          supportsIntrospection: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "success",
          schema: {
            queries: [],
            mutations: [],
            subscriptions: [],
            types: [],
            enums: [],
            interfaces: [],
            unions: [],
            scalars: [],
            pointsOfInterest: [],
          },
        },
        unreadableSession,
      ],
      selectedExplorerSessionId: "legacy-session",
    };
    const sdk = {
      storage: {
        get: () => persisted,
        set: (value: Record<string, unknown>) => {
          persisted = value;
          return Promise.resolve();
        },
        onChange: () => undefined,
      },
    } as unknown as FrontendSDK;
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const store = new ExplorerSessionStore(sdk, new StorageService(sdk));

    await store.load();

    expect(store.sessions.value.map((session) => session.id)).toEqual([
      "legacy-session",
    ]);
    expect(
      (persisted.explorerSessions as Array<{ id: string }>).map(
        (session) => session.id,
      ),
    ).toEqual(["legacy-session", "unreadable-session"]);
    expect(
      (persisted.explorerSessions as Array<Record<string, unknown>>)[1],
    ).toEqual(unreadableSession);

    await store.rename("legacy-session", "Renamed Legacy");

    expect(
      (persisted.explorerSessions as Array<Record<string, unknown>>)[1],
    ).toEqual(unreadableSession);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load GraphQL session "Unreadable"'),
    );
  });
});
