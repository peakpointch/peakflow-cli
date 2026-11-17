import chalk from "chalk";

import { logger } from "../helpers/taskLogger.js";
import { Table } from "../helpers/table.js";
import type { AuditFinding, AuditRunResult, AuditScanError } from "./types.js";

type FindingColumn =
  "page" | "test" | "rule" | "phoneLink" | "shownText" | "problem";

type ErrorColumn = "page" | "error";

export interface TestReportOptions {
  pageOrder: URL[];
}

function createPageIndex(pageOrder: URL[]): Map<string, number> {
  return new Map(pageOrder.map((page, index) => [page.href, index]));
}

function comparePageUrls(
  first: URL,
  second: URL,
  pageIndex: Map<string, number>,
): number {
  const unknownPageIndex = Number.MAX_SAFE_INTEGER;
  const firstIndex = pageIndex.get(first.href) ?? unknownPageIndex;
  const secondIndex = pageIndex.get(second.href) ?? unknownPageIndex;

  return firstIndex - secondIndex || first.href.localeCompare(second.href);
}

export function sortAuditFindings(
  findings: AuditFinding[],
  pageOrder: URL[],
): AuditFinding[] {
  const pageIndex = createPageIndex(pageOrder);

  return [...findings].sort(
    (first, second) =>
      comparePageUrls(first.pageUrl, second.pageUrl, pageIndex) ||
      first.testId.localeCompare(second.testId) ||
      first.location.line - second.location.line ||
      first.location.column - second.location.column ||
      first.ruleId.localeCompare(second.ruleId),
  );
}

export function sortAuditErrors(
  errors: AuditScanError[],
  pageOrder: URL[],
): AuditScanError[] {
  const pageIndex = createPageIndex(pageOrder);

  return [...errors].sort(
    (first, second) =>
      comparePageUrls(first.pageUrl, second.pageUrl, pageIndex) ||
      (first.testId ?? "").localeCompare(second.testId ?? "") ||
      first.message.localeCompare(second.message),
  );
}

function formatLocation(finding: AuditFinding): string {
  if (finding.location.line < 1 || finding.location.column < 1) return "";

  return `${finding.location.line}:${finding.location.column} `;
}

export function formatFindingsTable(
  findings: AuditFinding[],
  options: TestReportOptions,
): string {
  const rows = sortAuditFindings(findings, options.pageOrder);
  const table = new Table<AuditFinding, FindingColumn>(rows, [
    {
      id: "page",
      title: "Page",
      getValue: (finding) => finding.pageUrl.href,
      format: (cell) => chalk.dim(cell),
      formatTitle: (cell) => chalk.bold(cell),
    },
    {
      id: "test",
      title: "Test",
      getValue: (finding) => finding.testId,
      format: (cell) => logger.var(cell),
      formatTitle: (cell) => chalk.bold(cell),
    },
    {
      id: "rule",
      title: "Rule",
      getValue: (finding) => finding.ruleId,
      format: (cell) => logger.var(cell),
      formatTitle: (cell) => chalk.bold(cell),
    },
    {
      id: "phoneLink",
      title: "Phone link",
      getValue: (finding) => finding.evidence.href ?? "",
      format: (cell) => chalk.dim(cell),
      formatTitle: (cell) => chalk.bold(cell),
    },
    {
      id: "shownText",
      title: "Shown text",
      getValue: (finding) => finding.evidence.text ?? "",
      format: (cell) => chalk.dim(cell),
      formatTitle: (cell) => chalk.bold(cell),
    },
    {
      id: "problem",
      title: "Problem",
      getValue: (finding) => `${formatLocation(finding)}${finding.message}`,
      format: (cell) => chalk.dim(cell),
      formatTitle: (cell) => chalk.bold(cell),
    },
  ]);

  return table.toString({ titleRow: true, rowCount: true, prefix: "   " });
}

export function formatScanErrorsTable(
  errors: AuditScanError[],
  options: TestReportOptions,
): string {
  const rows = sortAuditErrors(errors, options.pageOrder);
  const table = new Table<AuditScanError, ErrorColumn>(rows, [
    {
      id: "page",
      title: "Page",
      getValue: (error) => error.pageUrl.href,
      format: (cell) => chalk.dim(cell),
      formatTitle: (cell) => chalk.bold(cell),
    },
    {
      id: "error",
      title: "Error",
      getValue: (error) =>
        error.testId ? `${error.testId}: ${error.message}` : error.message,
      format: (cell) => chalk.dim(cell),
      formatTitle: (cell) => chalk.bold(cell),
    },
  ]);

  return table.toString({ titleRow: true, rowCount: true, prefix: "   " });
}

export function hasTestFailures(result: AuditRunResult): boolean {
  return result.findings.length > 0 || result.errors.length > 0;
}
