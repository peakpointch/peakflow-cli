import type { CheerioAPI } from "cheerio/slim";

export type SitemapOption = true | string;
export type SitemapHostMode = "preserve" | "target";

/** Current serialized website snapshot manifest version. */
export const websiteSnapshotManifestVersion = 1 as const;

/** Version type accepted by the website snapshot manifest. */
export type WebsiteSnapshotManifestVersion =
  typeof websiteSnapshotManifestVersion;

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

/** Origin and target information captured for one website test run. */
export interface WebsiteSnapshotSource {
  /** URL supplied as the test target. */
  targetUrl: string;
  /** Origin used as the target website origin. */
  origin: string;
  /** Whether the run selected one page or sitemap pages. */
  mode: TestPageSelection["mode"];
  /** Sitemap documents used to resolve the pages. */
  sitemapUrls: string[];
  /** Host policy used when resolving sitemap page URLs. */
  sitemapHost: SitemapHostMode;
}

/** Serializable page data stored in a website snapshot manifest. */
export interface WebsiteSnapshotPageManifest {
  /** URL requested from the page fetcher. */
  requestedUrl: string;
  /** Final URL after redirects. */
  finalUrl: string;
  /** Static HTML response body. */
  content: string;
}

/** A page that could not be captured for a website snapshot. */
export interface WebsiteSnapshotFetchError {
  /** URL that failed to fetch. */
  requestedUrl: string;
  /** Human-readable fetch failure message. */
  message: string;
}

/** Versioned serialized website snapshot data passed to later test stages. */
export interface WebsiteSnapshotManifest {
  /** Serialized manifest schema version. */
  version: WebsiteSnapshotManifestVersion;
  /** Time at which the capture started. */
  createdAt: string;
  /** Target and sitemap information for the capture. */
  source: WebsiteSnapshotSource;
  /** Successfully captured pages in resolved page order. */
  pages: WebsiteSnapshotPageManifest[];
  /** Page fetch failures in resolved page order. */
  errors: WebsiteSnapshotFetchError[];
}

/** Target and page selection passed to the snapshot capture service. */
export interface WebsiteSnapshotCaptureInput {
  /** Normalized test target. */
  target: UrlTestTarget;
  /** Resolved pages and sitemap documents for the target. */
  selection: TestPageSelection;
}

/** Receives one page-fetch failure after capture results are ordered. */
export type WebsiteSnapshotPageErrorHandler = (
  error: WebsiteSnapshotFetchError,
) => void;

/** Controls website snapshot capture and manifest creation. */
export interface WebsiteSnapshotCaptureOptions {
  /** Maximum number of pages fetched concurrently. */
  concurrency?: number;
  /** Page-fetch implementation override for tests or alternate sources. */
  fetchPage?: FetchPage;
  /** Existing directory to use as the manifest parent. */
  manifestDirectory?: string;
  /** User project directory whose `.peakflow` directory should be used. */
  projectDirectory?: string;
  /** Callback invoked once for each failed page. */
  onPageError?: WebsiteSnapshotPageErrorHandler;
}

/** Captured manifest data and its temporary filesystem lifecycle. */
export interface WebsiteSnapshotCapture {
  /** In-memory manifest written to disk. */
  manifest: WebsiteSnapshotManifest;
  /** Absolute path to the written manifest file. */
  manifestPath: string;
  /** Remove the per-run manifest directory. */
  cleanup: () => Promise<void>;
}

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
