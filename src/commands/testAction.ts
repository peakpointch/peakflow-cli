import { Command, InvalidArgumentError, Option } from "commander";

import { testLogger } from "../helpers/taskLogger.js";
import { errorToString } from "../helpers/utils.js";
import { analyzePages } from "../testing/analyzer.js";
import {
  formatFindingsTable,
  formatScanErrorsTable,
  hasTestFailures,
} from "../testing/report.js";
import {
  normalizeTestUrl,
  resolveTestPages,
  resolveTestTarget,
} from "../testing/targets.js";
import type {
  AuditRunResult,
  SitemapOption,
  SitemapHostMode,
  TestPageSelection,
  UrlTestTarget,
} from "../testing/types.js";
import type { TaskLogger } from "../helpers/taskLogger.js";

export interface TestActionOptions {
  url: string;
  sitemap?: SitemapOption;
  sitemapHost?: SitemapHostMode;
}

export type TestActionHandler = (
  options: TestActionOptions,
) => Promise<void> | void;

export type TestActionLogger = Pick<
  TaskLogger,
  "continue" | "error" | "info" | "num" | "success" | "var" | "warn"
>;

export type ResolveTarget = (options: TestActionOptions) => UrlTestTarget;
export type ResolvePages = (
  target: UrlTestTarget,
) => Promise<TestPageSelection>;
export type AnalyzeSelectedPages = (pages: URL[]) => Promise<AuditRunResult>;
export type SetExitCode = (exitCode: number) => void;

export interface TestActionDependencies {
  logger?: TestActionLogger;
  resolveTarget?: ResolveTarget;
  resolvePages?: ResolvePages;
  analyzeSelectedPages?: AnalyzeSelectedPages;
  setExitCode?: SetExitCode;
}

function setProcessExitCode(exitCode: number): void {
  process.exitCode = exitCode;
}

function countLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function parseUrlOption(value: string): string {
  try {
    return normalizeTestUrl(value).href;
  } catch {
    throw new InvalidArgumentError("must be an absolute HTTP(S) URL");
  }
}

function logSelectedMode(
  target: UrlTestTarget,
  actionLogger: TestActionLogger,
): void {
  if (target.sitemap === undefined) {
    actionLogger.info(
      `Selected single-page mode for ${actionLogger.var(target.url.href)}.`,
    );
  } else if (target.sitemap === true) {
    actionLogger.info(
      `Selected automatic sitemap mode for ${actionLogger.var(target.origin.href)}.`,
    );
  } else {
    actionLogger.info(
      `Selected explicit sitemap ${actionLogger.var(target.sitemap)}.`,
    );
  }

  if (target.sitemapHost === "target") {
    actionLogger.info(
      `Sitemap page URLs will use target origin ${actionLogger.var(target.origin.href)}.`,
    );
  }
}

function logSelection(
  selection: TestPageSelection,
  target: UrlTestTarget,
  actionLogger: TestActionLogger,
): void {
  if (selection.mode === "sitemap") {
    actionLogger.info(
      `Discovered ${actionLogger.num(selection.pages.length)} ${countLabel(selection.pages.length, "page", "pages")} from ${actionLogger.num(selection.sitemapUrls.length)} ${countLabel(selection.sitemapUrls.length, "sitemap", "sitemaps")}.`,
    );

    const pagesFromOtherOrigins = selection.pages.filter(
      (page) => page.origin !== target.origin.origin,
    ).length;

    if (pagesFromOtherOrigins > 0 && target.sitemapHost !== "target") {
      actionLogger.warn(
        `Sitemap contains ${actionLogger.num(pagesFromOtherOrigins)} ${countLabel(pagesFromOtherOrigins, "page", "pages")} from another origin; preserving those URLs. Use ${actionLogger.var("--sitemap-host target")} to rewrite them.`,
      );
    }
  }

  actionLogger.info(
    `Testing ${actionLogger.num(selection.pages.length)} ${countLabel(selection.pages.length, "page", "pages")}.`,
  );
}

function logResultTables(
  result: AuditRunResult,
  pageOrder: URL[],
  actionLogger: TestActionLogger,
): void {
  if (result.findings.length > 0) {
    actionLogger.warn(
      `Found ${actionLogger.num(result.findings.length)} ${countLabel(result.findings.length, "problem", "problems")}:`,
    );
    actionLogger.continue(formatFindingsTable(result.findings, { pageOrder }));
  }

  if (result.errors.length > 0) {
    actionLogger.warn(
      `Encountered ${actionLogger.num(result.errors.length)} scan ${countLabel(result.errors.length, "error", "errors")}:`,
    );
    actionLogger.continue(formatScanErrorsTable(result.errors, { pageOrder }));
  }
}

function logCleanResult(
  result: AuditRunResult,
  actionLogger: TestActionLogger,
): void {
  actionLogger.success(
    `Tested ${actionLogger.num(result.pagesChecked)} ${countLabel(result.pagesChecked, "page", "pages")} and ${actionLogger.num(result.phoneLinksChecked)} phone ${countLabel(result.phoneLinksChecked, "link", "links")} without problems.`,
  );
}

function logFailedResult(
  result: AuditRunResult,
  actionLogger: TestActionLogger,
): void {
  actionLogger.error(
    `Tested ${actionLogger.num(result.pagesRequested)} ${countLabel(result.pagesRequested, "page", "pages")} and ${actionLogger.num(result.phoneLinksChecked)} phone ${countLabel(result.phoneLinksChecked, "link", "links")}: ${actionLogger.num(result.findings.length)} ${countLabel(result.findings.length, "finding", "findings")}, ${actionLogger.num(result.errors.length)} scan ${countLabel(result.errors.length, "error", "errors")}.`,
  );
}

export async function testAction(
  options: TestActionOptions,
  dependencies: TestActionDependencies = {},
): Promise<void> {
  const actionLogger = dependencies.logger ?? testLogger;
  const getTarget = dependencies.resolveTarget ?? resolveTestTarget;
  const getPages = dependencies.resolvePages ?? resolveTestPages;
  const runAnalysis = dependencies.analyzeSelectedPages ?? analyzePages;
  const setExitCode = dependencies.setExitCode ?? setProcessExitCode;

  try {
    const target = getTarget(options);
    logSelectedMode(target, actionLogger);

    const selection = await getPages(target);
    logSelection(selection, target, actionLogger);

    const result = await runAnalysis(selection.pages);
    logResultTables(result, selection.pages, actionLogger);

    if (hasTestFailures(result)) {
      logFailedResult(result, actionLogger);
      setExitCode(1);
    } else {
      logCleanResult(result, actionLogger);
      setExitCode(0);
    }
  } catch (error) {
    actionLogger.error(`Unable to run tests: ${errorToString(error)}.`);
    setExitCode(1);
  }
}

export function addTestCommand(
  program: Command,
  action: TestActionHandler = testAction,
): Command {
  return program
    .command("test")
    .description("Test a published web page")
    .requiredOption(
      "--url <url>",
      "Test an absolute HTTP(S) URL",
      parseUrlOption,
    )
    .addOption(
      new Option(
        "--sitemap [url]",
        "Test pages from an automatically discovered or explicit sitemap",
      ),
    )
    .addOption(
      new Option(
        "--sitemap-host <mode>",
        "Preserve sitemap hosts or rewrite page URLs to the target origin",
      ).choices(["preserve", "target"]),
    )
    .action(action);
}
