import { Classic } from "@caido/primevue";
import { type RequestDraft, type RequestFull } from "@caido/sdk-frontend";
import PrimeVue from "primevue/config";
import Tooltip from "primevue/tooltip";
import { type Component, createApp, markRaw } from "vue";

import { SDKPlugin } from "./plugins/sdk";
import { createStorageService } from "./services/storage";
import "./styles/index.css";
import type { FrontendSDK } from "./types";
import { isGraphQLRequest } from "./utils/graphql";
import App from "./views/App.vue";
import GraphQLViewMode from "./views/GraphQLViewMode.vue";

export const init = (sdk: FrontendSDK) => {
  const storage = createStorageService(sdk);
  const app = createApp(App);

  app.use(PrimeVue, {
    unstyled: true,
    pt: Classic,
  });

  app.directive("tooltip", Tooltip);

  app.use(SDKPlugin, sdk);

  const root = document.createElement("div");
  Object.assign(root.style, {
    height: "100%",
    width: "100%",
  });

  root.id = `plugin--graphql-analyzer`;

  app.mount(root);

  sdk.navigation.addPage("/graphql-analyzer", {
    body: root,
  });

  sdk.sidebar.registerItem("GraphQL Analyzer", "/graphql-analyzer", {
    icon: "fas fa-project-diagram",
  });

  const viewMode = {
    label: "GraphQL",
    view: { component: markRaw(GraphQLViewMode) as Component },
    when: (request: RequestFull | RequestDraft) =>
      isGraphQLRequest(request.raw),
  };

  sdk.httpHistory.addRequestViewMode(viewMode);
  sdk.search.addRequestViewMode(viewMode);
  sdk.sitemap.addRequestViewMode(viewMode);
  sdk.replay.addRequestViewMode(viewMode);
  sdk.intercept.addRequestViewMode(viewMode);

  sdk.commands.register("graphql-analyzer-scan", {
    name: "Scan GraphQL Endpoint",
    run: async (context) => {
      let requestId: string | undefined = undefined;

      if (context.type === "RequestRowContext") {
        if (context.requests.length > 0) {
          const request = context.requests[0];
          if (request !== undefined && request.id !== undefined) {
            requestId = request.id.toString();
          }
        }
      } else if (context.type === "RequestContext") {
        const request = context.request;
        if (
          request !== undefined &&
          request.type === "RequestFull" &&
          request.id !== undefined
        ) {
          requestId = request.id.toString();
        }
      }

      if (requestId === undefined) {
        sdk.window.showToast("No request selected", { variant: "warning" });
        return;
      }

      window.location.hash = "/graphql-analyzer";

      const navigationData = {
        page: "Dashboard" as const,
        timestamp: Date.now(),
      };
      await storage.setMultiple({
        "graphql-analyzer-navigate-to": navigationData.page,
        "graphql-analyzer-navigate-timestamp":
          navigationData.timestamp.toString(),
        "graphql-analyzer-context-scan-request-id": requestId,
      });

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-navigate", {
          detail: { page: "Dashboard" },
        }),
      );

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-context-scan", {
          detail: { requestId },
        }),
      );
    },
    group: "GraphQL Analyzer",
    when: (context) => {
      return (
        context.type === "RequestRowContext" ||
        context.type === "RequestContext"
      );
    },
  });

  sdk.commands.register("graphql-analyzer-attack", {
    name: "Attack GraphQL Endpoint",
    run: async (context) => {
      let requestId: string | undefined = undefined;

      if (context.type === "RequestRowContext") {
        if (context.requests.length > 0) {
          const request = context.requests[0];
          if (request !== undefined && request.id !== undefined) {
            requestId = request.id.toString();
          }
        }
      } else if (context.type === "RequestContext") {
        const request = context.request;
        if (
          request !== undefined &&
          request.type === "RequestFull" &&
          request.id !== undefined
        ) {
          requestId = request.id.toString();
        }
      }

      if (requestId === undefined) {
        sdk.window.showToast("No request selected", { variant: "warning" });
        return;
      }

      window.location.hash = "/graphql-analyzer";

      const navigationData = {
        page: "Attacks" as const,
        timestamp: Date.now(),
      };
      await storage.setMultiple({
        "graphql-analyzer-navigate-to": navigationData.page,
        "graphql-analyzer-navigate-timestamp":
          navigationData.timestamp.toString(),
        "graphql-analyzer-context-attack-request-id": requestId,
      });

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-navigate", {
          detail: { page: "Attacks" },
        }),
      );

      window.dispatchEvent(
        new CustomEvent("graphql-analyzer-context-attack", {
          detail: { requestId },
        }),
      );
    },
    group: "GraphQL Analyzer",
    when: (context) => {
      return (
        context.type === "RequestRowContext" ||
        context.type === "RequestContext"
      );
    },
  });

  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: "graphql-analyzer-scan",
    leadingIcon: "fas fa-project-diagram",
  });

  sdk.menu.registerItem({
    type: "Request",
    commandId: "graphql-analyzer-scan",
    leadingIcon: "fas fa-project-diagram",
  });

  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: "graphql-analyzer-attack",
    leadingIcon: "fas fa-shield-alt",
  });

  sdk.menu.registerItem({
    type: "Request",
    commandId: "graphql-analyzer-attack",
    leadingIcon: "fas fa-shield-alt",
  });
};
