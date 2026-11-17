import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, jest, test } from "@jest/globals";

import { captureWebsiteSnapshot } from "../../src/testing/snapshot.js";
import { resolveTestTarget } from "../../src/testing/targets.js";
import type {
  FetchPage,
  FetchedPage,
  TestPageSelection,
  WebsiteSnapshotCaptureInput,
  WebsiteSnapshotPageErrorHandler,
} from "../../src/testing/types.js";

/**
 * Create deterministic fetched-page data for snapshot tests.
 */
function successfulPage(
  url: URL,
  content = "<html></html>",
  finalUrl = url,
): FetchedPage {
  return {
    requestedUrl: new URL(url),
    finalUrl: new URL(finalUrl),
    content,
  };
}

/**
 * Create a single-page selection for snapshot tests.
 */
function createSelection(pages: URL[]): TestPageSelection {
  return {
    mode: "single",
    pages,
    sitemapUrls: [],
  };
}

/**
 * Create snapshot capture input for the supplied pages.
 */
function createInput(pages: URL[]): WebsiteSnapshotCaptureInput {
  const target = resolveTestTarget({
    url: pages[0] ?? "https://example.com",
  });

  return {
    target,
    selection: createSelection(pages),
  };
}

/**
 * Create a temporary parent directory for snapshot tests.
 */
async function createTempDirectory(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "peakflow-snapshot-test-"));
}

describe(captureWebsiteSnapshot.name, () => {
  test("captures pages in input order and writes a versioned manifest", async () => {
    const directory = await createTempDirectory();
    const pages = [
      new URL("https://example.com/first"),
      new URL("https://example.com/second"),
    ];
    const fetchPage = jest.fn<FetchPage>(async (url) =>
      successfulPage(
        url,
        `<h1>${url.pathname}</h1>`,
        url.pathname === "/second"
          ? new URL("https://www.example.com/second")
          : url,
      ),
    );

    try {
      const capture = await captureWebsiteSnapshot(createInput(pages), {
        fetchPage,
        manifestDirectory: directory,
      });
      const manifestText = await readFile(capture.manifestPath, "utf8");
      const manifest = JSON.parse(manifestText) as typeof capture.manifest;

      expect(manifest.version).toBe(1);
      expect(manifest.source).toMatchObject({
        targetUrl: "https://example.com/first",
        origin: "https://example.com/",
        mode: "single",
        sitemapHost: "preserve",
      });
      expect(manifest.pages.map((page) => page.requestedUrl)).toEqual(
        pages.map((page) => page.href),
      );
      expect(manifest.pages.map((page) => page.content)).toEqual([
        "<h1>/first</h1>",
        "<h1>/second</h1>",
      ]);
      expect(manifest.pages.map((page) => page.finalUrl)).toEqual([
        "https://example.com/first",
        "https://www.example.com/second",
      ]);
      expect(manifest.errors).toEqual([]);

      await capture.cleanup();
      await capture.cleanup();
      await expect(readFile(capture.manifestPath, "utf8")).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("creates the project .peakflow directory only when capturing", async () => {
    const projectDirectory = await createTempDirectory();
    const pages = [new URL("https://example.com/page")];

    try {
      const capture = await captureWebsiteSnapshot(createInput(pages), {
        projectDirectory,
        fetchPage: async (url) => successfulPage(url),
      });

      expect(capture.manifestPath).toContain(
        `${path.sep}.peakflow${path.sep}website-test-`,
      );
      await capture.cleanup();
    } finally {
      await rm(projectDirectory, { recursive: true, force: true });
    }
  });

  test("continues after failures and warns once per failed page", async () => {
    const directory = await createTempDirectory();
    const pages = [
      new URL("https://example.com/first"),
      new URL("https://example.com/broken"),
      new URL("https://example.com/third-broken"),
      new URL("https://example.com/last"),
    ];
    const fetchPage = jest.fn<FetchPage>(async (url) => {
      if (url.pathname.includes("broken")) {
        throw new Error(`Failed ${url.pathname}`);
      }

      return successfulPage(url);
    });
    const onPageError = jest.fn<WebsiteSnapshotPageErrorHandler>();

    try {
      const capture = await captureWebsiteSnapshot(createInput(pages), {
        concurrency: 2,
        fetchPage,
        manifestDirectory: directory,
        onPageError,
      });

      expect(capture.manifest.pages.map((page) => page.requestedUrl)).toEqual([
        pages[0]!.href,
        pages[3]!.href,
      ]);
      expect(capture.manifest.errors).toEqual([
        {
          requestedUrl: pages[1]!.href,
          message: "Failed /broken",
        },
        {
          requestedUrl: pages[2]!.href,
          message: "Failed /third-broken",
        },
      ]);
      expect(
        onPageError.mock.calls.map(([error]) => error.requestedUrl),
      ).toEqual([pages[1]!.href, pages[2]!.href]);

      await capture.cleanup();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("limits concurrent page fetching", async () => {
    const directory = await createTempDirectory();
    const pages = Array.from(
      { length: 6 },
      (_, index) => new URL(`https://example.com/${index}`),
    );
    let active = 0;
    let maximumActive = 0;
    const fetchPage: FetchPage = async (url) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return successfulPage(url);
    };

    try {
      const capture = await captureWebsiteSnapshot(createInput(pages), {
        concurrency: 2,
        fetchPage,
        manifestDirectory: directory,
      });

      expect(capture.manifest.pages).toHaveLength(6);
      expect(maximumActive).toBe(2);
      await capture.cleanup();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test.each([0, -1, 1.5])(
    "rejects invalid concurrency %s",
    async (concurrency) => {
      await expect(
        captureWebsiteSnapshot(createInput([]), { concurrency }),
      ).rejects.toThrow("Snapshot concurrency must be a positive integer.");
    },
  );
});
