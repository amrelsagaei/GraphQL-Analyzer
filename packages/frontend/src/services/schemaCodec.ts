import type {
  EncodedIntrospectionSchema,
  GraphQLSchema,
  IntrospectionSchema,
} from "shared";
import { parseIntrospectionResult } from "shared";
import { markRaw } from "vue";

export type HydratedSchema = {
  introspection: IntrospectionSchema;
  schema: GraphQLSchema;
};

export async function decodeSchemaPayload(
  payload: EncodedIntrospectionSchema,
): Promise<HydratedSchema> {
  if (payload.encoding !== "gzip-base64") {
    throw new Error(`Unsupported schema encoding: ${String(payload.encoding)}`);
  }

  const compressed = decodeBase64(payload.data);
  const decompressedStream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const json = await new Response(decompressedStream).text();
  const introspection = JSON.parse(json) as IntrospectionSchema;

  return {
    introspection: markRaw(introspection),
    schema: markRaw(parseIntrospectionResult(introspection)),
  };
}

export async function encodeSchemaPayload(
  introspection: IntrospectionSchema,
): Promise<EncodedIntrospectionSchema> {
  const json = JSON.stringify(introspection);
  const input = new Blob([json]).stream();
  const compressed = await new Response(
    input.pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();

  return {
    encoding: "gzip-base64",
    data: encodeBase64(new Uint8Array(compressed)),
    uncompressedSize: new TextEncoder().encode(json).byteLength,
  };
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
    );
  }
  return btoa(chunks.join(""));
}
