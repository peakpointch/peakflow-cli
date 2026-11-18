import { Command } from "commander";
import { describe, expect, jest, test } from "@jest/globals";

import {
  addTestCommand,
  testAction,
  type CaptureWebsiteSnapshot,
  type RunWebsiteJest,
  type TestActionDependencies,
  type TestActionHandler,
  type TestActionLogger,
  type TestActionOptions,
} from "../../src/commands/testAction.js";
import type {
  TestPageSelection,
  UrlTestTarget,
  WebsiteSnapshotCapture,
  WebsiteSnapshotFetchError,
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

function captureResult(
  pages: URL[],
  errors: WebsiteSnapshotFetchError[] = [],
): WebsiteSnapshotCapture {
  const firstPage = pages[0] ?? new URL("https://example.com/");

  return {
    manifestPath:
      "C:\\project\\.peakflow\\website-test-1\\website-snapshot.json",
    manifest: {
      version: "0.1.0",
      createdAt: "2026-11-18T10:00:00.000Z",
      source: {
        targetUrl: firstPage.href,
        origin: `${firstPage.origin}/`,
        mode: "single",
        sitemapUrls: [],
        sitemapHost: "preserve",
      },
      pages: pages
        .slice(0, pages.length - errors.length)
        .map((page, index) => ({
          requestedUrl: page.href,
          finalUrl: page.href,
          file: `pages/${String(index + 1).padStart(6, "0")}.html`,
        })),
      errors,
    },
    cleanup: jest.fn<() => Promise<void>>(async () => undefined),
  };
}

function dependencies(
  logger: MemoryLogger,
  selectionResult: TestPageSelection,
  capture: WebsiteSnapshotCapture,
): TestActionDependencies {
  return {
    logger,
    resolveTarget: target,
    resolvePages: async () => selectionResult,
    captureWebsiteSnapshot: async () => capture,
    runWebsiteJest: async () => ({ exitCode: 0, noTestsFound: false }),
    projectDirectory: "C:\\project",
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

  test("parses verbose output mode", async () => {
    await expect(
      parseOptions(["test", "--url", "https://example.com", "--verbose"]),
    ).resolves.toMatchObject({ verbose: true });
  });

  test("rejects a non-HTTP URL", async () => {
    await expect(
      parseOptions(["test", "--url", "example.com"]),
    ).rejects.toThrow("must be an absolute HTTP(S) URL");
  });
});

describe(testAction.name, () => {
  test("captures the snapshot before running Jest and exits successfully", async () => {
    const logger = new MemoryLogger();
    const page = new URL("https://example.com/contact");
    const capture = captureResult([page]);
    const calls: string[] = [];
    const captureWebsiteSnapshot = jest.fn<CaptureWebsiteSnapshot>(
      async (input) => {
        calls.push("capture");
        expect(input.selection.pages).toEqual([page]);
        return capture;
      },
    );
    const runWebsiteJest = jest.fn<RunWebsiteJest>(async (options) => {
      calls.push("jest");
      expect(options).toEqual({
        manifestPath: capture.manifestPath,
        projectDirectory: "C:\\project",
        verbose: false,
      });
      return { exitCode: 0, noTestsFound: false };
    });
    const setExitCode = jest.fn<(exitCode: number) => void>();

    await testAction(
      { url: page.href },
      {
        ...dependencies(logger, selection([page]), capture),
        captureWebsiteSnapshot,
        runWebsiteJest,
        setExitCode,
      },
    );

    expect(calls).toEqual(["capture", "jest"]);
    expect(capture.cleanup).toHaveBeenCalledTimes(1);
    expect(setExitCode).toHaveBeenCalledWith(0);
    expect(logger.entries.at(-1)).toEqual({
      method: "success",
      message: "Website tests passed using 1 captured page.",
    });
  });

  test("warns once per failed page and combines fetch failures with Jest status", async () => {
    const logger = new MemoryLogger();
    const pages = [
      new URL("https://example.com/one"),
      new URL("https://example.com/two"),
      new URL("https://example.com/three"),
    ];
    const errors = [
      { requestedUrl: pages[1]!.href, message: "Request failed" },
      { requestedUrl: pages[2]!.href, message: "Request timed out" },
    ];
    const capture = captureResult(pages, errors);
    const captureWebsiteSnapshot = jest.fn<CaptureWebsiteSnapshot>(
      async (_input, options) => {
        for (const error of errors) options?.onPageError?.(error);
        return capture;
      },
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
        captureWebsiteSnapshot,
        runWebsiteJest: async () => ({ exitCode: 0, noTestsFound: false }),
        projectDirectory: "C:\\project",
        setExitCode,
      },
    );

    const pageWarnings = logger.entries.filter(
      ({ method, message }) =>
        method === "warn" && message.startsWith("Unable to fetch"),
    );
    expect(pageWarnings).toHaveLength(2);
    expect(
      logger.entries.some(
        ({ method, message }) =>
          method === "continue" && message.includes("Request failed"),
      ),
    ).toBe(true);
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(logger.entries.at(-1)?.message).toBe(
      "Website tests finished with Jest exit code 0 and 2 page fetch errors.",
    );
  });

  test("returns a failing status when Jest fails", async () => {
    const logger = new MemoryLogger();
    const page = new URL("https://example.com/contact");
    const capture = captureResult([page]);
    const setExitCode = jest.fn<(exitCode: number) => void>();

    await testAction(
      { url: page.href },
      {
        ...dependencies(logger, selection([page]), capture),
        runWebsiteJest: async () => ({ exitCode: 1, noTestsFound: false }),
        setExitCode,
      },
    );

    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(logger.entries.at(-1)?.message).toBe(
      "Website tests finished with Jest exit code 1 and 0 page fetch errors.",
    );
  });

  test("reports no website tests without failing solely for that reason", async () => {
    const logger = new MemoryLogger();
    const page = new URL("https://example.com/contact");
    const capture = captureResult([page]);
    const setExitCode = jest.fn<(exitCode: number) => void>();

    await testAction(
      { url: page.href },
      {
        ...dependencies(logger, selection([page]), capture),
        runWebsiteJest: async () => ({ exitCode: 0, noTestsFound: true }),
        setExitCode,
      },
    );

    expect(setExitCode).toHaveBeenCalledWith(0);
    expect(
      logger.entries.some(
        ({ message }) =>
          message.includes("No website tests were found") &&
          message.includes("docs/website-testing.md"),
      ),
    ).toBe(true);
    expect(logger.entries.at(-1)?.message).toBe(
      "Captured 1 page; no website tests were run.",
    );
  });

  test("warns when preserved sitemap pages use another origin", async () => {
    const logger = new MemoryLogger();
    const targetPage = new URL("https://staging.example.com");
    const sitemapPage = new URL("https://www.example.com/page");
    const capture = captureResult([sitemapPage]);
    const setExitCode = jest.fn<(exitCode: number) => void>();

    await testAction(
      { url: targetPage.href, sitemap: true },
      {
        ...dependencies(logger, selection([sitemapPage]), capture),
        resolvePages: async () => ({
          mode: "sitemap",
          pages: [sitemapPage],
          sitemapUrls: [new URL("https://staging.example.com/sitemap.xml")],
        }),
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
    const captureWebsiteSnapshot = jest.fn<CaptureWebsiteSnapshot>();
    const runWebsiteJest = jest.fn<RunWebsiteJest>();
    const setExitCode = jest.fn<(exitCode: number) => void>();

    await testAction(
      { url: "https://example.com", sitemap: true },
      {
        logger,
        resolveTarget: target,
        resolvePages: async () => {
          throw new Error("Could not parse sitemap");
        },
        captureWebsiteSnapshot,
        runWebsiteJest,
        setExitCode,
      },
    );

    expect(captureWebsiteSnapshot).not.toHaveBeenCalled();
    expect(runWebsiteJest).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(logger.entries.at(-1)).toEqual({
      method: "error",
      message: "Unable to run tests: Could not parse sitemap.",
    });
  });

  test("cleans up the snapshot when Jest cannot start", async () => {
    const logger = new MemoryLogger();
    const page = new URL("https://example.com/contact");
    const capture = captureResult([page]);
    const setExitCode = jest.fn<(exitCode: number) => void>();

    await testAction(
      { url: page.href },
      {
        ...dependencies(logger, selection([page]), capture),
        runWebsiteJest: async () => {
          throw new Error("Jest is unavailable");
        },
        setExitCode,
      },
    );

    expect(capture.cleanup).toHaveBeenCalledTimes(1);
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(logger.entries.at(-1)?.message).toBe(
      "Unable to run tests: Jest is unavailable.",
    );
  });
});
