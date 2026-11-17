import { discoverSitemapPages } from "./sitemap.js";
import type {
  FetchText,
  TestPageSelection,
  SitemapHostMode,
  TestTargetOptions,
  UrlTestTarget,
} from "./types.js";

export interface ResolveTestPagesOptions {
  fetchText?: FetchText;
}

function assertHttpUrl(url: URL, label: string): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL.`);
  }
}

export function normalizeTestUrl(value: string | URL): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new TypeError("--url must be an absolute HTTP(S) URL.");
  }

  assertHttpUrl(url, "--url");
  url.hash = "";
  return url;
}

export function resolveSitemapUrl(value: string, origin: URL): URL {
  const sitemap = value.trim();

  if (!sitemap) {
    throw new TypeError("--sitemap must be an HTTP(S) URL or relative path.");
  }

  let url: URL;

  try {
    url = new URL(sitemap, new URL("/", origin));
  } catch {
    throw new TypeError("--sitemap must be an HTTP(S) URL or relative path.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("--sitemap must be an HTTP(S) URL or relative path.");
  }

  url.hash = "";
  return url;
}

export function resolveTestTarget(options: TestTargetOptions): UrlTestTarget {
  const url = normalizeTestUrl(options.url);
  const target: UrlTestTarget = {
    type: "url",
    url,
    origin: new URL(url.origin),
  };

  if (options.sitemap !== undefined) {
    target.sitemap = options.sitemap;
  }

  if (options.sitemapHost !== undefined) {
    if (options.sitemap === undefined) {
      throw new TypeError("--sitemap-host requires --sitemap.");
    }

    target.sitemapHost = options.sitemapHost;
  }

  return target;
}

export async function resolveTestPages(
  target: UrlTestTarget,
  options: ResolveTestPagesOptions = {},
): Promise<TestPageSelection> {
  if (target.sitemap === undefined) {
    return {
      mode: "single",
      pages: [new URL(target.url)],
      sitemapUrls: [],
    };
  }

  const sitemapUrl =
    typeof target.sitemap === "string"
      ? resolveSitemapUrl(target.sitemap, target.origin)
      : undefined;
  const discoveryOptions = {
    ...(options.fetchText ? { fetchText: options.fetchText } : {}),
    ...(sitemapUrl ? { sitemapUrl } : {}),
    ...(target.sitemapHost === "target" ? { pageOrigin: target.origin } : {}),
  };
  const result = await discoverSitemapPages(target.origin, discoveryOptions);

  return {
    mode: "sitemap",
    pages: result.pages,
    sitemapUrls: result.sitemapUrls,
  };
}
