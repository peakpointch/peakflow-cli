import { load } from "cheerio/slim";
import { describe, expect, test } from "@jest/globals";

import { inspectPhoneLinks } from "../../src/testing/audits/phoneLinks.js";
import type { PageSnapshot } from "../../src/testing/types.js";

const pageUrl = new URL("https://example.com/contact");

function inspectHtml(html: string) {
  const page: PageSnapshot = {
    url: pageUrl,
    finalUrl: pageUrl,
    html,
    document: load(html, {
      xml: { xmlMode: false, withStartIndices: true },
    }),
  };

  return inspectPhoneLinks(page);
}

describe("phone-links audit", () => {
  test("accepts canonical Swiss links with matching formatted text", () => {
    const result = inspectHtml(
      '<a href="tel:+41446681800"><span>044</span> 668 18 00</a>',
    );

    expect(result.itemsChecked).toBe(1);
    expect(result.findings).toEqual([]);
  });

  test("reports valid non-E.164 href formatting with its canonical value", () => {
    const result = inspectHtml('<a href="tel:044 668 18 00">044 668 18 00</a>');

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      ruleId: "phone-href-not-e164",
      evidence: {
        href: "tel:044 668 18 00",
        text: "044 668 18 00",
        expected: "tel:+41446681800",
      },
    });
  });

  test.each([
    "tel:+41 44 668 18 00",
    "tel:+41-44-668-18-00",
    "tel:%2B41446681800",
  ])("reports noncanonical href %s", (href) => {
    const result = inspectHtml(`<a href="${href}">044 668 18 00</a>`);

    expect(result.findings.map((finding) => finding.ruleId)).toEqual([
      "phone-href-not-e164",
    ]);
  });

  test.each([
    "tel:not-a-number",
    "tel:+33142345678",
    "tel:+41446681800;ext=12",
  ])("reports invalid or non-Swiss href %s", (href) => {
    const result = inspectHtml(`<a href="${href}">Call us</a>`);

    expect(result.findings.map((finding) => finding.ruleId)).toEqual([
      "phone-href-invalid",
    ]);
  });

  test("reports displayed phone text that does not match the href", () => {
    const result = inspectHtml('<a href="tel:+41446681800">079 123 45 67</a>');

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      ruleId: "phone-text-mismatch",
      evidence: {
        href: "tel:+41446681800",
        text: "079 123 45 67",
        expected: "+41446681800",
      },
    });
  });

  test("accepts text containing multiple numbers when one matches", () => {
    const result = inspectHtml(
      '<a href="tel:+41446681800">044 668 18 00 / 079 123 45 67</a>',
    );

    expect(result.findings).toEqual([]);
  });

  test.each([
    '<a href="tel:+41446681800">Call us</a>',
    '<a href="tel:+41446681800"><svg aria-hidden="true"></svg></a>',
  ])("does not treat a label-only link as a text mismatch", (html) => {
    expect(inspectHtml(html).findings).toEqual([]);
  });

  test("counts and reports repeated links separately", () => {
    const result = inspectHtml(
      [
        '<a href="tel:0446681800">044 668 18 00</a>',
        '<a href="tel:0446681800">044 668 18 00</a>',
      ].join(""),
    );

    expect(result.itemsChecked).toBe(2);
    expect(result.findings).toHaveLength(2);
  });

  test("does not execute scripts that create telephone links", () => {
    const result = inspectHtml(
      [
        '<div id="target"></div>',
        "<script>",
        "document.querySelector('#target').innerHTML =",
        "'<a href=\"tel:not-a-number\">Bad</a>';",
        "</script>",
      ].join(""),
    );

    expect(result.itemsChecked).toBe(0);
    expect(result.findings).toEqual([]);
  });

  test("records the source location of each finding", () => {
    const result = inspectHtml(
      ["<main>", '  <a href="tel:not-a-number">Call</a>', "</main>"].join("\n"),
    );

    expect(result.findings[0]?.location).toEqual({ line: 2, column: 3 });
  });
});
