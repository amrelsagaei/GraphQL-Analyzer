import { gzipSync, strToU8 } from "fflate/browser";
import type { EncodedIntrospectionSchema, IntrospectionSchema } from "shared";

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeIntrospectionSchema(
  schema: IntrospectionSchema,
): EncodedIntrospectionSchema {
  const json = JSON.stringify(schema);
  const jsonBytes = strToU8(json);
  const compressed = gzipSync(jsonBytes, { level: 6 });

  return {
    encoding: "gzip-base64",
    data: encodeBase64(compressed),
    uncompressedSize: jsonBytes.byteLength,
  };
}

function encodeBase64(bytes: Uint8Array): string {
  let encoded = "";
  let index = 0;

  for (; index + 2 < bytes.length; index += 3) {
    const triplet =
      (bytes[index]! << 16) | (bytes[index + 1]! << 8) | bytes[index + 2]!;
    encoded +=
      BASE64_ALPHABET.charAt((triplet >>> 18) & 0x3f) +
      BASE64_ALPHABET.charAt((triplet >>> 12) & 0x3f) +
      BASE64_ALPHABET.charAt((triplet >>> 6) & 0x3f) +
      BASE64_ALPHABET.charAt(triplet & 0x3f);
  }

  const remaining = bytes.length - index;
  if (remaining === 1) {
    const triplet = bytes[index]! << 16;
    encoded +=
      BASE64_ALPHABET.charAt((triplet >>> 18) & 0x3f) +
      BASE64_ALPHABET.charAt((triplet >>> 12) & 0x3f) +
      "==";
  } else if (remaining === 2) {
    const triplet = (bytes[index]! << 16) | (bytes[index + 1]! << 8);
    encoded +=
      BASE64_ALPHABET.charAt((triplet >>> 18) & 0x3f) +
      BASE64_ALPHABET.charAt((triplet >>> 12) & 0x3f) +
      BASE64_ALPHABET.charAt((triplet >>> 6) & 0x3f) +
      "=";
  }

  return encoded;
}
