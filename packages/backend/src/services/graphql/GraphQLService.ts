import type { SDK } from "caido:plugin";
import type { IntrospectionSchema, Result } from "shared";

import { GraphQLClient } from "./client";

export class GraphQLService {
  private client: GraphQLClient;

  constructor(sdk: SDK) {
    this.client = new GraphQLClient(sdk);
  }

  async testEndpointFromRequest(
    requestId: string,
    customHeaders?: Record<string, string>,
  ): Promise<
    Result<{
      supportsIntrospection: boolean;
      introspection?: IntrospectionSchema;
    }>
  > {
    return this.client.testEndpointFromRequest(requestId, customHeaders);
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
    return this.client.testEndpoint(url, customHeaders);
  }

  async executeQuery(
    url: string,
    payload: {
      query: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    },
  ): Promise<Result<Record<string, unknown>>> {
    return this.client.executeQuery(url, payload);
  }
}
