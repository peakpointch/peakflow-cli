import {
  findPhoneNumbersInText,
  parsePhoneNumberFromString,
} from "libphonenumber-js/max";

import type {
  AuditEvidence,
  AuditLocation,
  AuditModule,
  AuditModuleFinding,
  AuditModuleResult,
  HtmlPageContext,
  PhoneLinkRuleId,
} from "../types.js";

export const phoneLinksModuleId = "phone-links";

interface ParsedPhoneHref {
  canonical?: string;
  isValidSwiss: boolean;
  isCanonical: boolean;
}

interface PhoneFindingOptions {
  ruleId: PhoneLinkRuleId;
  message: string;
  location: AuditLocation;
  evidence: AuditEvidence;
}

function decodePhoneHrefPayload(payload: string): string {
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

function parsePhoneHref(href: string): ParsedPhoneHref {
  const payload = href.slice(href.indexOf(":") + 1);
  const decodedPayload = decodePhoneHrefPayload(payload);
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

function getDisplayedPhoneNumbers(text: string): string[] {
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
): AuditLocation {
  if (startIndex === null || startIndex < 0) {
    return { line: -1, column: -1 };
  }

  const sourceBeforeElement = content.slice(0, startIndex);
  const lines = sourceBeforeElement.split(/\r?\n/u);

  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function createFinding(options: PhoneFindingOptions): AuditModuleFinding {
  return {
    ruleId: options.ruleId,
    message: options.message,
    location: options.location,
    evidence: options.evidence,
  };
}

export class PhoneLinksModule implements AuditModule<HtmlPageContext> {
  public readonly id = phoneLinksModuleId;
  public readonly source = "html" as const;

  public run(context: HtmlPageContext): AuditModuleResult {
    const findings: AuditModuleFinding[] = [];
    let itemsChecked = 0;

    context.document("a[href]").each((_, element) => {
      const anchor = context.document(element);
      const rawHref = anchor.attr("href");
      const href = rawHref?.trim();

      if (!href || !/^tel:/iu.test(href)) return;

      itemsChecked += 1;

      const text = anchor.text().replace(/\s+/gu, " ").trim();
      const parsedHref = parsePhoneHref(href);
      const location = getLocation(context.content, element.startIndex);
      const sourceCode = context.document.html(element);

      if (!parsedHref.isValidSwiss) {
        findings.push(
          createFinding({
            ruleId: "phone-href-invalid",
            message: "Telephone href does not contain a valid Swiss number.",
            location,
            evidence: { href, text, sourceCode },
          }),
        );
        return;
      }

      if (!parsedHref.isCanonical) {
        findings.push(
          createFinding({
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
          }),
        );
      }

      const displayedNumbers = getDisplayedPhoneNumbers(text);

      if (
        displayedNumbers.length > 0 &&
        parsedHref.canonical &&
        !displayedNumbers.includes(parsedHref.canonical)
      ) {
        findings.push(
          createFinding({
            ruleId: "phone-text-mismatch",
            message:
              "Telephone href does not match the displayed phone number.",
            location,
            evidence: {
              href,
              text,
              sourceCode,
              expected: parsedHref.canonical,
            },
          }),
        );
      }
    });

    return { itemsChecked, findings };
  }
}

export const phoneLinksModule = new PhoneLinksModule();
