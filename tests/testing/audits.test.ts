import { load } from "cheerio/slim";
import { describe, expect, test } from "@jest/globals";

import {
  testPhoneLinks,
  testPhoneLinksPage,
} from "../../src/testing/audits/index.js";
import type { WebsiteSnapshot } from "../../src/testing/types.js";

const pageUrl = new URL("https://example.com/contact");
const html = '<a href="tel:+41446681800">044 668 18 00</a>';

const website: WebsiteSnapshot = {
  createdAt: "2026-11-18T10:00:00.000Z",
  source: {
    targetUrl: pageUrl.href,
    origin: pageUrl.origin + "/",
    mode: "single",
    sitemapUrls: [],
    sitemapHost: "preserve",
  },
  pages: [
    {
      url: pageUrl,
      finalUrl: pageUrl,
      html,
      document: load(html, {
        xml: { xmlMode: false, withStartIndices: true },
      }),
    },
  ],
  errors: [],
};

describe("testPhoneLinks", () => {
  testPhoneLinks(website, { testName: "Swiss phone links" });

  testPhoneLinksPage(website.pages[0]!, { testName: "Swiss phone link" });

  test("ordinary user-authored tests can run beside the audit", () => {
    expect(website.pages).toHaveLength(1);
    expect(website.pages[0]?.document("a").text()).toBe("044 668 18 00");
  });
});
