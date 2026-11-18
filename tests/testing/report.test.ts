import chalk, { type ChalkInstance } from "chalk";
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";

import {
  formatFetchErrorsTable,
  sortFetchErrors,
} from "../../src/testing/report.js";

type ChalkLevel = ChalkInstance["level"];

let originalChalkLevel: ChalkLevel;

beforeAll(() => {
  originalChalkLevel = chalk.level;
  chalk.level = 0;
});

afterAll(() => {
  chalk.level = originalChalkLevel;
});

describe(formatFetchErrorsTable.name, () => {
  test("formats page errors in stable page order", () => {
    const pageOrder = [
      new URL("https://example.com/first"),
      new URL("https://example.com/second"),
    ];
    const table = formatFetchErrorsTable(
      [
        { pageUrl: pageOrder[1]!, message: "Request timed out" },
        { pageUrl: pageOrder[0]!, message: "Request failed" },
      ],
      { pageOrder },
    );

    expect(table.indexOf("Request failed")).toBeLessThan(
      table.indexOf("Request timed out"),
    );
    expect(table).toContain("Page");
    expect(table).toContain("Error");
    expect(table).toContain("2 rows");
  });
});

describe(sortFetchErrors.name, () => {
  test("does not mutate the input errors", () => {
    const errors = [
      {
        pageUrl: new URL("https://example.com/second"),
        message: "Failed",
      },
      {
        pageUrl: new URL("https://example.com/first"),
        message: "Failed",
      },
    ];

    const sorted = sortFetchErrors(errors, [
      errors[1]!.pageUrl,
      errors[0]!.pageUrl,
    ]);

    expect(sorted[0]?.pageUrl.href).toBe("https://example.com/first");
    expect(errors[0]?.pageUrl.href).toBe("https://example.com/second");
  });
});
