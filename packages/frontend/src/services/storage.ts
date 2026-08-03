import type { FrontendSDK } from "@/types";

const DEFERRED_WRITE_DELAY_MS = 400;

export class StorageService {
  private data: Record<string, unknown>;
  private revision = 0;
  private persistedRevision = 0;
  private writePromise: Promise<void> | undefined;
  private deferredTimer: number | undefined;

  constructor(private readonly sdk: FrontendSDK) {
    this.data = this.readSDKStorage();
  }

  get<T = unknown>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  getAll(): Readonly<Record<string, unknown>> {
    return this.data;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data[key] = value;
    this.revision++;
    await this.flush();
  }

  setDeferred(key: string, value: unknown): void {
    this.data[key] = value;
    this.revision++;
    this.scheduleDeferredFlush();
  }

  setMultipleDeferred(data: Record<string, unknown>): void {
    Object.assign(this.data, data);
    this.revision++;
    this.scheduleDeferredFlush();
  }

  async remove(key: string): Promise<void> {
    if (!(key in this.data)) return;
    delete this.data[key];
    this.revision++;
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

    this.revision++;
    await this.flush();
  }

  async setMultiple(data: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, data);
    this.revision++;
    await this.flush();
  }

  async clear(): Promise<void> {
    this.data = {};
    this.revision++;
    await this.flush();
  }

  async flush(): Promise<void> {
    if (this.deferredTimer !== undefined) {
      window.clearTimeout(this.deferredTimer);
      this.deferredTimer = undefined;
    }

    if (this.writePromise !== undefined) {
      await this.writePromise;
      if (this.persistedRevision < this.revision) await this.flush();
      return;
    }

    if (this.persistedRevision === this.revision) return;

    const revisionToPersist = this.revision;
    const snapshot = { ...this.data };
    this.writePromise = this.sdk.storage
      .set(snapshot as unknown as Record<string, never>)
      .then(() => {
        this.persistedRevision = revisionToPersist;
      })
      .finally(() => {
        this.writePromise = undefined;
      });

    await this.writePromise;
    if (this.persistedRevision < this.revision) await this.flush();
  }

  private scheduleDeferredFlush(): void {
    if (this.deferredTimer !== undefined) {
      window.clearTimeout(this.deferredTimer);
    }
    this.deferredTimer = window.setTimeout(() => {
      this.deferredTimer = undefined;
      void this.flush().catch((error: unknown) => {
        console.error(
          `Failed to persist GraphQL Analyzer state: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, DEFERRED_WRITE_DELAY_MS);
  }

  private readSDKStorage(): Record<string, unknown> {
    const value = this.sdk.storage.get();
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? { ...value }
      : {};
  }
}

let storageServiceInstance: StorageService | undefined;

export function createStorageService(sdk: FrontendSDK): StorageService {
  storageServiceInstance ??= new StorageService(sdk);
  return storageServiceInstance;
}
