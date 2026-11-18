import chalk from "chalk";

import { Table } from "../helpers/table.js";

export interface FetchError {
  pageUrl: URL;
  message: string;
}

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

export function sortFetchErrors(
  errors: FetchError[],
  pageOrder: URL[],
): FetchError[] {
  const pageIndex = createPageIndex(pageOrder);

  return [...errors].sort(
    (first, second) =>
      comparePageUrls(first.pageUrl, second.pageUrl, pageIndex) ||
      first.message.localeCompare(second.message),
  );
}

/** Format page-fetch failures in deterministic page order. */
export function formatFetchErrorsTable(
  errors: FetchError[],
  options: TestReportOptions,
): string {
  const rows = sortFetchErrors(errors, options.pageOrder);
  const table = new Table<FetchError, "page" | "error">(rows, [
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
      getValue: (error) => error.message,
      format: (cell) => chalk.dim(cell),
      formatTitle: (cell) => chalk.bold(cell),
    },
  ]);

  return table.toString({ titleRow: true, rowCount: true, prefix: "   " });
}
