import type { DefineAPI, SDK } from "caido:plugin";

import {
  cancelAttackSession,
  createCaidoFinding,
  executeGraphQLAttacks,
  executeGraphQLQuery,
  getAttackStatus,
  getAttackTemplates,
  getRequestInfo,
  importSchemaFromFile,
  startGraphQLAttacks,
  testGraphQLEndpoint,
  testGraphQLEndpointFromRequest,
} from "./api";

export type {
  Result,
  GraphQLSchema,
  GraphQLField,
  GraphQLArg,
  GraphQLType,
  GraphQLEnum,
  GraphQLInterface,
  GraphQLUnion,
  GraphQLScalar,
  PointOfInterest,
  AttackType,
  AttackResult,
  AttackFinding,
  AttackConfig,
  AttackSession,
  DashboardActivity,
  ExplorerSession,
  SchemaImportResult,
  SchemaDiscoveryResult,
  EncodedIntrospectionSchema,
} from "shared";

export { type BackendEvents } from "./types";

export type API = DefineAPI<{
  testGraphQLEndpoint: typeof testGraphQLEndpoint;
  testGraphQLEndpointFromRequest: typeof testGraphQLEndpointFromRequest;
  executeGraphQLQuery: typeof executeGraphQLQuery;
  executeGraphQLAttacks: typeof executeGraphQLAttacks;
  startGraphQLAttacks: typeof startGraphQLAttacks;
  getAttackStatus: typeof getAttackStatus;
  cancelAttackSession: typeof cancelAttackSession;
  getAttackTemplates: typeof getAttackTemplates;
  createCaidoFinding: typeof createCaidoFinding;
  getRequestInfo: typeof getRequestInfo;
  importSchemaFromFile: typeof importSchemaFromFile;
}>;

export function init(sdk: SDK<API>) {
  sdk.api.register("testGraphQLEndpoint", testGraphQLEndpoint);
  sdk.api.register(
    "testGraphQLEndpointFromRequest",
    testGraphQLEndpointFromRequest,
  );
  sdk.api.register("executeGraphQLQuery", executeGraphQLQuery);
  sdk.api.register("executeGraphQLAttacks", executeGraphQLAttacks);
  sdk.api.register("startGraphQLAttacks", startGraphQLAttacks);
  sdk.api.register("getAttackStatus", getAttackStatus);
  sdk.api.register("cancelAttackSession", cancelAttackSession);
  sdk.api.register("getAttackTemplates", getAttackTemplates);
  sdk.api.register("createCaidoFinding", createCaidoFinding);
  sdk.api.register("getRequestInfo", getRequestInfo);
  sdk.api.register("importSchemaFromFile", importSchemaFromFile);

  sdk.console.log("GraphQL Analyzer backend initialized");
}
