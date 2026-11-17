import { describe, expect, jest, test } from "@jest/globals";

import {
  discoverSitemapPages,
  parseRobotsSitemapUrls,
} from "../../src/testing/sitemap.js";
import type { FetchText } from "../../src/testing/types.js";

function createFetchText(responses: Record<string, string>): FetchText {
  return jest.fn<FetchText>(async (url) => {
    const response = responses[url.href];

    if (response === undefined) {
      throw new Error(`Unexpected URL: ${url.href}`);
    }

    return response;
  });
}

describe(parseRobotsSitemapUrls.name, () => {
  test("extracts, resolves, and deduplicates sitemap directives", () => {
    const urls = parseRobotsSitemapUrls(
      [
        "User-agent: *",
        "Sitemap: https://example.com/first.xml",
        "sItEmAp: /second.xml",
        "Sitemap: https://example.com/first.xml",
        "Sitemap: ftp://example.com/ignored.xml",
      ].join("\n"),
      new URL("https://example.com"),
    );

    expect(urls.map((url) => url.href)).toEqual([
      "https://example.com/first.xml",
      "https://example.com/second.xml",
    ]);
  });
});

describe(discoverSitemapPages.name, () => {
  test("falls back to /sitemap.xml when robots cannot be fetched", async () => {
    const fetchText = createFetchText({
      "https://example.com/sitemap.xml":
        "<urlset><url><loc>https://example.com/page</loc></url></urlset>",
    });

    const result = await discoverSitemapPages(new URL("https://example.com"), {
      fetchText,
    });

    expect(result.pages.map((url) => url.href)).toEqual([
      "https://example.com/page",
    ]);
    expect(result.sitemapUrls.map((url) => url.href)).toEqual([
      "https://example.com/sitemap.xml",
    ]);
  });

  test("recurses through indexes, avoids cycles, and preserves unique order", async () => {
    const fetchText = createFetchText({
      "https://example.com/root.xml": [
        "<sitemapindex>",
        "<sitemap><loc>https://example.com/one.xml</loc></sitemap>",
        "<sitemap><loc>https://example.com/two.xml</loc></sitemap>",
        "</sitemapindex>",
      ].join(""),
      "https://example.com/one.xml": [
        "<urlset>",
        "<url><loc>https://example.com/first#ignored</loc></url>",
        "<url><loc>https://example.com/shared</loc></url>",
        "</urlset>",
      ].join(""),
      "https://example.com/two.xml": [
        "<sitemapindex>",
        "<sitemap><loc>https://example.com/root.xml</loc></sitemap>",
        "<sitemap><loc>https://example.com/three.xml</loc></sitemap>",
        "</sitemapindex>",
      ].join(""),
      "https://example.com/three.xml": [
        "<urlset>",
        "<url><loc>https://example.com/shared</loc></url>",
        "<url><loc>https://example.com/last</loc></url>",
        "<url><loc>mailto:ignored@example.com</loc></url>",
        "</urlset>",
      ].join(""),
    });

    const result = await discoverSitemapPages(new URL("https://example.com"), {
      fetchText,
      sitemapUrl: new URL("https://example.com/root.xml"),
    });

    expect(result.sitemapUrls.map((url) => url.href)).toEqual([
      "https://example.com/root.xml",
      "https://example.com/one.xml",
      "https://example.com/two.xml",
      "https://example.com/three.xml",
    ]);
    expect(result.pages.map((url) => url.href)).toEqual([
      "https://example.com/first",
      "https://example.com/shared",
      "https://example.com/last",
    ]);
  });

  test("accepts namespace-prefixed sitemap documents", async () => {
    const fetchText = createFetchText({
      "https://example.com/sitemap.xml": [
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "<url><loc>https://example.com/page</loc></url>",
        "</urlset>",
      ].join(""),
    });

    await expect(
      discoverSitemapPages(new URL("https://example.com"), {
        fetchText,
        sitemapUrl: new URL("https://example.com/sitemap.xml"),
      }),
    ).resolves.toMatchObject({
      pages: [new URL("https://example.com/page")],
    });
  });

  test("rejects malformed sitemap XML with the sitemap URL", async () => {
    const fetchText = createFetchText({
      "https://example.com/broken.xml": "<urlset><url></urlset>",
    });

    await expect(
      discoverSitemapPages(new URL("https://example.com"), {
        fetchText,
        sitemapUrl: new URL("https://example.com/broken.xml"),
      }),
    ).rejects.toThrow(
      "Failed to parse sitemap https://example.com/broken.xml.",
    );
  });

  test("rejects documents without a sitemap root", async () => {
    const fetchText = createFetchText({
      "https://example.com/not-sitemap.xml": "<html></html>",
    });

    await expect(
      discoverSitemapPages(new URL("https://example.com"), {
        fetchText,
        sitemapUrl: new URL("https://example.com/not-sitemap.xml"),
      }),
    ).rejects.toThrow(
      "Failed to parse sitemap https://example.com/not-sitemap.xml.",
    );
  });
});
