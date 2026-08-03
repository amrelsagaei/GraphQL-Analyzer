import type { IntrospectionSchema, Result } from "shared";

import { detectSchemaFormat } from "./detection";
import { parseJsonContent } from "./jsonParser";

export function parseSchemaFromFileContent(
  content: string,
): Result<{ introspection: IntrospectionSchema; format: string }> {
  const jsonResult = parseJsonContent(content);
  if (jsonResult.kind === "Error") {
    return jsonResult;
  }

  const detection = detectSchemaFormat(jsonResult.value);

  if (detection.schema === undefined) {
    return {
      kind: "Error",
      error: detection.error ?? "Failed to detect schema format",
    };
  }

  return {
    kind: "Ok",
    value: {
      introspection: detection.schema,
      format: detection.format,
    },
  };
}
