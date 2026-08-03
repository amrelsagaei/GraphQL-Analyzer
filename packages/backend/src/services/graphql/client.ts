import type { SDK } from "caido:plugin";
import { RequestSpec } from "caido:utils";
import type { IntrospectionSchema, Result } from "shared";
import { INTROSPECTION_QUERY } from "shared";

import {
  mapHttpStatusToError,
  mergeHeaders,
  parseRawHttpRequest,
} from "./requestUtils";
import {
  parseIntrospectionResponseBody,
  parseQueryResponseBody,
} from "./responseParser";

export class GraphQLClient {
  constructor(private sdk: SDK) {}

  async testEndpointFromRequest(
    requestId: string,
    customHeaders?: Record<string, string>,
  ): Promise<
    Result<{
      supportsIntrospection: boolean;
      introspection?: IntrospectionSchema;
    }>
  > {
    try {
      const requestResult = await this.sdk.requests.get(requestId);
      if (!requestResult) {
        return {
          kind: "Error",
          error: "Request not found",
        };
      }

      const originalRequest = requestResult.request;
      const originalUrl = originalRequest.getUrl();

      if (
        !originalUrl.startsWith("http://") &&
        !originalUrl.startsWith("https://")
      ) {
        return {
          kind: "Error",
          error: "Request URL must start with http:// or https://",
        };
      }

      const originalRaw = originalRequest.getRaw().toText();
      const parsed = parseRawHttpRequest(originalRaw);
      const originalHeaders = parsed.headers;
      const originalBody = parsed.body;

      const headers = mergeHeaders(originalHeaders, customHeaders);

      const method = originalRequest.getMethod() || "POST";

      if (originalBody && originalBody.trim() !== "") {
        try {
          const originalSpec = new RequestSpec(originalUrl);
          originalSpec.setMethod(method);

          for (const [name, value] of Object.entries(headers)) {
            if (value) {
              originalSpec.setHeader(name, value);
            }
          }

          originalSpec.setBody(originalBody);

          const originalResult = await this.sdk.requests.send(originalSpec);
          const originalProcessed =
            this.processIntrospectionResponse(originalResult);

          if (
            originalProcessed.kind === "Ok" &&
            originalProcessed.value.supportsIntrospection === true &&
            originalProcessed.value.introspection !== undefined
          ) {
            return originalProcessed;
          }
        } catch {
          // Ignore errors when trying original request
        }
      }

      const requestBody = JSON.stringify({
        query: INTROSPECTION_QUERY,
      });

      const spec = new RequestSpec(originalUrl);
      spec.setMethod("POST");

      for (const [name, value] of Object.entries(headers)) {
        if (value) {
          spec.setHeader(name, value);
        }
      }

      spec.setBody(requestBody);

      const result = await this.sdk.requests.send(spec);

      return this.processIntrospectionResponse(result);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      return {
        kind: "Error",
        error: `Failed to test GraphQL endpoint: ${errorMsg}`,
      };
    }
  }

  async testEndpoint(
    url: string,
    customHeaders?: Record<string, string>,
  ): Promise<
    Result<{
      supportsIntrospection: boolean;
      introspection?: IntrospectionSchema;
    }>
  > {
    try {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return {
          kind: "Error",
          error: "URL must start with http:// or https://",
        };
      }

      let hostHeader = "";
      try {
        const parsedUrl = new URL(url);
        if (
          parsedUrl.port &&
          ((parsedUrl.protocol === "https:" && parsedUrl.port !== "443") ||
            (parsedUrl.protocol === "http:" && parsedUrl.port !== "80"))
        ) {
          hostHeader = `${parsedUrl.hostname}:${parsedUrl.port}`;
        } else {
          hostHeader = parsedUrl.hostname;
        }
      } catch {
        return { kind: "Error", error: "Invalid URL format" };
      }

      if (!hostHeader) {
        return { kind: "Error", error: "Failed to extract host from URL" };
      }

      const headers = mergeHeaders({ Host: String(hostHeader) }, customHeaders);

      const requestBody = JSON.stringify({
        query: INTROSPECTION_QUERY,
      });

      if (!url || typeof url !== "string") {
        return { kind: "Error", error: "Invalid URL" };
      }

      const spec = new RequestSpec(url);
      spec.setMethod("POST");

      for (const [name, value] of Object.entries(headers)) {
        if (value) {
          spec.setHeader(name, value);
        }
      }

      spec.setBody(requestBody);

      const result = await this.sdk.requests.send(spec);

      return this.processIntrospectionResponse(result);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      return {
        kind: "Error",
        error: `Failed to test GraphQL endpoint: ${errorMsg}`,
      };
    }
  }

  private processIntrospectionResponse(
    result: Awaited<ReturnType<typeof this.sdk.requests.send>>,
  ): Result<{
    supportsIntrospection: boolean;
    introspection?: IntrospectionSchema;
  }> {
    if (result.response === undefined) {
      return {
        kind: "Error",
        error: "No response received from the endpoint",
      };
    }

    const statusCode = result.response.getCode();
    const responseBody = result.response.getBody()?.toText() ?? "";

    const statusError = mapHttpStatusToError(statusCode, responseBody);
    if (statusError !== undefined) {
      return statusError;
    }

    return parseIntrospectionResponseBody(responseBody);
  }

  async executeQuery(
    url: string,
    payload: {
      query: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    },
  ): Promise<Result<Record<string, unknown>>> {
    try {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return {
          kind: "Error",
          error: "URL must start with http:// or https://",
        };
      }

      const spec = new RequestSpec(url);
      spec.setMethod("POST");
      spec.setHeader("Content-Type", "application/json");
      spec.setHeader("User-Agent", "Caido/GraphQL-Analyzer");
      spec.setBody(JSON.stringify(payload));

      const result = await this.sdk.requests.send(spec);

      if (result.response === undefined) {
        return {
          kind: "Error",
          error: "No response received",
        };
      }

      const body = result.response.getBody()?.toText() ?? "";
      return parseQueryResponseBody(body);
    } catch (error) {
      return {
        kind: "Error",
        error:
          error instanceof Error ? error.message : "Unknown execution error",
      };
    }
  }
}
