import { createHash } from "crypto";
import type { ScriptIdentity } from "../types/webflow.js";

/**
 * Generates a SHA-384 SRI integrity hash.
 * @param content The string or Buffer content of your script/file.
 * @returns The integrity string (e.g., "sha384-xxxx...")
 */
export function generateIntegrityHash(content: string | Buffer): string {
  const hash = createHash("sha384").update(content).digest("base64"); // Must be base64 for SRI

  return `sha384-${hash}`;
}

/**
 * Generates a SHA-256 script identity hash.
 * @param script The scripts identity properties
 * @returns The identity hash as a string
 */
export function generateIdentityHash(script: ScriptIdentity): string {
  const parts = [script.displayName, script.integrityHash, script.version];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
