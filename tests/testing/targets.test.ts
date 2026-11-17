import { describe, expect, jest, test } from "@jest/globals";

import {
  normalizeTestUrl,
  resolveSitemapUrl,
  resolveTestPages,
  resolveTestTarget,
} from "../../src/testing/targets.js";
import type { FetchText } from "../../src/testing/types.js";

describe(normalizeTestUrl.name, () => {
  test("preserves path and query while removing the fragment", () => {
    expect(
      normalizeTestUrl("https://example.com/path?preview=true#section").href,
    ).toBe("https://example.com/path?preview=true");
  });

  test.each(["example.com", "/page", "ftp://example.com/page"])(
    "rejects %s",
    (value) => {
      expect(() => normalizeTestUrl(value)).toThrow(
        "--url must be an absolute HTTP(S) URL.",
      );
    },
  );
});

describe(resolveSitemapUrl.name, () => {
  const origin = new URL("https://example.com/");

  test.each([
    ["/custom.xml", "https://example.com/custom.xml"],
    ["custom.xml", "https://example.com/custom.xml"],
    ["./nested/custom.xml", "https://example.com/nested/custom.xml"],
    [
      "https://cdn.example.com/custom.xml#fragment",
      "https://cdn.example.com/custom.xml",
    ],
  ])("resolves %s from the target origin", (value, expected) => {
    expect(resolveSitemapUrl(value, origin).href).toBe(expected);
  });

  test.each(["", "mailto:test@example.com"])("rejects %p", (value) => {
    expect(() => resolveSitemapUrl(value, origin)).toThrow(
      "--sitemap must be an HTTP(S) URL or relative path.",
    );
  });
});

describe(resolveTestPages.name, () => {
  test("selects only the exact URL when sitemap mode is disabled", async () => {
    const fetchText = jest.fn<FetchText>();
    const target = resolveTestTarget({
      url: "https://example.com/path?preview=true#section",
    });

    await expect(resolveTestPages(target, { fetchText })).resolves.toEqual({
      mode: "single",
      pages: [new URL("https://example.com/path?preview=true")],
      sitemapUrls: [],
    });
    expect(fetchText).not.toHaveBeenCalled();
  });

  test("uses automatic sitemap discovery for a bare option", async () => {
    const fetchText = jest.fn<FetchText>(async (url) => {
      if (url.pathname === "/robots.txt") {
        return "Sitemap: https://example.com/site-map.xml";
      }

      return "<urlset><url><loc>https://example.com/one</loc></url></urlset>";
    });
    const target = resolveTestTarget({
      url: "https://example.com/page",
      sitemap: true,
    });

    const result = await resolveTestPages(target, { fetchText });

    expect(result.mode).toBe("sitemap");
    expect(result.pages.map((url) => url.href)).toEqual([
      "https://example.com/one",
    ]);
    expect(fetchText.mock.calls.map(([url]) => url.pathname)).toEqual([
      "/robots.txt",
      "/site-map.xml",
    ]);
  });

  test("uses an explicit relative sitemap without requesting robots.txt", async () => {
    const fetchText = jest.fn<FetchText>(async () =>
      Promise.resolve(
        "<urlset><url><loc>https://example.com/one</loc></url></urlset>",
      ),
    );
    const target = resolveTestTarget({
      url: "https://example.com/deep/page",
      sitemap: "custom.xml",
    });

    const result = await resolveTestPages(target, { fetchText });

    expect(result.sitemapUrls.map((url) => url.href)).toEqual([
      "https://example.com/custom.xml",
    ]);
    expect(fetchText).toHaveBeenCalledTimes(1);
  });
});
