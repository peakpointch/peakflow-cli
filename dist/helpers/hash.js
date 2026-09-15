import { createHash } from "crypto";
function generateIntegrityHash(content) {
  const hash = createHash("sha384").update(content).digest("base64");
  return `sha384-${hash}`;
}
function generateIdentityHash(script) {
  const parts = [script.displayName, script.integrityHash, script.version];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
export {
  generateIdentityHash,
  generateIntegrityHash
};
