import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "@jest/globals";

import {
  getWebsiteSnapshot,
  websiteSnapshotManifestEnvironmentVariable,
} from "../../src/testing/fixture.js";
import {
  websiteSnapshotManifestVersion,
  type WebsiteSnapshotManifest,
} from "../../src/testing/types.js";

const manifestPaths: string[] = [];

/** Create a temporary directory for a fixture manifest. */
async function createTempDirectory(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "peakflow-fixture-test-"));
}

/** Write a fixture manifest and expose its path to the loader. */
async function writeManifest(
  manifest: unknown,
  pageHtml: string | undefined = undefined,
): Promise<string> {
  const directory = await createTempDirectory();
  const manifestPath = path.join(directory, "website-snapshot.json");
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8");

  if (pageHtml !== undefined) {
    const pageDirectory = path.join(directory, "pages");
    await mkdir(pageDirectory);
    await writeFile(path.join(pageDirectory, "000001.html"), pageHtml, "utf8");
  }

  manifestPaths.push(directory);
  process.env[websiteSnapshotManifestEnvironmentVariable] = manifestPath;
  return manifestPath;
}

/** Create a valid manifest used by fixture-loader tests. */
function createManifest(): WebsiteSnapshotManifest {
  return {
    version: websiteSnapshotManifestVersion,
    createdAt: "2026-11-17T12:00:00.000Z",
    source: {
      targetUrl: "https://example.com/",
      origin: "https://example.com/",
      mode: "single",
      sitemapUrls: [],
      sitemapHost: "preserve",
    },
    pages: [
      {
        requestedUrl: "https://example.com/",
        finalUrl: "https://www.example.com/",
        file: "pages/000001.html",
      },
    ],
    errors: [
      {
        requestedUrl: "https://example.com/missing",
        message: "Request failed with status 404.",
      },
    ],
  };
}

afterEach(async () => {
  delete process.env[websiteSnapshotManifestEnvironmentVariable];

  for (const directory of manifestPaths.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe(getWebsiteSnapshot.name, () => {
  test("loads page URLs, HTML, documents, metadata, and errors", async () => {
    await writeManifest(
      createManifest(),
      "<html><body><h1>Home</h1></body></html>",
    );

    const website = getWebsiteSnapshot();
    const page = website.pages[0];

    expect(website.createdAt).toBe("2026-11-17T12:00:00.000Z");
    expect(website.source.targetUrl).toBe("https://example.com/");
    expect(page?.url.href).toBe("https://example.com/");
    expect(page?.finalUrl.href).toBe("https://www.example.com/");
    expect(page?.html).toContain("<h1>Home</h1>");
    expect(page?.document("h1").text()).toBe("Home");
    expect(website.errors).toEqual([
      {
        requestedUrl: "https://example.com/missing",
        message: "Request failed with status 404.",
      },
    ]);
  });

  test("loads and caches page HTML and documents lazily", async () => {
    const manifestPath = await writeManifest(
      createManifest(),
      "<html><body><h1>Initial</h1></body></html>",
    );
    const pagePath = path.join(path.dirname(manifestPath), "pages/000001.html");
    const website = getWebsiteSnapshot();
    const page = website.pages[0]!;

    await writeFile(pagePath, "<html><body><h1>Loaded</h1></body></html>");

    expect(page.html).toContain("Loaded");
    const document = page.document;
    expect(document("h1").text()).toBe("Loaded");

    await writeFile(pagePath, "<html><body><h1>Changed</h1></body></html>");

    expect(page.html).toContain("Loaded");
    expect(page.document).toBe(document);
    expect(page.document("h1").text()).toBe("Loaded");
  });

  test("does not read page files while loading the website metadata", async () => {
    await writeManifest(createManifest());

    const website = getWebsiteSnapshot();

    expect(website.pages).toHaveLength(1);
    expect(() => website.pages[0]!.html).toThrow(
      "Unable to read website page snapshot",
    );
  });

  test("fails clearly when no manifest path is available", () => {
    delete process.env[websiteSnapshotManifestEnvironmentVariable];

    expect(() => getWebsiteSnapshot()).toThrow(
      "No Peakflow website snapshot manifest was found.",
    );
  });

  test("fails clearly when the manifest file is missing", async () => {
    const directory = await createTempDirectory();
    manifestPaths.push(directory);
    process.env[websiteSnapshotManifestEnvironmentVariable] = path.join(
      directory,
      "missing.json",
    );

    expect(() => getWebsiteSnapshot()).toThrow(
      "Unable to read Peakflow website snapshot manifest",
    );
  });

  test("rejects malformed JSON", async () => {
    const directory = await createTempDirectory();
    const manifestPath = path.join(directory, "website-snapshot.json");
    await writeFile(manifestPath, "{", "utf8");
    manifestPaths.push(directory);
    process.env[websiteSnapshotManifestEnvironmentVariable] = manifestPath;

    expect(() => getWebsiteSnapshot()).toThrow("is not valid JSON");
  });

  test("rejects an empty manifest", async () => {
    const directory = await createTempDirectory();
    const manifestPath = path.join(directory, "website-snapshot.json");
    await writeFile(manifestPath, "", "utf8");
    manifestPaths.push(directory);
    process.env[websiteSnapshotManifestEnvironmentVariable] = manifestPath;

    expect(() => getWebsiteSnapshot()).toThrow("is empty or invalid");
  });

  test("rejects an incompatible manifest version", async () => {
    const manifest = createManifest();
    await writeManifest({ ...manifest, version: "1.0.0" });

    expect(() => getWebsiteSnapshot()).toThrow(
      "Unsupported Peakflow website snapshot manifest version 1.0.0",
    );
  });

  test("rejects an invalid manifest shape", async () => {
    await writeManifest({ version: websiteSnapshotManifestVersion });

    expect(() => getWebsiteSnapshot()).toThrow("is invalid");
  });

  test("does not modify the manifest file while loading", async () => {
    const manifestPath = await writeManifest(createManifest());
    const before = await readFile(manifestPath, "utf8");

    getWebsiteSnapshot();

    await expect(readFile(manifestPath, "utf8")).resolves.toBe(before);
  });
});
