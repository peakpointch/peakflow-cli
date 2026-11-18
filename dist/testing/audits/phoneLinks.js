import { test as jestTest } from "@jest/globals";
import {
  findPhoneNumbersInText,
  parsePhoneNumberFromString
} from "libphonenumber-js/max";
function decodeTelPayload(payload) {
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}
function parsePhoneHref(href) {
  const payload = href.slice(href.indexOf(":") + 1);
  const decodedPayload = decodeTelPayload(payload);
  const phone = parsePhoneNumberFromString(decodedPayload, "CH");
  const isValidSwiss = phone?.country === "CH" && phone.isValid() && phone.ext === void 0;
  const canonical = isValidSwiss ? phone.number : void 0;
  return {
    ...canonical ? { canonical } : {},
    isValidSwiss,
    isCanonical: canonical !== void 0 && payload === canonical
  };
}
function findPhoneNumbers(text) {
  return findPhoneNumbersInText(text, "CH").map(({ number }) => number).filter(
    (number) => number.country === "CH" && number.isValid() && !number.ext
  ).map((number) => number.number);
}
function getLocation(content, startIndex) {
  if (startIndex === null || startIndex < 0) {
    return { line: -1, column: -1 };
  }
  const lines = content.slice(0, startIndex).split(/\r?\n/u);
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1
  };
}
function inspectPhoneLinks(page) {
  const findings = [];
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
        evidence: { href, text, sourceCode }
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
          ...parsedHref.canonical ? { expected: `tel:${parsedHref.canonical}` } : {}
        }
      });
    }
    const displayedNumbers = findPhoneNumbers(text);
    if (displayedNumbers.length > 0 && parsedHref.canonical && !displayedNumbers.includes(parsedHref.canonical)) {
      findings.push({
        ruleId: "phone-text-mismatch",
        message: "Telephone href does not match the displayed phone number.",
        location,
        evidence: {
          href,
          text,
          sourceCode,
          expected: parsedHref.canonical
        }
      });
    }
  });
  return { itemsChecked, findings };
}
function formatFinding(finding) {
  const location = finding.location.line > 0 && finding.location.column > 0 ? ` at ${finding.location.line}:${finding.location.column}` : "";
  return `${finding.ruleId}${location}: ${finding.message} (${JSON.stringify(finding.evidence)})`;
}
function testPhoneLinksPage(page, options = {}) {
  const testName = options.testName ?? "phone links";
  jestTest(`${testName}: ${page.url.href}`, () => {
    const result = inspectPhoneLinks(page);
    if (result.findings.length === 0) return;
    const finalUrl = page.finalUrl.href === page.url.href ? "" : ` (final URL: ${page.finalUrl.href})`;
    const findings = result.findings.map(formatFinding).join("\n");
    throw new Error(
      `Phone link audit failed for ${page.url.href}${finalUrl}:
${findings}`
    );
  });
}
function testPhoneLinks(website, options = {}) {
  for (const page of website.pages) testPhoneLinksPage(page, options);
}
export {
  inspectPhoneLinks,
  testPhoneLinks,
  testPhoneLinksPage
};
