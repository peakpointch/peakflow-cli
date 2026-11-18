import chalk from "chalk";
import { Table } from "../helpers/table.js";
function createPageIndex(pageOrder) {
  return new Map(pageOrder.map((page, index) => [page.href, index]));
}
function comparePageUrls(first, second, pageIndex) {
  const unknownPageIndex = Number.MAX_SAFE_INTEGER;
  const firstIndex = pageIndex.get(first.href) ?? unknownPageIndex;
  const secondIndex = pageIndex.get(second.href) ?? unknownPageIndex;
  return firstIndex - secondIndex || first.href.localeCompare(second.href);
}
function sortFetchErrors(errors, pageOrder) {
  const pageIndex = createPageIndex(pageOrder);
  return [...errors].sort(
    (first, second) => comparePageUrls(first.pageUrl, second.pageUrl, pageIndex) || first.message.localeCompare(second.message)
  );
}
function formatFetchErrorsTable(errors, options) {
  const rows = sortFetchErrors(errors, options.pageOrder);
  const table = new Table(rows, [
    {
      id: "page",
      title: "Page",
      getValue: (error) => error.pageUrl.href,
      format: (cell) => chalk.dim(cell),
      formatTitle: (cell) => chalk.bold(cell)
    },
    {
      id: "error",
      title: "Error",
      getValue: (error) => error.message,
      format: (cell) => chalk.dim(cell),
      formatTitle: (cell) => chalk.bold(cell)
    }
  ]);
  return table.toString({ titleRow: true, rowCount: true, prefix: "   " });
}
export {
  formatFetchErrorsTable,
  sortFetchErrors
};
