import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";
const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  removeNSPrefix: true,
  trimValues: true
});
function isHttpUrl(url) {
  return url.protocol === "http:" || url.protocol === "https:";
}
function normalizeHttpUrl(value, base) {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (!isHttpUrl(url)) return void 0;
    url.hash = "";
    return url;
  } catch {
    return void 0;
  }
}
function rewriteUrlOrigin(url, origin) {
  const rewritten = new URL(origin.href);
  rewritten.pathname = url.pathname;
  rewritten.search = url.search;
  rewritten.hash = "";
  return rewritten;
}
function getLoc(entry) {
  if (typeof entry === "string") return entry.trim() || void 0;
  if (!entry || typeof entry !== "object") return void 0;
  const loc = entry.loc;
  return typeof loc === "string" ? loc.trim() || void 0 : void 0;
}
function getEntries(root, key) {
  if (!root || typeof root !== "object") return [];
  const entries = root[key];
  if (entries === void 0) return [];
  return Array.isArray(entries) ? entries : [entries];
}
function parseSitemapXml(xml) {
  try {
    SyntaxValidator.validate(xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid sitemap XML: ${message}`, { cause: error });
  }
  const parsed = xmlParser.parse(xml);
  if (Object.hasOwn(parsed, "urlset")) {
    return {
      type: "urlset",
      locations: getEntries(parsed.urlset, "url").map(getLoc).filter((loc) => loc !== void 0)
    };
  }
  if (Object.hasOwn(parsed, "sitemapindex")) {
    return {
      type: "sitemapindex",
      locations: getEntries(parsed.sitemapindex, "sitemap").map(getLoc).filter((loc) => loc !== void 0)
    };
  }
  throw new Error("Invalid sitemap XML: expected <urlset> or <sitemapindex>.");
}
function parseRobotsSitemapUrls(robots, origin) {
  const urls = [];
  const seen = /* @__PURE__ */ new Set();
  for (const line of robots.split(/\r?\n/u)) {
    const match = /^\s*sitemap\s*:\s*(.+?)\s*$/iu.exec(line);
    const url = match?.[1] ? normalizeHttpUrl(match[1], new URL("/", origin)) : void 0;
    if (!url || seen.has(url.href)) continue;
    seen.add(url.href);
    urls.push(url);
  }
  return urls;
}
async function fetchText(url) {
  const response = await axios.get(url.href, {
    responseType: "text"
  });
  return response.data;
}
async function discoverSitemapPages(origin, options = {}) {
  const getText = options.fetchText ?? fetchText;
  let rootSitemaps;
  if (options.sitemapUrl) {
    rootSitemaps = [options.sitemapUrl];
  } else {
    const robotsUrl = new URL("/robots.txt", origin);
    try {
      const robots = await getText(robotsUrl);
      rootSitemaps = parseRobotsSitemapUrls(robots, origin);
    } catch {
      rootSitemaps = [];
    }
    if (rootSitemaps.length === 0) {
      rootSitemaps = [new URL("/sitemap.xml", origin)];
    }
  }
  const pages = [];
  const sitemapUrls = [];
  const seenPages = /* @__PURE__ */ new Set();
  const seenSitemaps = /* @__PURE__ */ new Set();
  async function visitSitemap(sitemapUrl) {
    if (seenSitemaps.has(sitemapUrl.href)) return;
    seenSitemaps.add(sitemapUrl.href);
    sitemapUrls.push(sitemapUrl);
    let xml;
    try {
      xml = await getText(sitemapUrl);
    } catch (error) {
      throw new Error(`Failed to fetch sitemap ${sitemapUrl.href}.`, {
        cause: error
      });
    }
    let sitemap;
    try {
      sitemap = parseSitemapXml(xml);
    } catch (error) {
      throw new Error(`Failed to parse sitemap ${sitemapUrl.href}.`, {
        cause: error
      });
    }
    if (sitemap.type === "sitemapindex") {
      for (const location of sitemap.locations) {
        const nestedUrl = normalizeHttpUrl(location, sitemapUrl);
        if (nestedUrl) await visitSitemap(nestedUrl);
      }
      return;
    }
    for (const location of sitemap.locations) {
      const discoveredUrl = normalizeHttpUrl(location, sitemapUrl);
      const pageUrl = discoveredUrl ? options.pageOrigin ? rewriteUrlOrigin(discoveredUrl, options.pageOrigin) : discoveredUrl : void 0;
      if (!pageUrl || seenPages.has(pageUrl.href)) continue;
      seenPages.add(pageUrl.href);
      pages.push(pageUrl);
    }
  }
  for (const sitemapUrl of rootSitemaps) {
    await visitSitemap(sitemapUrl);
  }
  return { pages, sitemapUrls };
}
export {
  discoverSitemapPages,
  fetchText,
  parseRobotsSitemapUrls
};
