import { load } from "cheerio/slim";
import { phoneLinksModule, phoneLinksModuleId } from "./modules/phoneLinks.js";
import { fetchPage } from "./snapshot.js";
const defaultConcurrency = 5;
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
import { fetchPage as fetchPage2 } from "./snapshot.js";
function createHtmlContext(page) {
  return {
    ...page,
    source: "html",
    document: load(page.content, {
      xml: {
        xmlMode: false,
        withStartIndices: true
      }
    })
  };
}
async function analyzePage(fetchedPage, modules) {
  const context = createHtmlContext(fetchedPage);
  const moduleCounts = /* @__PURE__ */ new Map();
  const findings = [];
  const errors = [];
  for (const module of modules) {
    try {
      const result = await module.run(context);
      moduleCounts.set(module.id, result.itemsChecked);
      findings.push(
        ...result.findings.map((finding) => ({
          ...finding,
          pageUrl: new URL(fetchedPage.finalUrl),
          testId: module.id
        }))
      );
    } catch (error) {
      errors.push({
        pageUrl: new URL(fetchedPage.finalUrl),
        testId: module.id,
        message: errorMessage(error)
      });
    }
  }
  return { moduleCounts, findings, errors };
}
async function runWorkerPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];
      if (item === void 0) continue;
      results[index] = await worker(item);
    }
  }
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
async function analyzePages(pages, options = {}) {
  const concurrency = options.concurrency ?? defaultConcurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError("Analysis concurrency must be a positive integer.");
  }
  const getPage = options.fetchPage ?? fetchPage;
  const modules = options.modules ?? [phoneLinksModule];
  const workerResults = await runWorkerPool(
    pages,
    concurrency,
    async (pageUrl) => {
      try {
        const fetchedPage = await getPage(pageUrl);
        const result = await analyzePage(fetchedPage, modules);
        return { status: "success", result };
      } catch (error) {
        return {
          status: "failure",
          error: {
            pageUrl: new URL(pageUrl),
            message: errorMessage(error)
          }
        };
      }
    }
  );
  const findings = [];
  const errors = [];
  let pagesChecked = 0;
  let phoneLinksChecked = 0;
  for (const workerResult of workerResults) {
    if (workerResult.status === "failure") {
      errors.push(workerResult.error);
      continue;
    }
    pagesChecked += 1;
    phoneLinksChecked += workerResult.result.moduleCounts.get(phoneLinksModuleId) ?? 0;
    findings.push(...workerResult.result.findings);
    errors.push(...workerResult.result.errors);
  }
  return {
    pagesRequested: pages.length,
    pagesChecked,
    phoneLinksChecked,
    findings,
    errors
  };
}
export {
  analyzePages,
  fetchPage2 as fetchPage
};
