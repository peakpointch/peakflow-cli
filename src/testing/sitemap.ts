import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";

import type { FetchText } from "./types.js";

export interface SitemapDiscoveryOptions {
  fetchText?: FetchText;
  sitemapUrl?: URL;
}

export interface SitemapDiscoveryResult {
  pages: URL[];
  sitemapUrls: URL[];
}

interface SitemapLocationEntry {
  loc?: unknown;
}

interface ParsedUrlSet {
  type: "urlset";
  locations: string[];
}

interface ParsedSitemapIndex {
  type: "sitemapindex";
  locations: string[];
}

type ParsedSitemap = ParsedUrlSet | ParsedSitemapIndex;

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  removeNSPrefix: true,
  trimValues: true,
});

function isHttpUrl(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

function normalizeHttpUrl(value: string, base?: URL): URL | undefined {
  try {
    const url = base ? new URL(value, base) : new URL(value);

    if (!isHttpUrl(url)) return undefined;

    url.hash = "";
    return url;
  } catch {
    return undefined;
  }
}

function getLoc(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry.trim() || undefined;
  if (!entry || typeof entry !== "object") return undefined;

  const loc = (entry as SitemapLocationEntry).loc;
  return typeof loc === "string" ? loc.trim() || undefined : undefined;
}

function getEntries(root: unknown, key: "url" | "sitemap"): unknown[] {
  if (!root || typeof root !== "object") return [];

  const entries = (root as Record<string, unknown>)[key];
  if (entries === undefined) return [];

  return Array.isArray(entries) ? entries : [entries];
}

function parseSitemapXml(xml: string): ParsedSitemap {
  try {
    SyntaxValidator.validate(xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid sitemap XML: ${message}`, { cause: error });
  }

  const parsed = xmlParser.parse(xml) as Record<string, unknown>;

  if (Object.hasOwn(parsed, "urlset")) {
    return {
      type: "urlset",
      locations: getEntries(parsed.urlset, "url")
        .map(getLoc)
        .filter((loc): loc is string => loc !== undefined),
    };
  }

  if (Object.hasOwn(parsed, "sitemapindex")) {
    return {
      type: "sitemapindex",
      locations: getEntries(parsed.sitemapindex, "sitemap")
        .map(getLoc)
        .filter((loc): loc is string => loc !== undefined),
    };
  }

  throw new Error("Invalid sitemap XML: expected <urlset> or <sitemapindex>.");
}

export function parseRobotsSitemapUrls(robots: string, origin: URL): URL[] {
  const urls: URL[] = [];
  const seen = new Set<string>();

  for (const line of robots.split(/\r?\n/u)) {
    const match = /^\s*sitemap\s*:\s*(.+?)\s*$/iu.exec(line);
    const url = match?.[1]
      ? normalizeHttpUrl(match[1], new URL("/", origin))
      : undefined;

    if (!url || seen.has(url.href)) continue;

    seen.add(url.href);
    urls.push(url);
  }

  return urls;
}

export async function fetchText(url: URL): Promise<string> {
  const response = await axios.get<string>(url.href, {
    responseType: "text",
  });

  return response.data;
}

export async function discoverSitemapPages(
  origin: URL,
  options: SitemapDiscoveryOptions = {},
): Promise<SitemapDiscoveryResult> {
  const getText = options.fetchText ?? fetchText;
  let rootSitemaps: URL[];

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

  const pages: URL[] = [];
  const sitemapUrls: URL[] = [];
  const seenPages = new Set<string>();
  const seenSitemaps = new Set<string>();

  async function visitSitemap(sitemapUrl: URL): Promise<void> {
    if (seenSitemaps.has(sitemapUrl.href)) return;

    seenSitemaps.add(sitemapUrl.href);
    sitemapUrls.push(sitemapUrl);

    let xml: string;

    try {
      xml = await getText(sitemapUrl);
    } catch (error) {
      throw new Error(`Failed to fetch sitemap ${sitemapUrl.href}.`, {
        cause: error,
      });
    }

    let sitemap;

    try {
      sitemap = parseSitemapXml(xml);
    } catch (error) {
      throw new Error(`Failed to parse sitemap ${sitemapUrl.href}.`, {
        cause: error,
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
      const pageUrl = normalizeHttpUrl(location, sitemapUrl);

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
