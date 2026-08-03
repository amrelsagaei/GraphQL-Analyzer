import type { DashboardActivity, Result, SchemaImportResult } from "shared";

import { useSDK } from "@/plugins/sdk";
import { createExplorerSessionStore } from "@/services/explorerSessions";
import { createStorageService } from "@/services/storage";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export function useSchemaImport(
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void,
  onSessionsChanged?: () => void,
) {
  const sdk = useSDK();
  const sessionStore = createExplorerSessionStore(sdk);
  const storage = createStorageService(sdk);

  const importSchemaFile = async (file: File): Promise<boolean> => {
    let hostedFile: Awaited<ReturnType<typeof sdk.files.create>> | undefined;

    try {
      hostedFile = await sdk.files.create(file);
      const result: Result<SchemaImportResult & { fileName: string }> =
        await sdk.backend.importSchemaFromFile(hostedFile.path, file.name);

      if (result.kind === "Error") {
        sdk.window.showToast(`Import failed: ${result.error}`, {
          variant: "error",
        });
        return false;
      }

      const displayName = file.name.replace(/\.(json|graphql|gql)$/i, "");
      const session = await sessionStore.createSession({
        id: generateId(),
        title: displayName,
        url: `file://${file.name}`,
        schemaPayload: result.value.schema,
        supportsIntrospection: true,
        createdAt: new Date(),
        status: "success",
        sourceType: "file-import",
      });
      await sessionStore.add(session);

      const activities = storage.get<DashboardActivity[]>(
        "dashboardActivities",
      );
      const activity: DashboardActivity = {
        id: generateId(),
        title: `Schema import: ${displayName}`,
        url: `file://${file.name}`,
        description: `Imported from ${file.name} (${result.value.format})`,
        createdAt: new Date(),
        status: "success",
        type: "scan",
      };
      await storage.set(
        "dashboardActivities",
        [activity, ...(Array.isArray(activities) ? activities : [])].slice(
          0,
          20,
        ),
      );

      onSessionsChanged?.();
      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-sessions-updated"),
      );
      sdk.window.showToast(
        `Schema imported successfully from "${file.name}"!`,
        {
          variant: "success",
        },
      );
      window.setTimeout(() => navigateTo?.("Explorer"), 800);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      sdk.window.showToast(`Import failed: ${message}`, { variant: "error" });
      return false;
    } finally {
      if (hostedFile !== undefined) {
        try {
          await sdk.files.delete(hostedFile.id);
        } catch (error) {
          console.error(
            `Failed to delete temporary schema upload: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  };

  return { importSchemaFile };
}
