import { readFile } from "fs/promises";

import type { SDK } from "caido:plugin";
import type { Result, SchemaDiscoveryResult, SchemaImportResult } from "shared";

import { GraphQLService } from "../services/graphql";
import { encodeIntrospectionSchema } from "../services/graphql/schemaEncoding";
import { parseSchemaFromFileContent } from "../services/graphql/schemaImporter";

export async function testGraphQLEndpoint(
  sdk: SDK,
  url: string,
  customHeaders?: Record<string, string>,
): Promise<Result<SchemaDiscoveryResult>> {
  const graphqlService = new GraphQLService(sdk);
  const result = await graphqlService.testEndpoint(url, customHeaders);
  return encodeDiscoveryResult(result);
}

export async function testGraphQLEndpointFromRequest(
  sdk: SDK,
  requestId: string,
  customHeaders?: Record<string, string>,
): Promise<Result<SchemaDiscoveryResult>> {
  const graphqlService = new GraphQLService(sdk);
  const result = await graphqlService.testEndpointFromRequest(
    requestId,
    customHeaders,
  );
  return encodeDiscoveryResult(result);
}

export async function executeGraphQLQuery(
  sdk: SDK,
  url: string,
  payload: {
    query: string;
    variables?: Record<string, unknown>;
    operationName?: string;
  },
): Promise<Result<Record<string, unknown>>> {
  const graphqlService = new GraphQLService(sdk);
  return graphqlService.executeQuery(url, payload);
}

export async function getRequestInfo(
  sdk: SDK,
  requestId: string,
): Promise<
  Result<{
    host: string;
    port: number;
    path: string;
    url: string;
    method: string;
    raw: string;
  }>
> {
  try {
    if (!requestId) {
      return { kind: "Error", error: "No request ID provided" };
    }

    const result = await sdk.requests.get(requestId);
    if (!result) {
      return { kind: "Error", error: "Request not found" };
    }

    const request = result.request;
    return {
      kind: "Ok",
      value: {
        host: request.getHost(),
        port: request.getPort(),
        path: request.getPath(),
        url: request.getUrl(),
        method: request.getMethod(),
        raw: request.getRaw().toText(),
      },
    };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to get request info: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function importSchemaFromFile(
  _sdk: SDK,
  filePath: string,
  fileName: string,
): Promise<Result<SchemaImportResult & { fileName: string }>> {
  let fileContent: string;
  try {
    fileContent = await readFile(filePath, "utf8");
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to read uploaded schema: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const result = parseSchemaFromFileContent(fileContent);

  if (result.kind === "Error") {
    return result;
  }

  return {
    kind: "Ok",
    value: {
      schema: encodeIntrospectionSchema(result.value.introspection),
      format: result.value.format,
      fileName,
    },
  };
}

function encodeDiscoveryResult(
  result: Awaited<ReturnType<GraphQLService["testEndpoint"]>>,
): Result<SchemaDiscoveryResult> {
  if (result.kind === "Error") return result;
  if (!result.value.supportsIntrospection) {
    return { kind: "Ok", value: { supportsIntrospection: false } };
  }
  if (result.value.introspection === undefined) {
    return {
      kind: "Error",
      error: "Introspection succeeded without returning a schema",
    };
  }

  return {
    kind: "Ok",
    value: {
      supportsIntrospection: true,
      schema: encodeIntrospectionSchema(result.value.introspection),
    },
  };
}
