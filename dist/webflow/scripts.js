import { logger } from "../helpers/taskLogger.js";
import {
  generateCdnUrl,
  getDisplayName,
  getFilePath,
  getModuleHash
} from "../config/modules.js";
import { assetDataset } from "../helpers/dataset.js";
import { generateIdentityHash } from "../helpers/hash.js";
function isScriptIdentity(script) {
  return typeof script?.displayName === "string" && typeof script?.integrityHash === "string" && typeof script?.version === "string";
}
function assertScriptIdentity(script) {
  if (!isScriptIdentity(script)) {
    throw new TypeError(`Expected a valid script identity`);
  }
}
async function generateRegisterScripts(modules, repo) {
  return Promise.all(
    modules.map(async (mod) => {
      const hash = await getModuleHash(repo, mod);
      return {
        canCopy: true,
        displayName: getDisplayName(getFilePath(mod.path)),
        hostedLocation: generateCdnUrl(repo, mod),
        integrityHash: hash,
        version: mod.version
      };
    })
  );
}
async function generateUpsertScripts({
  modules,
  scripts: scriptsByHash,
  repo,
  dryRun = false
}) {
  return Promise.all(
    modules.map(async (mod) => {
      const filePath = getFilePath(mod.path);
      const integrityHash = await getModuleHash(repo, mod);
      const key = generateIdentityHash({
        displayName: getDisplayName(filePath),
        integrityHash,
        version: mod.version
      });
      const script = scriptsByHash.get(key);
      if (!dryRun && !script?.id) {
        logger.debug("Found script is invalid:", logger.newLine, script);
        throw new Error("Cannot upsert unregistered script");
      }
      return {
        id: script?.id ?? `${filePath} [unregistered]`,
        location: mod.path.endsWith(".css") ? "header" : "footer",
        version: mod.version,
        attributes: {
          [assetDataset.attr.hmr]: "true",
          [assetDataset.attr.local]: filePath
        }
      };
    })
  );
}
export {
  assertScriptIdentity,
  generateRegisterScripts,
  generateUpsertScripts,
  isScriptIdentity
};
