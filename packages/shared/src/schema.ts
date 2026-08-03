import { formatType } from "./generator";

import type {
  GraphQLField,
  GraphQLSchema,
  IntrospectionField,
  IntrospectionSchema,
  PointOfInterest,
} from "./index";

export function parseIntrospectionResult(
  schemaData: IntrospectionSchema,
): GraphQLSchema {
  const schema: GraphQLSchema = {
    queries: [],
    mutations: [],
    subscriptions: [],
    types: [],
    enums: [],
    interfaces: [],
    unions: [],
    scalars: [],
    pointsOfInterest: [],
  };

  const typesByName = new Map(
    schemaData.types
      .filter((type) => type.name !== undefined)
      .map((type) => [type.name as string, type]),
  );

  const queryType =
    schemaData.queryType?.name !== undefined
      ? typesByName.get(schemaData.queryType.name)
      : undefined;
  const mutationType =
    schemaData.mutationType?.name !== undefined
      ? typesByName.get(schemaData.mutationType.name)
      : undefined;
  const subscriptionType =
    schemaData.subscriptionType?.name !== undefined
      ? typesByName.get(schemaData.subscriptionType.name)
      : undefined;

  schema.queries = mapFields(queryType?.fields);
  schema.mutations = mapFields(mutationType?.fields);
  schema.subscriptions = mapFields(subscriptionType?.fields);

  const operationTypeNames = new Set(
    [
      schemaData.queryType?.name,
      schemaData.mutationType?.name,
      schemaData.subscriptionType?.name,
    ].filter((name): name is string => name !== undefined),
  );

  for (const type of schemaData.types) {
    if (type.name === undefined || type.name.startsWith("__")) continue;

    switch (type.kind) {
      case "OBJECT":
        if (!operationTypeNames.has(type.name)) {
          schema.types.push({
            name: type.name,
            kind: type.kind,
            description: type.description,
            fields: mapFields(type.fields),
          });
        }
        break;
      case "ENUM":
        schema.enums.push({
          name: type.name,
          description: type.description,
          values: (type.enumValues ?? []).map((value) => ({
            name: value.name,
            description: value.description,
            isDeprecated: value.isDeprecated === true,
            deprecationReason: value.deprecationReason,
          })),
        });
        break;
      case "INTERFACE":
        schema.interfaces.push({
          name: type.name,
          description: type.description,
          fields: mapFields(type.fields),
          possibleTypes: (type.possibleTypes ?? [])
            .map((possibleType) => possibleType.name)
            .filter((name): name is string => name !== undefined),
        });
        break;
      case "UNION":
        schema.unions.push({
          name: type.name,
          description: type.description,
          possibleTypes: (type.possibleTypes ?? [])
            .map((possibleType) => possibleType.name)
            .filter((name): name is string => name !== undefined),
        });
        break;
      case "SCALAR":
        if (!BUILT_IN_SCALARS.has(type.name)) {
          schema.scalars.push({
            name: type.name,
            description: type.description,
          });
        }
        break;
    }
  }

  schema.pointsOfInterest = generatePointsOfInterest(schema);
  return schema;
}

const BUILT_IN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);

function mapFields(fields: IntrospectionField[] | undefined): GraphQLField[] {
  return (fields ?? []).map((field) => ({
    name: field.name,
    description: field.description,
    args: (field.args ?? []).map((argument) => ({
      name: argument.name,
      type: formatType(argument.type),
      defaultValue: argument.defaultValue,
    })),
    type: formatType(field.type),
    isDeprecated: field.isDeprecated === true,
  }));
}

export function generatePointsOfInterest(
  schema: GraphQLSchema,
): PointOfInterest[] {
  const points: PointOfInterest[] = [];
  const operationGroups = [
    ["query", schema.queries],
    ["mutation", schema.mutations],
    ["subscription", schema.subscriptions],
  ] as const;

  for (const [operationType, fields] of operationGroups) {
    for (const field of fields) {
      addOperationPoints(points, field, operationType);
    }
  }

  for (const type of schema.types) {
    for (const field of type.fields ?? []) {
      if (
        /password|secret|token|key|credential|ssn|email|phone/i.test(field.name)
      ) {
        points.push({
          name: `${type.name}.${field.name}`,
          type: "field",
          description: field.description,
          reason: "Potentially sensitive data field",
          severity: "medium",
        });
      }
    }
  }

  return points;
}

function addOperationPoints(
  points: PointOfInterest[],
  field: GraphQLField,
  operationType: "query" | "mutation" | "subscription",
): void {
  if (/auth|login|token|password|credential|session/i.test(field.name)) {
    points.push({
      name: field.name,
      type: operationType,
      description: field.description,
      reason: "Authentication-related operation",
      severity: "high",
    });
  }

  if (/admin|delete|remove|destroy|update.*user|manage/i.test(field.name)) {
    points.push({
      name: field.name,
      type: operationType,
      description: field.description,
      reason: "Potentially privileged operation",
      severity: "medium",
    });
  }

  if (/upload|file|download|import|export/i.test(field.name)) {
    points.push({
      name: field.name,
      type: operationType,
      description: field.description,
      reason:
        "File operation - potential for path traversal/upload vulnerabilities",
      severity: "medium",
    });
  }
}
