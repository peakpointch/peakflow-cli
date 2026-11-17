import { Command } from "commander";
import { describe, expect, jest, test } from "@jest/globals";

import {
  addTestCommand,
  testAction,
  type AnalyzeSelectedPages,
  type TestActionDependencies,
  type TestActionHandler,
  type TestActionLogger,
  type TestActionOptions,
} from "../../src/commands/testAction.js";
import type {
  AuditRunResult,
  TestPageSelection,
  UrlTestTarget,
} from "../../src/testing/types.js";

type LogMethod = "continue" | "error" | "info" | "success" | "warn";

interface LogEntry {
  method: LogMethod;
  message: string;
}

class MemoryLogger implements TestActionLogger {
  public readonly entries: LogEntry[] = [];

  private add(method: LogMethod, messages: unknown[]): void {
    this.entries.push({ method, message: messages.join(" ") });
  }

  public continue(...messages: unknown[]): void {
    this.add("continue", messages);
  }

  public error(...messages: unknown[]): void {
    this.add("error", messages);
  }

  public info(...messages: unknown[]): void {
    this.add("info", messages);
  }

  public success(...messages: unknown[]): void {
    this.add("success", messages);
  }

  public warn(...messages: unknown[]): void {
    this.add("warn", messages);
  }

  public num(value: number | string): string {
    return String(value);
  }

  public var(value: string): string {
    return value;
  }
}

function target(options: TestActionOptions): UrlTestTarget {
  const url = new URL(options.url);

  return {
    type: "url",
    url,
    origin: new URL(url.origin),
    ...(options.sitemap !== undefined ? { sitemap: options.sitemap } : {}),
  };
}

function selection(pages: URL[]): TestPageSelection {
  return { mode: "single", pages, sitemapUrls: [] };
}

function cleanResult(pages = 1): AuditRunResult {
  return {
    pagesRequested: pages,
    pagesChecked: pages,
    phoneLinksChecked: 1,
    findings: [],
    errors: [],
  };
}

function dependencies(
  logger: MemoryLogger,
  selectionResult: TestPageSelection,
  analysisResult: AuditRunResult,
): TestActionDependencies {
  return {
    logger,
    resolveTarget: target,
    resolvePages: async () => selectionResult,
    analyzeSelectedPages: async () => analysisResult,
  };
}

describe(addTestCommand.name, () => {
  async function parseOptions(args: string[]): Promise<TestActionOptions> {
    let parsed: TestActionOptions | undefined;
    const action: TestActionHandler = (options) => {
      parsed = options;
    };
    const program = new Command();

    program.exitOverride();
    program.configureOutput({ writeErr: () => undefined });
    addTestCommand(program, action);
    await program.parseAsync(["node", "peakflow", ...args]);

    if (!parsed) throw new Error("Test action was not called.");
    return parsed;
  }

  test("parses single-page mode", async () => {
    await expect(
      parseOptions([
        "test",
        "--url",
        "https://example.com/page?preview=true#section",
      ]),
    ).resolves.toEqual({
      url: "https://example.com/page?preview=true",
    });
  });

  test.each([
    [["--sitemap"], true],
    [["--sitemap", "/custom.xml"], "/custom.xml"],
    [
      ["--sitemap", "https://cdn.example.com/custom.xml"],
      "https://cdn.example.com/custom.xml",
    ],
  ])("parses sitemap option %#", async (sitemapArgs, expected) => {
    const options = await parseOptions([
      "test",
      "--url",
      "https://example.com",
      ...sitemapArgs,
    ]);

    expect(options.sitemap).toBe(expected);
  });

  test("parses target sitemap host mode", async () => {
    await expect(
      parseOptions([
        "test",
        "--url",
        "https://staging.example.com",
        "--sitemap",
        "--sitemap-host",
        "target",
      ]),
    ).resolves.toEqual({
      url: "https://staging.example.com/",
      sitemap: true,
      sitemapHost: "target",
    });
  });

  test("parses preserve sitemap host mode", async () => {
    await expect(
      parseOptions([
        "test",
        "--url",
        "https://example.com",
        "--sitemap",
        "--sitemap-host",
        "preserve",
      ]),
    ).resolves.toMatchObject({ sitemap: true, sitemapHost: "preserve" });
  });

  test("rejects a non-HTTP URL", async () => {
    await expect(
      parseOptions(["test", "--url", "example.com"]),
    ).rejects.toThrow("must be an absolute HTTP(S) URL");
  });
});

