import { randomBytes, createHash } from "node:crypto";

/** Short, sortable-ish, URL-safe id. */
export function newId(prefix = ""): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(8).toString("hex");
  return `${prefix}${time}${rand}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
