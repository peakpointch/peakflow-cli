import { readFileSync } from "node:fs";
import path from "node:path";

import { load } from "cheerio/slim";
import type { CheerioAPI } from "cheerio/slim";

import type {
  PageSnapshot as PageSnapshotContract,
  SerializedPageSnapshot,
  WebsiteSnapshot,
  WebsiteSnapshotFetchError,
  WebsiteSnapshotManifest,
  WebsiteSnapshotSource,
} from "./types.js";
import { websiteSnapshotManifestVersion } from "./types.js";

/** Environment variable containing the manifest path for website tests. */
export const websiteSnapshotManifestEnvironmentVariable =
  "PEAKFLOW_WEBSITE_SNAPSHOT";

interface UnknownObject {
  [key: string]: unknown;
}

/**
 * Check whether a value is a non-null object with string keys.
 *
 * @param value - Value to inspect.
 * @returns Whether the value can be treated as an unknown object.
 */
function isObject(value: unknown): value is UnknownObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Check whether a value is an array containing only strings.
 *
 * @param value - Value to inspect.
 * @returns Whether the value is a string array.
 */
function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * Validate the serialized website source metadata.
 *
 * @param value - Value to inspect.
 * @returns Whether the value matches the snapshot source contract.
 */
function isSnapshotSource(value: unknown): value is WebsiteSnapshotSource {
  if (!isObject(value)) return false;

  return (
    typeof value.targetUrl === "string" &&
    typeof value.origin === "string" &&
    (value.mode === "single" || value.mode === "sitemap") &&
    isStringArray(value.sitemapUrls) &&
    (value.sitemapHost === "preserve" || value.sitemapHost === "target")
  );
}

/**
 * Validate one serialized page snapshot entry.
 *
 * @param value - Value to inspect.
 * @returns Whether the value matches the serialized page contract.
 */
function isSerializedPageSnapshot(
  value: unknown,
): value is SerializedPageSnapshot {
  if (!isObject(value)) return false;

  return (
    typeof value.requestedUrl === "string" &&
    typeof value.finalUrl === "string" &&
    typeof value.file === "string"
  );
}

/**
 * Validate one serialized page-fetch error.
 *
 * @param value - Value to inspect.
 * @returns Whether the value matches the page-fetch error contract.
 */
function isSnapshotFetchError(
  value: unknown,
): value is WebsiteSnapshotFetchError {
  if (!isObject(value)) return false;

  return (
    typeof value.requestedUrl === "string" && typeof value.message === "string"
  );
}

/**
 * Validate the complete serialized website snapshot manifest.
 *
 * @param value - Value to inspect.
 * @returns Whether the value matches the current manifest contract.
 */
function isSnapshotManifest(value: unknown): value is WebsiteSnapshotManifest {
  if (!isObject(value)) return false;

  return (
    value.version === websiteSnapshotManifestVersion &&
    typeof value.createdAt === "string" &&
    isSnapshotSource(value.source) &&
    Array.isArray(value.pages) &&
    value.pages.every(isSerializedPageSnapshot) &&
    Array.isArray(value.errors) &&
    value.errors.every(isSnapshotFetchError)
  );
}

/**
 * Convert an unknown failure into a readable message.
 *
 * @param error - Failure value to format.
 * @returns Error message text.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve the manifest path configured for the current website test run.
 *
 * @returns Absolute or caller-provided manifest path.
 * @throws When the Peakflow manifest environment variable is missing.
 */
function getManifestPath(): string {
  const manifestPath = process.env[websiteSnapshotManifestEnvironmentVariable];

  if (!manifestPath) {
    throw new Error(
      "No Peakflow website snapshot manifest was found. Run `peakflow test` before running website tests.",
    );
  }

  return manifestPath;
}

/**
 * Read and validate a serialized website snapshot manifest.
 *
 * @param manifestPath - Path to the manifest file.
 * @returns Validated website snapshot manifest.
 * @throws When the manifest cannot be read, parsed, or validated.
 */
function readManifest(manifestPath: string): WebsiteSnapshotManifest {
  let content: string;

  try {
    content = readFileSync(manifestPath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read Peakflow website snapshot manifest at ${manifestPath}: ${errorMessage(error)}`,
    );
  }

  if (content.trim() === "") {
    throw new Error(
      `Peakflow website snapshot manifest at ${manifestPath} is empty or invalid.`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(
      `Peakflow website snapshot manifest at ${manifestPath} is not valid JSON: ${errorMessage(error)}`,
    );
  }

  if (!isObject(parsed) || !("version" in parsed)) {
    throw new Error(
      `Peakflow website snapshot manifest at ${manifestPath} is empty or invalid.`,
    );
  }

  if (parsed.version !== websiteSnapshotManifestVersion) {
    throw new Error(
      `Unsupported Peakflow website snapshot manifest version ${String(parsed.version)}; expected ${websiteSnapshotManifestVersion}.`,
    );
  }

  if (!isSnapshotManifest(parsed)) {
    throw new Error(
      `Peakflow website snapshot manifest at ${manifestPath} is invalid.`,
    );
  }

  return parsed;
}

/** Runtime page snapshot with lazy, cached HTML and document access. */
class PageSnapshot implements PageSnapshotContract {
  readonly url: URL;
  readonly finalUrl: URL;

  #document: CheerioAPI | undefined;
  #html: string | undefined;
  readonly #filePath: string;

  constructor(page: SerializedPageSnapshot, manifestDirectory: string) {
    this.url = new URL(page.requestedUrl);
    this.finalUrl = new URL(page.finalUrl);
    this.#filePath = path.resolve(manifestDirectory, page.file);
  }

  get html(): string {
    if (this.#html !== undefined) return this.#html;

    try {
      this.#html = readFileSync(this.#filePath, "utf8");
    } catch (error) {
      throw new Error(
        `Unable to read website page snapshot at ${this.#filePath}: ${errorMessage(error)}`,
      );
    }

    return this.#html;
  }

  get document(): CheerioAPI {
    if (this.#document === undefined) this.#document = load(this.html);

    return this.#document;
  }
}

/**
 * Load the static website snapshot prepared by Peakflow for the current Jest run.
 *
 * @returns Website metadata, page fixtures, and fetch errors from the manifest.
 * @throws When the manifest path is missing, unreadable, malformed, or incompatible.
 */
export function getWebsiteSnapshot(): WebsiteSnapshot {
  const manifestPath = getManifestPath();
  const manifest = readManifest(manifestPath);
  const manifestDirectory = path.dirname(manifestPath);

  return {
    createdAt: manifest.createdAt,
    source: manifest.source,
    pages: manifest.pages.map(
      (page) => new PageSnapshot(page, manifestDirectory),
    ),
    errors: manifest.errors,
  };
}
