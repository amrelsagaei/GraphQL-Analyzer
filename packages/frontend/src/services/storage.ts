import type { FrontendSDK } from "@/types";

const DEFERRED_WRITE_DELAY_MS = 400;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 30_000;

export class StorageService {
  private data: Record<string, unknown>;
  private revision = 0;
  private readonly dirtyKeyRevisions = new Map<string, number>();
  private writePromise: Promise<void> | undefined;
  private retryAttempt = 0;

  constructor(private readonly sdk: FrontendSDK) {
    this.data = this.readSDKStorage();
    this.sdk.storage.onChange((value) => {
      this.applySDKStorage(value);
    });
  }

  get<T = unknown>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  getAll(): Readonly<Record<string, unknown>> {
    return this.data;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data[key] = value;
    this.markDirty([key]);
    await this.flush();
  }

  setDeferred(key: string, value: unknown): void {
    this.data[key] = value;
    this.markDirty([key]);
    this.scheduleDeferredFlush();
  }

  setMultipleDeferred(data: Record<string, unknown>): void {
    Object.assign(this.data, data);
    this.markDirty(Object.keys(data));
    this.scheduleDeferredFlush();
  }

  async remove(key: string): Promise<void> {
    if (!(key in this.data)) return;
    delete this.data[key];
    this.markDirty([key]);
    await this.flush();
  }

  async removeMultiple(keys: readonly string[]): Promise<void> {
    let changed = false;
    for (const key of keys) {
      if (key in this.data) {
        delete this.data[key];
        changed = true;
      }
    }
    if (!changed) return;

    this.markDirty(keys);
    await this.flush();
  }

  async setMultiple(data: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, data);
    this.markDirty(Object.keys(data));
    await this.flush();
  }

  async clear(): Promise<void> {
    const keys = Object.keys(this.data);
    this.data = {};
    this.markDirty(keys);
    await this.flush();
  }

  async flush(): Promise<void> {
    if (this.deferredTimer !== undefined) {
      globalThis.clearTimeout(this.deferredTimer);
      this.deferredTimer = undefined;
    }

    if (this.writePromise !== undefined) {
      await this.writePromise;
      if (this.dirtyKeyRevisions.size > 0) await this.flush();
      return;
    }

    if (this.dirtyKeyRevisions.size === 0) return;

    const revisionToPersist = this.revision;
    const snapshot = { ...this.data };
    const dirtySnapshot = new Map(this.dirtyKeyRevisions);
    this.writePromise = this.sdk.storage.set(
      snapshot as unknown as Record<string, never>,
    );

    try {
      await this.writePromise;
      for (const [key, revision] of dirtySnapshot) {
        if (
          revision <= revisionToPersist &&
          this.dirtyKeyRevisions.get(key) === revision
        ) {
          this.dirtyKeyRevisions.delete(key);
        }
      }
      this.retryAttempt = 0;
    } catch (error) {
      this.scheduleRetry();
      throw error;
    } finally {
      this.writePromise = undefined;
    }

    if (this.dirtyKeyRevisions.size > 0) await this.flush();
  }

  private scheduleDeferredFlush(): void {
    if (this.deferredTimer !== undefined) {
      globalThis.clearTimeout(this.deferredTimer);
    }
    this.deferredTimer = globalThis.setTimeout(() => {
      this.deferredTimer = undefined;
      void this.flush().catch(logStorageError);
    }, DEFERRED_WRITE_DELAY_MS);
  }

  private scheduleRetry(): void {
    if (this.deferredTimer !== undefined) return;
    const delay = Math.min(
      RETRY_BASE_DELAY_MS * 2 ** this.retryAttempt,
      RETRY_MAX_DELAY_MS,
    );
    this.retryAttempt++;
    this.deferredTimer = globalThis.setTimeout(() => {
      this.deferredTimer = undefined;
      void this.flush().catch(logStorageError);
    }, delay);
  }

  private markDirty(keys: readonly string[]): void {
    if (keys.length === 0) return;
    this.revision++;
    for (const key of keys) this.dirtyKeyRevisions.set(key, this.revision);
  }

  private applySDKStorage(value: unknown): void {
    const external = normalizeStorage(value);
    if (this.dirtyKeyRevisions.size === 0) {
      this.data = external;
      return;
    }

    const merged = { ...external };
    for (const key of this.dirtyKeyRevisions.keys()) {
      if (key in this.data) merged[key] = this.data[key];
      else delete merged[key];
    }
    this.data = merged;
  }

  private readSDKStorage(): Record<string, unknown> {
    return normalizeStorage(this.sdk.storage.get());
  }
}

function normalizeStorage(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value }
    : {};
}

function logStorageError(error: unknown): void {
  console.error(
    `Failed to persist GraphQL Analyzer state: ${error instanceof Error ? error.message : String(error)}`,
  );
}

let storageServiceInstance: StorageService | undefined;

export function createStorageService(sdk: FrontendSDK): StorageService {
  storageServiceInstance ??= new StorageService(sdk);
  return storageServiceInstance;
}
