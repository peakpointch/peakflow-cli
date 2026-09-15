import { PeakflowModule, PeakflowRepo } from "peakflow/config";
import { Webflow } from "webflow-api";

import { logger } from "../helpers/taskLogger.js";
import {
  generateCdnUrl,
  getDisplayName,
  getFilePath,
  getModuleHash,
} from "../config/modules.js";
import { assetDataset } from "../helpers/dataset.js";
import { generateIdentityHash } from "../helpers/hash.js";
import type { OptionDryRun } from "../types/cli.js";
import type { ScriptIdentity } from "../types/webflow.js";

export function isScriptIdentity(script: any): script is ScriptIdentity {
  return (
    typeof script?.displayName === "string" &&
    typeof script?.integrityHash === "string" &&
    typeof script?.version === "string"
  );
}

export function assertScriptIdentity(
  script: any,
): asserts script is ScriptIdentity {
  if (!isScriptIdentity(script)) {
    throw new TypeError(`Expected a valid script identity`);
  }
}

/**
 * Build a register request for each unique module
 */
export async function generateRegisterScripts(
  modules: PeakflowModule[],
  repo: PeakflowRepo,
): Promise<Webflow.CustomCodeHostedRequest[]> {
  return Promise.all(
    modules.map(async (mod) => {
      const hash = await getModuleHash(repo, mod);
      return {
        canCopy: true,
        displayName: getDisplayName(getFilePath(mod.path)) as string,
        hostedLocation: generateCdnUrl(repo, mod),
        integrityHash: hash,
        version: mod.version,
      };
    }),
  );
}

export type GenerateUpsertScriptsOptions = {
  modules: PeakflowModule[];
  scripts: Map<string, Webflow.CustomCodeHostedResponse>;
  repo: PeakflowRepo;
} & OptionDryRun;

/**
 * Build an upsert request for each script inside all modules
 */
export async function generateUpsertScripts({
  modules,
  scripts: scriptsByHash,
  repo,
  dryRun = false,
}: GenerateUpsertScriptsOptions): Promise<Webflow.ScriptApply[]> {
  return Promise.all(
    modules.map(async (mod) => {
      const filePath = getFilePath(mod.path);
      const integrityHash = await getModuleHash(repo, mod);
      const key = generateIdentityHash({
        displayName: getDisplayName(filePath),
        integrityHash,
        version: mod.version,
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
          [assetDataset.attr.local]: filePath,
        },
      };
    }),
  );
}
