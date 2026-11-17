import { describe, expect, jest, test } from "@jest/globals";

import { analyzePages } from "../../src/testing/analyzer.js";
import type { FetchPage, FetchedPage } from "../../src/testing/types.js";

function successfulPage(url: URL, content = "<html></html>"): FetchedPage {
  return {
    requestedUrl: new URL(url),
    finalUrl: new URL(url),
    content,
  };
}

describe(analyzePages.name, () => {
  test("continues after page failures and preserves input ordering", async () => {
    const pages = [
      new URL("https://example.com/one"),
      new URL("https://example.com/broken"),
      new URL("https://example.com/three"),
    ];
    const fetchPage = jest.fn<FetchPage>(async (url) => {
      if (url.pathname === "/broken") throw new Error("Connection failed");

      return successfulPage(
        url,
        `<a href="tel:0446681800">${url.pathname}</a>`,
      );
    });

    const result = await analyzePages(pages, {
      concurrency: 3,
      fetchPage,
    });

    expect(result).toMatchObject({
      pagesRequested: 3,
      pagesChecked: 2,
      phoneLinksChecked: 2,
    });
    expect(result.findings.map((finding) => finding.pageUrl.pathname)).toEqual([
      "/one",
      "/three",
    ]);
    expect(result.errors).toEqual([
      {
        pageUrl: new URL("https://example.com/broken"),
        message: "Connection failed",
      },
    ]);
  });

  test("limits concurrent fetch-and-analysis workers", async () => {
    const pages = Array.from(
      { length: 6 },
      (_, index) => new URL(`https://example.com/${index}`),
    );
    let active = 0;
    let maximumActive = 0;
    const fetchPage: FetchPage = async (url) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return successfulPage(url);
    };

    const result = await analyzePages(pages, {
      concurrency: 2,
      fetchPage,
    });

    expect(result.pagesChecked).toBe(6);
    expect(maximumActive).toBe(2);
  });

  test("uses the final response URL in findings", async () => {
    const requestedUrl = new URL("https://example.com/contact");
    const finalUrl = new URL("https://www.example.com/contact");
    const fetchPage: FetchPage = async (url) => ({
      requestedUrl: new URL(url),
      finalUrl,
      content: '<a href="tel:not-a-number">Call</a>',
    });

    const result = await analyzePages([requestedUrl], { fetchPage });

    expect(result.findings[0]?.pageUrl).toEqual(finalUrl);
  });

  test("continues other modules when one module fails", async () => {
    const firstModule = {
      id: "failing",
      source: "html" as const,
      run: () => {
        throw new Error("Module failed");
      },
    };
    const secondModule = {
      id: "working",
      source: "html" as const,
      run: () => ({ itemsChecked: 1, findings: [] }),
    };

    const result = await analyzePages([new URL("https://example.com")], {
      fetchPage: async (url) => successfulPage(url),
      modules: [firstModule, secondModule],
    });

    expect(result.pagesChecked).toBe(1);
    expect(result.errors).toEqual([
      {
        pageUrl: new URL("https://example.com/"),
        testId: "failing",
        message: "Module failed",
      },
    ]);
  });

  test.each([0, -1, 1.5])("rejects concurrency %s", async (concurrency) => {
    await expect(
      analyzePages([new URL("https://example.com")], { concurrency }),
    ).rejects.toThrow("Analysis concurrency must be a positive integer.");
  });
});
