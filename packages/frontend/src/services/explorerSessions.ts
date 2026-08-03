import type {
  ExplorerSession,
  GraphQLSchema,
  IntrospectionSchema,
} from "shared";
import { computed, markRaw, ref, shallowRef } from "vue";

import { decodeSchemaPayload, encodeSchemaPayload } from "./schemaCodec";
import { createStorageService, type StorageService } from "./storage";

import type { FrontendSDK } from "@/types";

const SESSIONS_KEY = "explorerSessions";
const SELECTED_SESSION_KEY = "selectedExplorerSessionId";

type PersistedExplorerSession = Omit<
  ExplorerSession,
  "createdAt" | "schema" | "introspection"
> & {
  createdAt: string;
  schema?: GraphQLSchema;
};

type LegacyGraphQLSchema = GraphQLSchema & {
  rawIntrospection?: { __schema?: IntrospectionSchema };
};

export class ExplorerSessionStore {
  readonly sessions = shallowRef<ExplorerSession[]>([]);
  readonly selectedSessionId = ref<string>();
  readonly selectedSession = computed(() =>
    this.sessions.value.find(
      (session) => session.id === this.selectedSessionId.value,
    ),
  );

  private readonly storage: StorageService;
  private loadPromise: Promise<void> | undefined;
  private loaded = false;

  constructor(sdk: FrontendSDK) {
    this.storage = createStorageService(sdk);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise !== undefined) return this.loadPromise;

