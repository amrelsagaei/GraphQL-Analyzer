import { afterEach, describe, expect, it, vi } from "vitest";

import { StorageService } from "./storage";

import type { FrontendSDK } from "@/types";

type StorageChangeCallback = (value: unknown) => void;

function createStorageSDK(
  initial: Record<string, unknown> = {},
  setImplementation?: (value: Record<string, unknown>) => Promise<void>,
): {
  sdk: FrontendSDK;
  emitChange: StorageChangeCallback;
  set: ReturnType<typeof vi.fn>;
} {
  let persisted = { ...initial };
  let onChange: StorageChangeCallback = () => undefined;
  const set = vi.fn(async (value: Record<string, unknown>) => {
    if (setImplementation !== undefined) {
      await setImplementation(value);
    } else {
      persisted = { ...value };
    }
  });
  const sdk = {
    storage: {
      get: () => persisted,
      set,
      onChange: (callback: StorageChangeCallback) => {
        onChange = callback;
      },
    },
  } as unknown as FrontendSDK;

  return {
    sdk,
    emitChange: (value) => onChange(value),
    set,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("StorageService", () => {
  it("refreshes its cache when SDK storage changes", () => {
    const { sdk, emitChange } = createStorageSDK({ value: "old" });
    const storage = new StorageService(sdk);

    emitChange({ value: "new", external: true });

    expect(storage.get("value")).toBe("new");
    expect(storage.get("external")).toBe(true);
  });

  it("merges external changes without overwriting dirty local keys", async () => {
    const { sdk, emitChange, set } = createStorageSDK({ remote: "old" });
    const storage = new StorageService(sdk);

    storage.setDeferred("local", "pending");
    emitChange({ remote: "new", local: "external" });

    expect(storage.getAll()).toEqual({
      remote: "new",
      local: "pending",
    });
    await storage.flush();
    expect(set).toHaveBeenLastCalledWith({
      remote: "new",
      local: "pending",
    });
  });

  it("retries a rejected write and eventually persists the dirty snapshot", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    let persisted: Record<string, unknown> = {};
    const { sdk, set } = createStorageSDK({}, (value) => {
      attempts++;
      if (attempts === 1)
        return Promise.reject(new Error("temporary storage failure"));
      persisted = { ...value };
      return Promise.resolve();
    });
    const storage = new StorageService(sdk);

    await expect(storage.set("session", "value")).rejects.toThrow(
      "temporary storage failure",
    );
    expect(set).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(set).toHaveBeenCalledTimes(2);
    expect(persisted).toEqual({ session: "value" });
  });
});