describe(testAction.name, () => {
  test("reports a clean single-page run and exits successfully", async () => {
    const logger = new MemoryLogger();
    const page = new URL("https://example.com/contact");
    const setExitCode = jest.fn<(exitCode: number) => void>();
    const deps = dependencies(logger, selection([page]), cleanResult());

    await testAction({ url: page.href }, { ...deps, setExitCode });

    expect(setExitCode).toHaveBeenCalledWith(0);
    expect(logger.entries).toEqual(
      expect.arrayContaining([
        {
          method: "success",
          message: "Tested 1 page and 1 phone link without problems.",
        },
      ]),
    );
  });

  test("prints all findings and scan errors before the failed summary", async () => {
    const logger = new MemoryLogger();
    const page = new URL("https://example.com/contact");
    const analysisResult: AuditRunResult = {
      pagesRequested: 1,
      pagesChecked: 1,
      phoneLinksChecked: 1,
      findings: [
        {
          pageUrl: page,
          testId: "phone-links",
          ruleId: "phone-href-not-e164",
          message: "Telephone href must use canonical E.164 formatting.",
          location: { line: 2, column: 3 },
          evidence: { href: "tel:0441234567", text: "044 123 45 67" },
        },
      ],
      errors: [{ pageUrl: page, message: "A later scan failed" }],
    };
    const setExitCode = jest.fn<(exitCode: number) => void>();
    const deps = dependencies(logger, selection([page]), analysisResult);

    await testAction({ url: page.href }, { ...deps, setExitCode });

    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(logger.entries.map(({ method }) => method).slice(-5)).toEqual([
      "warn",
      "continue",
      "warn",
      "continue",
      "error",
    ]);
    expect(logger.entries.at(-1)?.message).toBe(
      "Tested 1 page and 1 phone link: 1 finding, 1 scan error.",
    );
  });

  test("continues reporting after one of several pages fails", async () => {
    const logger = new MemoryLogger();
    const pages = [
      new URL("https://example.com/one"),
      new URL("https://example.com/two"),
    ];
    const analysisResult: AuditRunResult = {
      ...cleanResult(2),
      pagesChecked: 1,
      errors: [{ pageUrl: pages[1]!, message: "Request failed" }],
    };
    const analyzeSelectedPages = jest.fn<AnalyzeSelectedPages>(
      async () => analysisResult,
    );
    const setExitCode = jest.fn<(exitCode: number) => void>();

    await testAction(
      { url: pages[0]!.href, sitemap: true },
      {
        logger,
        resolveTarget: target,
        resolvePages: async () => ({
          mode: "sitemap",
          pages,
          sitemapUrls: [new URL("https://example.com/sitemap.xml")],
        }),
        analyzeSelectedPages,
        setExitCode,
      },
    );

    expect(analyzeSelectedPages).toHaveBeenCalledWith(pages);
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(
      logger.entries.some(({ message }) => message.includes("2 pages")),
    ).toBe(true);
  });

  test("warns when preserved sitemap pages use another origin", async () => {
    const logger = new MemoryLogger();
    const targetPage = new URL("https://staging.example.com");
    const sitemapPage = new URL("https://www.example.com/page");
    const setExitCode = jest.fn<(exitCode: number) => void>();

    await testAction(
      { url: targetPage.href, sitemap: true },
      {
        logger,
        resolveTarget: target,
        resolvePages: async () => ({
          mode: "sitemap",
          pages: [sitemapPage],
          sitemapUrls: [new URL("https://staging.example.com/sitemap.xml")],
        }),
        analyzeSelectedPages: async () => cleanResult(),
        setExitCode,
      },
    );

    expect(
      logger.entries.some(
        ({ method, message }) =>
          method === "warn" && message.includes("preserving those URLs"),
      ),
    ).toBe(true);
    expect(setExitCode).toHaveBeenCalledWith(0);
  });

  test("treats sitemap discovery failures as fatal", async () => {
    const logger = new MemoryLogger();
    const analyzeSelectedPages = jest.fn<AnalyzeSelectedPages>(async () =>
      cleanResult(),
    );
    const setExitCode = jest.fn<(exitCode: number) => void>();

    await testAction(
      { url: "https://example.com", sitemap: true },
      {
        logger,
        resolveTarget: target,
        resolvePages: async () => {
          throw new Error("Could not parse sitemap");
        },
        analyzeSelectedPages,
        setExitCode,
      },
    );

    expect(analyzeSelectedPages).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(logger.entries.at(-1)).toEqual({
      method: "error",
      message: "Unable to run tests: Could not parse sitemap.",
    });
  });
});
