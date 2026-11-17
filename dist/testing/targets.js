import { discoverSitemapPages } from "./sitemap.js";
function assertHttpUrl(url, label) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL.`);
  }
}
function normalizeTestUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("--url must be an absolute HTTP(S) URL.");
  }
  assertHttpUrl(url, "--url");
  url.hash = "";
  return url;
}
function resolveSitemapUrl(value, origin) {
  const sitemap = value.trim();
  if (!sitemap) {
    throw new TypeError("--sitemap must be an HTTP(S) URL or relative path.");
  }
  let url;
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
function resolveTestTarget(options) {
  const url = normalizeTestUrl(options.url);
  const target = {
    type: "url",
    url,
    origin: new URL(url.origin)
  };
  if (options.sitemap !== void 0) {
    target.sitemap = options.sitemap;
  }
  if (options.sitemapHost !== void 0) {
    if (options.sitemap === void 0) {
      throw new TypeError("--sitemap-host requires --sitemap.");
    }
    target.sitemapHost = options.sitemapHost;
  }
  return target;
}
async function resolveTestPages(target, options = {}) {
  if (target.sitemap === void 0) {
    return {
      mode: "single",
      pages: [new URL(target.url)],
      sitemapUrls: []
    };
  }
  const sitemapUrl = typeof target.sitemap === "string" ? resolveSitemapUrl(target.sitemap, target.origin) : void 0;
  const discoveryOptions = {
    ...options.fetchText ? { fetchText: options.fetchText } : {},
    ...sitemapUrl ? { sitemapUrl } : {},
    ...target.sitemapHost === "target" ? { pageOrigin: target.origin } : {}
  };
  const result = await discoverSitemapPages(target.origin, discoveryOptions);
  return {
    mode: "sitemap",
    pages: result.pages,
    sitemapUrls: result.sitemapUrls
  };
}
export {
  normalizeTestUrl,
  resolveSitemapUrl,
  resolveTestPages,
  resolveTestTarget
};
