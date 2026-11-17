import { load } from "cheerio/slim";

import { phoneLinksModule, phoneLinksModuleId } from "./modules/phoneLinks.js";
import type {
  AuditFinding,
  AuditModule,
  AuditRunResult,
  AuditScanError,
  FetchPage,
  FetchedPage,
  HtmlPageContext,
} from "./types.js";

export interface AnalyzePagesOptions {
  concurrency?: number;
  fetchPage?: FetchPage;
  modules?: AuditModule<HtmlPageContext>[];
}

interface PageAnalysisResult {
  moduleCounts: Map<string, number>;
  findings: AuditFinding[];
  errors: AuditScanError[];
}

interface WorkerSuccess {
  status: "success";
  result: PageAnalysisResult;
}

interface WorkerFailure {
  status: "failure";
  error: AuditScanError;
}

type WorkerResult = WorkerSuccess | WorkerFailure;

const defaultConcurrency = 5;
const pageFetchTimeoutMs = 15_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchPage(url: URL): Promise<FetchedPage> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(pageFetchTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error(
      `Expected HTML but received ${contentType || "no content type"}.`,
    );
  }

  return {
    requestedUrl: new URL(url),
    finalUrl: new URL(response.url || url),
    content: await response.text(),
  };
}

function createHtmlContext(page: FetchedPage): HtmlPageContext {
  return {
    ...page,
    source: "html",
    document: load(page.content, {
      xml: {
        xmlMode: false,
        withStartIndices: true,
      },
    }),
  };
}

async function analyzePage(
  fetchedPage: FetchedPage,
  modules: AuditModule<HtmlPageContext>[],
): Promise<PageAnalysisResult> {
  const context = createHtmlContext(fetchedPage);
  const moduleCounts = new Map<string, number>();
  const findings: AuditFinding[] = [];
  const errors: AuditScanError[] = [];

  for (const module of modules) {
    try {
      const result = await module.run(context);

      moduleCounts.set(module.id, result.itemsChecked);
      findings.push(
        ...result.findings.map((finding) => ({
          ...finding,
          pageUrl: new URL(fetchedPage.finalUrl),
          testId: module.id,
        })),
      );
    } catch (error) {
      errors.push({
        pageUrl: new URL(fetchedPage.finalUrl),
        testId: module.id,
        message: errorMessage(error),
      });
    }
  }

  return { moduleCounts, findings, errors };
}

async function runWorkerPool<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  worker: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];

      if (item === undefined) continue;

      results[index] = await worker(item);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return results;
}

export async function analyzePages(
  pages: URL[],
  options: AnalyzePagesOptions = {},
): Promise<AuditRunResult> {
  const concurrency = options.concurrency ?? defaultConcurrency;

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError("Analysis concurrency must be a positive integer.");
  }

  const getPage = options.fetchPage ?? fetchPage;
  const modules = options.modules ?? [phoneLinksModule];
  const workerResults = await runWorkerPool(
    pages,
    concurrency,
    async (pageUrl): Promise<WorkerResult> => {
      try {
        const fetchedPage = await getPage(pageUrl);
        const result = await analyzePage(fetchedPage, modules);

        return { status: "success", result };
      } catch (error) {
        return {
          status: "failure",
          error: {
            pageUrl: new URL(pageUrl),
            message: errorMessage(error),
          },
        };
      }
    },
  );

  const findings: AuditFinding[] = [];
  const errors: AuditScanError[] = [];
  let pagesChecked = 0;
  let phoneLinksChecked = 0;

  for (const workerResult of workerResults) {
    if (workerResult.status === "failure") {
      errors.push(workerResult.error);
      continue;
    }

    pagesChecked += 1;
    phoneLinksChecked +=
      workerResult.result.moduleCounts.get(phoneLinksModuleId) ?? 0;
    findings.push(...workerResult.result.findings);
    errors.push(...workerResult.result.errors);
  }

  return {
    pagesRequested: pages.length,
    pagesChecked,
    phoneLinksChecked,
    findings,
    errors,
  };
}
