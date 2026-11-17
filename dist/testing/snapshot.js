import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensurePeakflowDirectory } from "../helpers/peakflowDirectory.js";
import { websiteSnapshotManifestVersion } from "./types.js";
const defaultConcurrency = 5;
const pageFetchTimeoutMs = 15e3;
const manifestFileName = "website-snapshot.json";
const pageDirectoryName = "pages";
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
      results[index] = await worker(item, index);
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
function createPageManifest(page, file) {
  return {
    requestedUrl: page.requestedUrl.href,
    finalUrl: page.finalUrl.href,
    file
  };
}
async function capturePage(url, getPage, pageDirectory, pageIndex) {
  try {
    const page = await getPage(url);
    const fileName = `${String(pageIndex + 1).padStart(6, "0")}.html`;
    const file = `${pageDirectoryName}/${fileName}`;
    await writeFile(path.join(pageDirectory, fileName), page.content, {
      encoding: "utf8"
    });
    return { status: "success", page: createPageManifest(page, file) };
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
async function collectSnapshotPages(input, options, pageDirectory) {
  const concurrency = options.concurrency ?? defaultConcurrency;
  validateConcurrency(concurrency);
  const getPage = options.fetchPage ?? fetchPage;
  const results = await runWorkerPool(
    input.selection.pages,
    concurrency,
    (url, index) => capturePage(url, getPage, pageDirectory, index)
  );
  const collection = { pages: [], errors: [] };
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
function createSnapshotManifest(input, collection) {
  return {
    version: websiteSnapshotManifestVersion,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: createSource(input),
    pages: collection.pages,
    errors: collection.errors
  };
}
async function captureSnapshot(input, options = {}) {
  let manifestDirectory = options.manifestDirectory;
  if (manifestDirectory === void 0) {
    manifestDirectory = await resolveManifestDirectory(
      options.projectDirectory
    );
  }
  const directory = await createTestRunDirectory(manifestDirectory);
  const manifestPath = path.join(directory, manifestFileName);
  const pageDirectory = path.join(directory, pageDirectoryName);
  let manifest;
  try {
    await mkdir(pageDirectory, { recursive: true });
    const collection = await collectSnapshotPages(
      input,
      options,
      pageDirectory
    );
    manifest = createSnapshotManifest(input, collection);
    const content = JSON.stringify(manifest, null, 2);
    await writeFile(manifestPath, content + "\n", {
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
