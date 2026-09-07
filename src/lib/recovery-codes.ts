import { randomBytes } from "node:crypto";

/** Unambiguous alphabet: no O/0, no I/1/L, so codes survive being written down. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_GROUPS = 3;
export const CODE_GROUP_LEN = 4;
export const RECOVERY_CODE_COUNT = 8;
export const CODE_LENGTH = CODE_GROUPS * CODE_GROUP_LEN;

export function makeRecoveryCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return Array.from({ length: CODE_GROUPS }, (_, i) =>
    chars.slice(i * CODE_GROUP_LEN, (i + 1) * CODE_GROUP_LEN).join(""),
  ).join("-");
}

/** People retype these by hand, so accept any casing, spacing or punctuation. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
