import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "cheerio/slim";
import { websiteSnapshotManifestVersion } from "./types.js";
const websiteSnapshotManifestEnvironmentVariable = "PEAKFLOW_WEBSITE_SNAPSHOT";
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isSnapshotSource(value) {
  if (!isObject(value)) return false;
  return typeof value.targetUrl === "string" && typeof value.origin === "string" && (value.mode === "single" || value.mode === "sitemap") && isStringArray(value.sitemapUrls) && (value.sitemapHost === "preserve" || value.sitemapHost === "target");
}
function isSerializedPageSnapshot(value) {
  if (!isObject(value)) return false;
  return typeof value.requestedUrl === "string" && typeof value.finalUrl === "string" && typeof value.file === "string";
}
function isSnapshotFetchError(value) {
  if (!isObject(value)) return false;
  return typeof value.requestedUrl === "string" && typeof value.message === "string";
}
function isSnapshotManifest(value) {
  if (!isObject(value)) return false;
  return value.version === websiteSnapshotManifestVersion && typeof value.createdAt === "string" && isSnapshotSource(value.source) && Array.isArray(value.pages) && value.pages.every(isSerializedPageSnapshot) && Array.isArray(value.errors) && value.errors.every(isSnapshotFetchError);
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function getManifestPath() {
  const manifestPath = process.env[websiteSnapshotManifestEnvironmentVariable];
  if (!manifestPath) {
    throw new Error(
      "No Peakflow website snapshot manifest was found. Run `peakflow test` before running website tests."
    );
  }
  return manifestPath;
}
function readManifest(manifestPath) {
  let content;
  try {
    content = readFileSync(manifestPath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read Peakflow website snapshot manifest at ${manifestPath}: ${errorMessage(error)}`
    );
  }
  if (content.trim() === "") {
    throw new Error(
      `Peakflow website snapshot manifest at ${manifestPath} is empty or invalid.`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Peakflow website snapshot manifest at ${manifestPath} is not valid JSON: ${errorMessage(error)}`
    );
  }
  if (!isObject(parsed) || !("version" in parsed)) {
    throw new Error(
      `Peakflow website snapshot manifest at ${manifestPath} is empty or invalid.`
    );
  }
  if (parsed.version !== websiteSnapshotManifestVersion) {
    throw new Error(
      `Unsupported Peakflow website snapshot manifest version ${String(parsed.version)}; expected ${websiteSnapshotManifestVersion}.`
    );
  }
  if (!isSnapshotManifest(parsed)) {
    throw new Error(
      `Peakflow website snapshot manifest at ${manifestPath} is invalid.`
    );
  }
  return parsed;
}
class PageSnapshot {
  url;
  finalUrl;
  #document;
  #html;
  #filePath;
  constructor(page, manifestDirectory) {
    this.url = new URL(page.requestedUrl);
    this.finalUrl = new URL(page.finalUrl);
    this.#filePath = path.resolve(manifestDirectory, page.file);
  }
  get html() {
    if (this.#html !== void 0) return this.#html;
    try {
      this.#html = readFileSync(this.#filePath, "utf8");
    } catch (error) {
      throw new Error(
        `Unable to read website page snapshot at ${this.#filePath}: ${errorMessage(error)}`
      );
    }
    return this.#html;
  }
  get document() {
    if (this.#document === void 0) this.#document = load(this.html);
    return this.#document;
  }
}
function getWebsiteSnapshot() {
  const manifestPath = getManifestPath();
  const manifest = readManifest(manifestPath);
  const manifestDirectory = path.dirname(manifestPath);
  return {
    createdAt: manifest.createdAt,
    source: manifest.source,
    pages: manifest.pages.map(
      (page) => new PageSnapshot(page, manifestDirectory)
    ),
    errors: manifest.errors
  };
}
export {
  getWebsiteSnapshot,
  websiteSnapshotManifestEnvironmentVariable
};
