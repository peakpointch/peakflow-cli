import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensurePeakflowDirectory } from "../helpers/peakflowDirectory.js";
import { websiteSnapshotManifestVersion } from "./types.js";
const defaultConcurrency = 5;
const pageFetchTimeoutMs = 15e3;
const manifestFileName = "website-snapshot.json";
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function validateConcurrency(concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError("Snapshot concurrency must be a positive integer.");
  }
}
async function fetchPage(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(pageFetchTimeoutMs)
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error(
      `Expected HTML but received ${contentType || "no content type"}.`
    );
  }
  return {
    requestedUrl: new URL(url),
    finalUrl: new URL(response.url || url),
    content: await response.text()
  };
}
async function runWorkerPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];
      if (item === void 0) continue;
      results[index] = await worker(item);
    }
  }
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
function createSource(input) {
  return {
    targetUrl: input.target.url.href,
    origin: input.target.origin.href,
    mode: input.selection.mode,
    sitemapUrls: input.selection.sitemapUrls.map((url) => url.href),
    sitemapHost: input.target.sitemapHost ?? "preserve"
  };
}
function createPageManifest(page) {
  return {
    requestedUrl: page.requestedUrl.href,
    finalUrl: page.finalUrl.href,
    content: page.content
  };
}
async function capturePage(url, getPage) {
  try {
    const page = await getPage(url);
    return { status: "success", page: createPageManifest(page) };
  } catch (error) {
    return {
      status: "failure",
      error: {
        requestedUrl: url.href,
        message: errorMessage(error)
      }
    };
  }
}
async function createTestRunDirectory(peakflowDirectory) {
  return mkdtemp(path.join(peakflowDirectory, "website-test-"));
}
async function resolveManifestDirectory(projectDirectory) {
  if (projectDirectory === void 0) {
    return ensurePeakflowDirectory();
  }
  return ensurePeakflowDirectory({ cwd: projectDirectory });
}
function createCleanup(directory) {
  let cleaned = false;
  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    await rm(directory, { recursive: true, force: true });
  }
  return cleanup;
}
function notifyPageErrors(errors, onPageError) {
  if (!onPageError) return;
  for (const error of errors) onPageError(error);
}
async function captureSnapshot(input, options = {}) {
  const concurrency = options.concurrency ?? defaultConcurrency;
  validateConcurrency(concurrency);
  const getPage = options.fetchPage ?? fetchPage;
  const results = await runWorkerPool(
    input.selection.pages,
    concurrency,
    (url) => capturePage(url, getPage)
  );
  const pages = [];
  const errors = [];
  for (const result of results) {
    if (result.status === "success") {
      pages.push(result.page);
    } else {
      errors.push(result.error);
    }
  }
  notifyPageErrors(errors, options.onPageError);
  const manifest = {
    version: websiteSnapshotManifestVersion,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: createSource(input),
    pages,
    errors
  };
  let manifestDirectory = options.manifestDirectory;
  if (manifestDirectory === void 0) {
    manifestDirectory = await resolveManifestDirectory(
      options.projectDirectory
    );
  }
  const directory = await createTestRunDirectory(manifestDirectory);
  const manifestPath = path.join(directory, manifestFileName);
  try {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}
`, {
      encoding: "utf8"
    });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    manifest,
    manifestPath,
    cleanup: createCleanup(directory)
  };
}
export {
  captureSnapshot,
  fetchPage
};
