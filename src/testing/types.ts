export type SitemapOption = true | string;

export interface TestTargetOptions {
  url: string | URL;
  sitemap?: SitemapOption;
}

export interface UrlTestTarget {
  type: "url";
  url: URL;
  origin: URL;
  sitemap?: SitemapOption;
}

export interface SinglePageSelection {
  mode: "single";
  pages: URL[];
  sitemapUrls: [];
}

export interface SitemapPageSelection {
  mode: "sitemap";
  pages: URL[];
  sitemapUrls: URL[];
}

export type TestPageSelection = SinglePageSelection | SitemapPageSelection;

export type FetchText = (url: URL) => Promise<string>;
