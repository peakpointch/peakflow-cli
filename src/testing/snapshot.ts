import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensurePeakflowDirectory } from "../helpers/peakflowDirectory.js";
import type {
  FetchPage,
  FetchedPage,
  WebsiteSnapshotCapture,
  WebsiteSnapshotCaptureInput,
  WebsiteSnapshotCaptureOptions,
  WebsiteSnapshotFetchError,
  WebsiteSnapshotManifest,
  WebsiteSnapshotPageManifest,
  WebsiteSnapshotPageErrorHandler,
} from "./types.js";
import { websiteSnapshotManifestVersion } from "./types.js";

const defaultConcurrency = 5;
const pageFetchTimeoutMs = 15_000;
const manifestFileName = "website-snapshot.json";

/**
 * Represent a page that was fetched and converted to manifest data.
 */
interface SnapshotPageSuccess {
  status: "success";
  page: WebsiteSnapshotPageManifest;
}

/**
 * Represent a page that could not be fetched for the snapshot.
 */
interface SnapshotPageFailure {
  status: "failure";
  error: WebsiteSnapshotFetchError;
}

/**
 * Represent either a successful page capture or a page-fetch failure.
 */
type SnapshotPageResult = SnapshotPageSuccess | SnapshotPageFailure;

/**
 * Group successful page manifests and fetch errors collected during capture.
 */
interface SnapshotPageCollection {
  pages: WebsiteSnapshotPageManifest[];
  errors: WebsiteSnapshotFetchError[];
}

/**
 * Convert an unknown page-fetch failure into a readable message.
 *
 * @param error - Failure value to format.
 * @returns Error message text.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Validate the number of concurrent page fetch workers.
 *
 * @param concurrency - Requested worker count.
 * @throws When the value is not a positive integer.
 */
function validateConcurrency(concurrency: number): void {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError("Snapshot concurrency must be a positive integer.");
  }
}

/**
 * Fetch and validate one static HTML page.
 *
 * @param url - Page URL to fetch.
 * @returns The requested URL, final response URL, and HTML content.
 * @throws When the request fails or the response is not HTML.
 */
export async function fetchPage(url: URL): Promise<FetchedPage> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(pageFetchTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error(
      `Expected HTML but received ${contentType || "no content type"}.`,
    );
  }

  return {
    requestedUrl: new URL(url),
    finalUrl: new URL(response.url || url),
    content: await response.text(),
  };
}

/**
 * Process items with a bounded number of concurrent workers.
 *
 * @param items - Items to process.
 * @param concurrency - Maximum number of active workers.
 * @param worker - Asynchronous item processor.
 * @returns Results in the same order as the input items.
 */
async function runWorkerPool<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  worker: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  /**
   * Consume the next available item for this worker.
   */
  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];

      if (item === undefined) continue;

      results[index] = await worker(item);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return results;
}

/**
 * Build the serializable source metadata for a website snapshot.
 *
 * @param input - Target and resolved page selection for the run.
 * @returns Snapshot source metadata.
 */
function createSource(
  input: WebsiteSnapshotCaptureInput,
): WebsiteSnapshotManifest["source"] {
  return {
    targetUrl: input.target.url.href,
    origin: input.target.origin.href,
    mode: input.selection.mode,
    sitemapUrls: input.selection.sitemapUrls.map((url) => url.href),
    sitemapHost: input.target.sitemapHost ?? "preserve",
  };
}

/**
 * Convert a fetched page into its manifest representation.
 *
 * @param page - Fetched page data.
 * @returns Serializable page data for the snapshot manifest.
 */
function createPageManifest(page: FetchedPage): WebsiteSnapshotPageManifest {
  return {
    requestedUrl: page.requestedUrl.href,
    finalUrl: page.finalUrl.href,
    content: page.content,
  };
}

/**
 * Fetch one page and convert failures into manifest errors.
 *
 * @param url - Page URL to capture.
 * @param getPage - Page-fetch implementation.
 * @returns A successful page manifest or an ordered fetch error.
 */
async function capturePage(
  url: URL,
  getPage: FetchPage,
): Promise<SnapshotPageResult> {
  try {
    const page = await getPage(url);
    return { status: "success", page: createPageManifest(page) };
  } catch (error) {
    return {
      status: "failure",
      error: {
        requestedUrl: url.href,
        message: errorMessage(error),
      },
    };
  }
}

