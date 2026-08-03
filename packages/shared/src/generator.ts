import type {
  GraphQLField,
  GraphQLSchema,
  GraphQLType,
  IntrospectionTypeRef,
} from "./index";

const BUILT_IN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);
const MAX_GENERATED_SELECTIONS = 2_000;

type SelectableType = Pick<GraphQLType, "name" | "kind" | "fields">;

type GenerationContext = {
  typeByName: Map<string, SelectableType>;
  leafTypes: Set<string>;
  remainingSelections: number;
};

export const formatType = (type: IntrospectionTypeRef): string => {
  if (type.kind === "NON_NULL" && type.ofType) {
    return `${formatType(type.ofType)}!`;
  }
  if (type.kind === "LIST" && type.ofType) {
    return `[${formatType(type.ofType)}]`;
  }
  return type.name ?? "Unknown";
};

export function generateGraphQLQuery(
  field: GraphQLField,
  operationType: "query" | "mutation" | "subscription",
  schema: GraphQLSchema,
  maxDepth: number = 5,
): string {
  const context = createGenerationContext(schema);
  const operationName = capitalize(field.name);
  const variableDefinitions = formatFieldArguments(field.args);
  const queryArguments = formatQueryArguments(field.args);
  const returnTypeName = getTypeName(field.type);
  const isLeaf = context.leafTypes.has(returnTypeName);
  const lines = [`${operationType} ${operationName}${variableDefinitions} {`];

  if (isLeaf) {
    lines.push(`  ${field.name}${queryArguments}`);
  } else {
    const nestedFields = generateNestedFields(
      field.type,
      context,
      Math.max(1, maxDepth),
      2,
      new Set<string>(),
    );

    lines.push(`  ${field.name}${queryArguments} {`);
    if (nestedFields.length === 0) {
      lines.push("    __typename");
    } else {
      for (const line of nestedFields) lines.push(line);
    }
    lines.push("  }");
  }

  lines.push("}");
  return lines.join("\n");
}

function createGenerationContext(schema: GraphQLSchema): GenerationContext {
  const typeByName = new Map<string, SelectableType>();
  for (const type of schema.types) typeByName.set(type.name, type);
  for (const type of schema.interfaces) {
    typeByName.set(type.name, {
      name: type.name,
      kind: "INTERFACE",
      fields: type.fields,
    });
  }

  const leafTypes = new Set(BUILT_IN_SCALARS);
  for (const scalar of schema.scalars) leafTypes.add(scalar.name);
  for (const enumType of schema.enums) leafTypes.add(enumType.name);

  return {
    typeByName,
    leafTypes,
    remainingSelections: MAX_GENERATED_SELECTIONS,
  };
}

function generateNestedFields(
  typeRef: string,
  context: GenerationContext,
  maxDepth: number,
  currentDepth: number,
  visitedTypes: Set<string>,
): string[] {
  if (currentDepth > maxDepth || context.remainingSelections <= 0) return [];

  const typeName = getTypeName(typeRef);
  if (typeName === "" || visitedTypes.has(typeName)) return [];

  const type = context.typeByName.get(typeName);
  if (type?.fields === undefined) return [];

  visitedTypes.add(typeName);
  const lines: string[] = [];
  const indent = "  ".repeat(currentDepth);

  for (const field of type.fields) {
    if (context.remainingSelections <= 0) break;
    if (field.isDeprecated === true || hasRequiredArguments(field)) continue;

    const fieldTypeName = getTypeName(field.type);
    if (fieldTypeName === "") continue;

    if (context.leafTypes.has(fieldTypeName)) {
      lines.push(`${indent}${field.name}`);
      context.remainingSelections--;
      continue;
    }

    if (currentDepth >= maxDepth || visitedTypes.has(fieldTypeName)) continue;

    const nestedLines = generateNestedFields(
      field.type,
      context,
      maxDepth,
      currentDepth + 1,
      visitedTypes,
    );
    if (nestedLines.length === 0) continue;

    lines.push(`${indent}${field.name} {`);
    for (const nestedLine of nestedLines) lines.push(nestedLine);
    lines.push(`${indent}}`);
    context.remainingSelections--;
  }

  visitedTypes.delete(typeName);
  return lines;
}

function hasRequiredArguments(field: GraphQLField): boolean {
  return field.args.some((argument) => argument.type.endsWith("!"));
}

function getTypeName(type: string): string {
  return type.replace(/[[\]!]/g, "");
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatFieldArguments(args: GraphQLField["args"]): string {
  if (args.length === 0) return "";
  return `(${args.map((argument) => `$${argument.name}: ${argument.type}`).join(", ")})`;
}

function formatQueryArguments(args: GraphQLField["args"]): string {
  if (args.length === 0) return "";
  return `(${args.map((argument) => `${argument.name}: $${argument.name}`).join(", ")})`;
}
