import chalk, { type ChalkInstance } from "chalk";
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";

import {
  formatFindingsTable,
  formatScanErrorsTable,
  hasTestFailures,
  sortAuditFindings,
} from "../../src/testing/report.js";
import type {
  AuditFinding,
  AuditRunResult,
  AuditScanError,
} from "../../src/testing/types.js";

type ChalkLevel = ChalkInstance["level"];

let originalChalkLevel: ChalkLevel;

beforeAll(() => {
  originalChalkLevel = chalk.level;
  chalk.level = 0;
});

afterAll(() => {
  chalk.level = originalChalkLevel;
});

function finding(pageUrl: string, ruleId: string, line: number): AuditFinding {
  return {
    pageUrl: new URL(pageUrl),
    testId: "phone-links",
    ruleId,
    message: `Problem ${ruleId}`,
    location: { line, column: 2 },
    evidence: {
      href: "tel:0441234567",
      text: "044 123 45 67",
    },
  };
}

function result(
  findings: AuditFinding[] = [],
  errors: AuditScanError[] = [],
): AuditRunResult {
  return {
    pagesRequested: 1,
    pagesChecked: 1,
    phoneLinksChecked: 1,
    findings,
    errors,
  };
}

describe(formatFindingsTable.name, () => {
  const pageOrder = [
    new URL("https://example.com/first"),
    new URL("https://example.com/second"),
  ];

  test("sorts rows by page, source location, and rule", () => {
    const findings = [
      finding("https://example.com/second", "phone-text-mismatch", 1),
      finding("https://example.com/first", "phone-href-not-e164", 4),
      finding("https://example.com/first", "phone-href-invalid", 2),
    ];

    const sorted = sortAuditFindings(findings, pageOrder);

    expect(sorted.map(({ ruleId }) => ruleId)).toEqual([
      "phone-href-invalid",
      "phone-href-not-e164",
      "phone-text-mismatch",
    ]);
  });

  test("formats all finding columns with indentation and a row count", () => {
    const table = formatFindingsTable(
      [finding("https://example.com/first", "phone-href-not-e164", 4)],
      { pageOrder },
    );

    expect(table).toContain("Page");
    expect(table).toContain("│ Test");
    expect(table).toContain("│ Rule");
    expect(table).toContain("│ Phone link");
    expect(table).toContain("Shown text");
    expect(table).toContain("Problem");
    expect(table).toContain("4:2 Problem phone-href-not-e164");
    expect(table.split("\n").every((line) => line.startsWith("   "))).toBe(
      true,
    );
    expect(table).toContain("1 row");
  });
});

describe(formatScanErrorsTable.name, () => {
  test("formats page and module errors in stable order", () => {
    const pageOrder = [
      new URL("https://example.com/first"),
      new URL("https://example.com/second"),
    ];
    const table = formatScanErrorsTable(
      [
        {
          pageUrl: pageOrder[1]!,
          message: "Fetch failed",
        },
        {
          pageUrl: pageOrder[0]!,
          testId: "phone-links",
          message: "Module failed",
        },
      ],
      { pageOrder },
    );

    expect(table).toContain("Page                       │ Error");
    expect(table.indexOf("phone-links: Module failed")).toBeLessThan(
      table.indexOf("Fetch failed"),
    );
    expect(table).toContain("2 rows");
  });
});

describe(hasTestFailures.name, () => {
  test("only reports a clean result when findings and errors are empty", () => {
    expect(hasTestFailures(result())).toBe(false);
    expect(
      hasTestFailures(
        result([finding("https://example.com", "phone-href-invalid", 1)]),
      ),
    ).toBe(true);
    expect(
      hasTestFailures(
        result(
          [],
          [{ pageUrl: new URL("https://example.com"), message: "Failed" }],
        ),
      ),
    ).toBe(true);
  });
});