/**
 * Create a unique directory for one website test run.
 *
 * @param peakflowDirectory - Existing project `.peakflow` directory.
 * @returns The created website test run directory path.
 */
async function createTestRunDirectory(
  peakflowDirectory: string,
): Promise<string> {
  return mkdtemp(path.join(peakflowDirectory, "website-test-"));
}

/**
 * Resolve the project directory used for snapshot manifests.
 *
 * @param projectDirectory - Optional project working-directory override.
 * @returns The ensured project `.peakflow` directory.
 */
async function resolveManifestDirectory(
  projectDirectory: string | undefined,
): Promise<string> {
  if (projectDirectory === undefined) {
    return ensurePeakflowDirectory();
  }

  return ensurePeakflowDirectory({ cwd: projectDirectory });
}

/**
 * Create an idempotent cleanup function for a snapshot directory.
 *
 * @param directory - Temporary directory to remove.
 * @returns A cleanup function safe to call more than once.
 */
function createCleanup(directory: string): () => Promise<void> {
  let cleaned = false;

  async function cleanup(): Promise<void> {
    if (cleaned) return;

    cleaned = true;
    await rm(directory, { recursive: true, force: true });
  }

  return cleanup;
}

/**
 * Notify the caller about page errors in deterministic page order.
 *
 * @param errors - Page errors collected during capture.
 * @param onPageError - Optional page-error callback.
 */
function notifyPageErrors(
  errors: WebsiteSnapshotFetchError[],
  onPageError: WebsiteSnapshotPageErrorHandler | undefined,
): void {
  if (!onPageError) return;

  for (const error of errors) onPageError(error);
}

/**
 * Fetch all selected pages and separate successes from fetch failures.
 *
 * @param input - Target and resolved page selection for the run.
 * @param options - Fetch, concurrency, and page-error callback options.
 * @returns Ordered successful pages and fetch errors.
 */
async function collectSnapshotPages(
  input: WebsiteSnapshotCaptureInput,
  options: WebsiteSnapshotCaptureOptions,
): Promise<SnapshotPageCollection> {
  const concurrency = options.concurrency ?? defaultConcurrency;
  validateConcurrency(concurrency);

  const getPage = options.fetchPage ?? fetchPage;
  const results = await runWorkerPool(
    input.selection.pages,
    concurrency,
    (url) => capturePage(url, getPage),
  );
  const collection: SnapshotPageCollection = { pages: [], errors: [] };

  for (const result of results) {
    if (result.status === "success") {
      collection.pages.push(result.page);
      continue;
    }

    collection.errors.push(result.error);
  }

  notifyPageErrors(collection.errors, options.onPageError);
  return collection;
}

/**
 * Build a versioned manifest from the captured pages and errors.
 *
 * @param input - Target and resolved page selection for the run.
 * @param collection - Captured pages and fetch errors.
 * @returns Serializable website snapshot manifest.
 */
function createSnapshotManifest(
  input: WebsiteSnapshotCaptureInput,
  collection: SnapshotPageCollection,
): WebsiteSnapshotManifest {
  return {
    version: websiteSnapshotManifestVersion,
    createdAt: new Date().toISOString(),
    source: createSource(input),
    pages: collection.pages,
    errors: collection.errors,
  };
}

/**
 * Fetch selected pages and persist their HTML in a temporary manifest.
 *
 * @param input - Target and resolved page selection for the run.
 * @param options - Fetch, concurrency, manifest, and warning options.
 * @returns The manifest, its path, and an idempotent cleanup function.
 */
export async function captureSnapshot(
  input: WebsiteSnapshotCaptureInput,
  options: WebsiteSnapshotCaptureOptions = {},
): Promise<WebsiteSnapshotCapture> {
  const collection = await collectSnapshotPages(input, options);
  const manifest = createSnapshotManifest(input, collection);
  let manifestDirectory = options.manifestDirectory;

  if (manifestDirectory === undefined) {
    manifestDirectory = await resolveManifestDirectory(
      options.projectDirectory,
    );
  }

  const directory = await createTestRunDirectory(manifestDirectory);
  const manifestPath = path.join(directory, manifestFileName);

  try {
    const content = JSON.stringify(manifest, null, 2);
    await writeFile(manifestPath, content + "\n", {
      encoding: "utf8",
    });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }

  return {
    manifest,
    manifestPath,
    cleanup: createCleanup(directory),
  };
}
