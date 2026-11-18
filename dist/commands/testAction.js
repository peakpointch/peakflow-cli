import { InvalidArgumentError, Option } from "commander";
import { testLogger } from "../helpers/taskLogger.js";
import { errorToString } from "../helpers/utils.js";
import { runWebsiteJest } from "../testing/jest.js";
import { formatFetchErrorsTable } from "../testing/report.js";
import { captureSnapshot } from "../testing/snapshot.js";
import {
  normalizeTestUrl,
  resolveTestPages,
  resolveTestTarget
} from "../testing/targets.js";
const websiteTestingGuideUrl = "https://github.com/peakpointch/peakflow-cli/blob/main/docs/website-testing.md";
function setProcessExitCode(exitCode) {
  process.exitCode = exitCode;
}
function countLabel(count, singular, plural) {
  return count === 1 ? singular : plural;
}
function parseUrlOption(value) {
  try {
    return normalizeTestUrl(value).href;
  } catch {
    throw new InvalidArgumentError("must be an absolute HTTP(S) URL");
  }
}
function logSelectedMode(target, actionLogger) {
  if (target.sitemap === void 0) {
    actionLogger.info(
      `Selected single-page mode for ${actionLogger.var(target.url.href)}.`
    );
  } else if (target.sitemap === true) {
    actionLogger.info(
      `Selected automatic sitemap mode for ${actionLogger.var(target.origin.href)}.`
    );
  } else {
    actionLogger.info(
      `Selected explicit sitemap ${actionLogger.var(target.sitemap)}.`
    );
  }
  if (target.sitemapHost === "target") {
    actionLogger.info(
      `Sitemap page URLs will use target origin ${actionLogger.var(target.origin.href)}.`
    );
  }
}
function logSelection(selection, target, actionLogger) {
  if (selection.mode === "sitemap") {
    actionLogger.info(
      `Discovered ${actionLogger.num(selection.pages.length)} ${countLabel(selection.pages.length, "page", "pages")} from ${actionLogger.num(selection.sitemapUrls.length)} ${countLabel(selection.sitemapUrls.length, "sitemap", "sitemaps")}.`
    );
    const pagesFromOtherOrigins = selection.pages.filter(
      (page) => page.origin !== target.origin.origin
    ).length;
    if (pagesFromOtherOrigins > 0 && target.sitemapHost !== "target") {
      actionLogger.warn(
        `Sitemap contains ${actionLogger.num(pagesFromOtherOrigins)} ${countLabel(pagesFromOtherOrigins, "page", "pages")} from another origin; preserving those URLs. Use ${actionLogger.var("--sitemap-host target")} to rewrite them.`
      );
    }
  }
  actionLogger.info(
    `Testing ${actionLogger.num(selection.pages.length)} ${countLabel(selection.pages.length, "page", "pages")}.`
  );
}
function logFetchErrors(errors, pageOrder, actionLogger) {
  if (errors.length === 0) return;
  actionLogger.warn(
    `Encountered ${actionLogger.num(errors.length)} page fetch ${countLabel(errors.length, "error", "errors")}:`
  );
  actionLogger.continue(
    formatFetchErrorsTable(
      errors.map((error) => ({
        pageUrl: new URL(error.requestedUrl),
        message: error.message
      })),
      { pageOrder }
    )
  );
}
function logNoTestsFound(actionLogger) {
  actionLogger.info(
    `No website tests were found. Add tests to the Jest project named ${actionLogger.var("website")}. Learn more: ${websiteTestingGuideUrl}`
  );
}
function logFinalResult(result, pagesCaptured, fetchErrorCount, actionLogger) {
  const failed = result.exitCode !== 0 || fetchErrorCount > 0;
  if (failed) {
    actionLogger.error(
      `Website tests finished with Jest exit code ${actionLogger.num(result.exitCode)} and ${actionLogger.num(fetchErrorCount)} page fetch ${countLabel(fetchErrorCount, "error", "errors")}.`
    );
    return 1;
  }
  if (result.noTestsFound) {
    actionLogger.success(
      `Captured ${actionLogger.num(pagesCaptured)} ${countLabel(pagesCaptured, "page", "pages")}; no website tests were run.`
    );
    return 0;
  }
  actionLogger.success(
    `Website tests passed using ${actionLogger.num(pagesCaptured)} captured ${countLabel(pagesCaptured, "page", "pages")}.`
  );
  return 0;
}
async function testAction(options, dependencies = {}) {
  const actionLogger = dependencies.logger ?? testLogger;
  const getTarget = dependencies.resolveTarget ?? resolveTestTarget;
  const getPages = dependencies.resolvePages ?? resolveTestPages;
  const captureWebsite = dependencies.captureWebsiteSnapshot ?? captureSnapshot;
  const runJest = dependencies.runWebsiteJest ?? runWebsiteJest;
  const projectDirectory = dependencies.projectDirectory ?? process.cwd();
  const setExitCode = dependencies.setExitCode ?? setProcessExitCode;
  let capture;
  let exitCode = 1;
  try {
    const target = getTarget(options);
    logSelectedMode(target, actionLogger);
    const selection = await getPages(target);
    logSelection(selection, target, actionLogger);
    capture = await captureWebsite(
      { target, selection },
      {
        projectDirectory,
        onPageError: (error) => {
          actionLogger.warn(
            `Unable to fetch ${actionLogger.var(error.requestedUrl)}: ${error.message}`
          );
        }
      }
    );
    actionLogger.info(
      `Captured ${actionLogger.num(capture.manifest.pages.length)} of ${actionLogger.num(selection.pages.length)} ${countLabel(selection.pages.length, "page", "pages")}.`
    );
    const result = await runJest({
      manifestPath: capture.manifestPath,
      projectDirectory
    });
    if (result.noTestsFound) logNoTestsFound(actionLogger);
    logFetchErrors(capture.manifest.errors, selection.pages, actionLogger);
    exitCode = logFinalResult(
      result,
      capture.manifest.pages.length,
      capture.manifest.errors.length,
      actionLogger
    );
  } catch (error) {
    actionLogger.error(`Unable to run tests: ${errorToString(error)}.`);
  } finally {
    if (capture) {
      try {
        await capture.cleanup();
      } catch (error) {
        actionLogger.error(
          `Unable to clean up website snapshot: ${errorToString(error)}.`
        );
        exitCode = 1;
      }
    }
  }
  setExitCode(exitCode);
}
function addTestCommand(program, action = testAction) {
  return program.command("test").description("Test a published web page").requiredOption(
    "--url <url>",
    "Test an absolute HTTP(S) URL",
    parseUrlOption
  ).addOption(
    new Option(
      "--sitemap [url]",
      "Test pages from an automatically discovered or explicit sitemap"
    )
  ).addOption(
    new Option(
      "--sitemap-host <mode>",
      "Preserve sitemap hosts or rewrite page URLs to the target origin"
    ).choices(["preserve", "target"])
  ).action(action);
}
export {
  addTestCommand,
  testAction
};
