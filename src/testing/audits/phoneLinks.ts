import { test as jestTest } from "@jest/globals";
import {
  findPhoneNumbersInText,
  parsePhoneNumberFromString,
} from "libphonenumber-js/max";

import type { PageSnapshot, WebsiteSnapshot } from "../types.js";

export type PhoneLinkRuleId =
  "phone-href-invalid" | "phone-href-not-e164" | "phone-text-mismatch";

export interface PhoneLinkLocation {
  line: number;
  column: number;
}

export interface PhoneLinkEvidence {
  href?: string;
  text?: string;
  expected?: string;
  sourceCode?: string;
}

export interface PhoneLinkFinding {
  ruleId: PhoneLinkRuleId;
  message: string;
  location: PhoneLinkLocation;
  evidence: PhoneLinkEvidence;
}

export interface PhoneLinksResult {
  itemsChecked: number;
  findings: PhoneLinkFinding[];
}

/** Options for the built-in Swiss phone-link Jest audit. */
export interface TestPhoneLinksOptions {
  /** Prefix used for each generated Jest test name. */
  testName?: string;
}

function decodeTelPayload(payload: string): string {
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

function parsePhoneHref(href: string): {
  canonical?: string;
  isValidSwiss: boolean;
  isCanonical: boolean;
} {
  const payload = href.slice(href.indexOf(":") + 1);
  const decodedPayload = decodeTelPayload(payload);
  const phone = parsePhoneNumberFromString(decodedPayload, "CH");
  const isValidSwiss =
    phone?.country === "CH" && phone.isValid() && phone.ext === undefined;
  const canonical = isValidSwiss ? phone.number : undefined;

  return {
    ...(canonical ? { canonical } : {}),
    isValidSwiss,
    isCanonical: canonical !== undefined && payload === canonical,
  };
}

function findPhoneNumbers(text: string): string[] {
  return findPhoneNumbersInText(text, "CH")
    .map(({ number }) => number)
    .filter(
      (number) => number.country === "CH" && number.isValid() && !number.ext,
    )
    .map((number) => number.number);
}

function getLocation(
  content: string,
  startIndex: number | null,
): PhoneLinkLocation {
  if (startIndex === null || startIndex < 0) {
    return { line: -1, column: -1 };
  }

  const lines = content.slice(0, startIndex).split(/\r?\n/u);

  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

/** Inspect one page with the Swiss phone-link rules. */
export function inspectPhoneLinks(page: PageSnapshot): PhoneLinksResult {
  const findings: PhoneLinkFinding[] = [];
  let itemsChecked = 0;

  page.document("a[href]").each((_, element) => {
    const anchor = page.document(element);
    const rawHref = anchor.attr("href");
    const href = rawHref?.trim();

    if (!href || !/^tel:/iu.test(href)) return;

    itemsChecked += 1;

    const text = anchor.text().replace(/\s+/gu, " ").trim();
    const parsedHref = parsePhoneHref(href);
    const location = getLocation(page.html, element.startIndex);
    const sourceCode = page.document.html(element);

    if (!parsedHref.isValidSwiss) {
      findings.push({
        ruleId: "phone-href-invalid",
        message: "Telephone href does not contain a valid Swiss number.",
        location,
        evidence: { href, text, sourceCode },
      });
      return;
    }

    if (!parsedHref.isCanonical) {
      findings.push({
        ruleId: "phone-href-not-e164",
        message: "Telephone href must use canonical E.164 formatting.",
        location,
        evidence: {
          href,
          text,
          sourceCode,
          ...(parsedHref.canonical
            ? { expected: `tel:${parsedHref.canonical}` }
            : {}),
        },
      });
    }

    const displayedNumbers = findPhoneNumbers(text);

    if (
      displayedNumbers.length > 0 &&
      parsedHref.canonical &&
      !displayedNumbers.includes(parsedHref.canonical)
    ) {
      findings.push({
        ruleId: "phone-text-mismatch",
        message: "Telephone href does not match the displayed phone number.",
        location,
        evidence: {
          href,
          text,
          sourceCode,
          expected: parsedHref.canonical,
        },
      });
    }
  });

  return { itemsChecked, findings };
}

function formatFinding(finding: PhoneLinkFinding): string {
  const location =
    finding.location.line > 0 && finding.location.column > 0
      ? ` at ${finding.location.line}:${finding.location.column}`
      : "";

  return `${finding.ruleId}${location}: ${finding.message} (${JSON.stringify(finding.evidence)})`;
}

/** Register one opt-in Jest test for one captured page. */
export function testPhoneLinksPage(
  page: PageSnapshot,
  options: TestPhoneLinksOptions = {},
): void {
  const testName = options.testName ?? "phone links";

  jestTest(`${testName}: ${page.url.href}`, () => {
    const result = inspectPhoneLinks(page);

    if (result.findings.length === 0) return;

    const finalUrl =
      page.finalUrl.href === page.url.href
        ? ""
        : ` (final URL: ${page.finalUrl.href})`;
    const findings = result.findings.map(formatFinding).join("\n");

    throw new Error(
      `Phone link audit failed for ${page.url.href}${finalUrl}:\n${findings}`,
    );
  });
}

/** Register one opt-in Jest test for every page in a website snapshot. */
export function testPhoneLinks(
  website: WebsiteSnapshot,
  options: TestPhoneLinksOptions = {},
): void {
  for (const page of website.pages) testPhoneLinksPage(page, options);
}