    this.loadPromise = this.loadFromStorage().finally(() => {
      this.loadPromise = undefined;
    });
    await this.loadPromise;
  }

  async createSession(
    metadata: Omit<ExplorerSession, "schema" | "introspection">,
  ): Promise<ExplorerSession> {
    if (metadata.schemaPayload === undefined) return metadata;
    const hydrated = await decodeSchemaPayload(metadata.schemaPayload);
    return markSessionRaw({ ...metadata, ...hydrated });
  }

  async add(session: ExplorerSession): Promise<void> {
    await this.load();
    this.sessions.value = [...this.sessions.value, markSessionRaw(session)];
    this.selectedSessionId.value = session.id;
    await this.persist();
  }

  async upsertByRequestId(session: ExplorerSession): Promise<void> {
    await this.load();
    const index = this.sessions.value.findIndex(
      (candidate) => candidate.requestId === session.requestId,
    );
    if (index === -1) {
      this.sessions.value = [...this.sessions.value, markSessionRaw(session)];
    } else {
      const updated = [...this.sessions.value];
      updated[index] = markSessionRaw(session);
      this.sessions.value = updated;
    }
    this.selectedSessionId.value = session.id;
    await this.persist();
  }

  async select(sessionId: string): Promise<void> {
    await this.load();
    if (!this.sessions.value.some((session) => session.id === sessionId))
      return;
    this.selectedSessionId.value = sessionId;
    await this.storage.set(SELECTED_SESSION_KEY, sessionId);
  }

  async remove(sessionId: string): Promise<void> {
    await this.load();
    this.sessions.value = this.sessions.value.filter(
      (session) => session.id !== sessionId,
    );
    if (this.selectedSessionId.value === sessionId) {
      this.selectedSessionId.value = this.sessions.value[0]?.id;
    }
    await this.persist();
  }

  async rename(sessionId: string, title: string): Promise<void> {
    await this.load();
    this.sessions.value = this.sessions.value.map((session) =>
      session.id === sessionId ? { ...session, title } : session,
    );
    await this.persist();
  }

  async clear(): Promise<void> {
    this.sessions.value = [];
    this.selectedSessionId.value = undefined;
    this.loaded = true;
    await this.storage.setMultiple({
      [SESSIONS_KEY]: [],
      [SELECTED_SESSION_KEY]: undefined,
    });
  }

  async persist(): Promise<void> {
    await this.storage.setMultiple({
      [SESSIONS_KEY]: this.sessions.value.map(serializeSession),
      [SELECTED_SESSION_KEY]: this.selectedSessionId.value,
    });
  }

  private async loadFromStorage(): Promise<void> {
    const stored = this.storage.get<PersistedExplorerSession[]>(SESSIONS_KEY);
    const sessions = Array.isArray(stored) ? stored : [];
    const hydratedSessions: ExplorerSession[] = [];
    let migrated = false;

    for (const session of sessions) {
      try {
        const hydrated = await hydratePersistedSession(session);
        hydratedSessions.push(hydrated.session);
        migrated ||= hydrated.migrated;
      } catch (error) {
        console.error(
          `Failed to load GraphQL session "${session.title}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.sessions.value = hydratedSessions;
    const storedSelection = this.storage.get<string>(SELECTED_SESSION_KEY);
    this.selectedSessionId.value = hydratedSessions.some(
      (session) => session.id === storedSelection,
    )
      ? storedSelection
      : hydratedSessions[0]?.id;
    this.loaded = true;

    if (migrated) await this.persist();
  }
}

async function hydratePersistedSession(
  persisted: PersistedExplorerSession,
): Promise<{ session: ExplorerSession; migrated: boolean }> {
  const createdAt = new Date(persisted.createdAt);
  if (persisted.schemaPayload !== undefined) {
    const hydrated = await decodeSchemaPayload(persisted.schemaPayload);
    return {
      session: markSessionRaw({ ...persisted, ...hydrated, createdAt }),
      migrated: persisted.schema !== undefined,
    };
  }

  if (persisted.schema === undefined) {
    return {
      session: { ...persisted, createdAt },
      migrated: false,
    };
  }

  const legacySchema = persisted.schema as LegacyGraphQLSchema;
  const introspection = getLegacyIntrospection(legacySchema);
  if (introspection !== undefined) {
    const schemaPayload = await encodeSchemaPayload(introspection);
    return {
      session: markSessionRaw({
        ...persisted,
        createdAt,
        schemaPayload,
        introspection: markRaw(introspection),
        schema: markRaw(compactLegacySchema(legacySchema)),
      }),
      migrated: true,
    };
  }

  return {
    session: markSessionRaw({
      ...persisted,
      createdAt,
      schema: markRaw(compactLegacySchema(legacySchema)),
    }),
    migrated: true,
  };
}

function getLegacyIntrospection(
  schema: LegacyGraphQLSchema,
): IntrospectionSchema | undefined {
  if (schema.rawIntrospection?.__schema !== undefined) {
    return schema.rawIntrospection.__schema;
  }
  if (schema.allTypes === undefined) return undefined;

  return {
    queryType: findOperationType(schema.allTypes, schema.queries, "Query"),
    mutationType: findOperationType(
      schema.allTypes,
      schema.mutations,
      "Mutation",
    ),
    subscriptionType: findOperationType(
      schema.allTypes,
      schema.subscriptions,
      "Subscription",
    ),
    types: schema.allTypes,
  };
}

function findOperationType(
  types: IntrospectionSchema["types"],
  fields: GraphQLSchema["queries"],
  conventionalName: string,
): { name: string } | undefined {
  if (fields.length === 0) return undefined;
  const operationType =
    types.find((type) => type.name === conventionalName) ??
    types.find(
      (type) =>
        type.kind === "OBJECT" &&
        fields.every((field) =>
          (type.fields ?? []).some(
            (candidate) => candidate.name === field.name,
          ),
        ),
    );
  return operationType?.name !== undefined && operationType.name !== ""
    ? { name: operationType.name }
    : undefined;
}

function compactLegacySchema(schema: GraphQLSchema): GraphQLSchema {
  const omittedKeys = new Set([
    "allTypes",
    "rawField",
    "rawType",
    "rawIntrospection",
    "rawIntrospectionData",
  ]);
  return JSON.parse(
    JSON.stringify(schema, (key, value: unknown) =>
      omittedKeys.has(key) ? undefined : value,
    ),
  ) as GraphQLSchema;
}

function serializeSession(session: ExplorerSession): PersistedExplorerSession {
  const { schema, introspection, createdAt, ...persisted } = session;
  if (session.schemaPayload !== undefined) {
    return { ...persisted, createdAt: createdAt.toISOString() };
  }
  return {
    ...persisted,
    createdAt: createdAt.toISOString(),
    schema: schema === undefined ? undefined : compactLegacySchema(schema),
  };
}

function markSessionRaw(session: ExplorerSession): ExplorerSession {
  if (session.schema !== undefined) markRaw(session.schema);
  if (session.introspection !== undefined) markRaw(session.introspection);
  return markRaw(session);
}

let explorerSessionStore: ExplorerSessionStore | undefined;

export function createExplorerSessionStore(
  sdk: FrontendSDK,
): ExplorerSessionStore {
  explorerSessionStore ??= new ExplorerSessionStore(sdk);
  return explorerSessionStore;
}
