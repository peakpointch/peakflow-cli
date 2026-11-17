import type { CheerioAPI } from "cheerio/slim";

export type SitemapOption = true | string;
export type SitemapHostMode = "preserve" | "target";

export interface TestTargetOptions {
  url: string | URL;
  sitemap?: SitemapOption;
  sitemapHost?: SitemapHostMode;
}

export interface UrlTestTarget {
  type: "url";
  url: URL;
  origin: URL;
  sitemap?: SitemapOption;
  sitemapHost?: SitemapHostMode;
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

export type PhoneLinkRuleId =
  "phone-href-invalid" | "phone-href-not-e164" | "phone-text-mismatch";

export interface AuditLocation {
  line: number;
  column: number;
}

export interface AuditEvidence {
  href?: string;
  text?: string;
  expected?: string;
  sourceCode?: string;
}

export interface AuditModuleFinding {
  ruleId: string;
  message: string;
  location: AuditLocation;
  evidence: AuditEvidence;
}

export interface AuditFinding extends AuditModuleFinding {
  pageUrl: URL;
  testId: string;
}

export interface AuditModuleResult {
  itemsChecked: number;
  findings: AuditModuleFinding[];
}

export interface FetchedPage {
  requestedUrl: URL;
  finalUrl: URL;
  content: string;
}

export interface HtmlPageContext extends FetchedPage {
  source: "html";
  document: CheerioAPI;
}

export type AuditPageContext = HtmlPageContext;

export interface AuditModule<
  TContext extends AuditPageContext = AuditPageContext,
> {
  id: string;
  source: TContext["source"];
  run(context: TContext): Promise<AuditModuleResult> | AuditModuleResult;
}

export interface AuditScanError {
  pageUrl: URL;
  message: string;
  testId?: string;
}

export interface AuditRunResult {
  pagesRequested: number;
  pagesChecked: number;
  phoneLinksChecked: number;
  findings: AuditFinding[];
  errors: AuditScanError[];
}

export type FetchPage = (url: URL) => Promise<FetchedPage>;
