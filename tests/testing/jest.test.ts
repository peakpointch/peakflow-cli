import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";

import { describe, expect, jest, test } from "@jest/globals";

import {
  resolveProjectJest,
  runWebsiteJest,
  type RunJestProcess,
} from "../../src/testing/jest.js";

describe(resolveProjectJest.name, () => {
  test("resolves Jest through the user project", () => {
    expect(resolveProjectJest(process.cwd())).toMatch(
      /node_modules[\\/].*jest[\\/]bin[\\/]jest\.js$/,
    );
  });

  test("fails clearly when the user project does not provide Jest", async () => {
    const projectDirectory = await mkdtemp(
      path.join(os.tmpdir(), "peakflow-no-jest-"),
    );

    try {
      expect(() => resolveProjectJest(projectDirectory)).toThrow(
        "Install Jest in the project",
      );
    } finally {
      await rm(projectDirectory, { recursive: true, force: true });
    }
  });
});

describe(runWebsiteJest.name, () => {
  test("runs only the website project with the snapshot environment", async () => {
    const projectDirectory = path.resolve("fixtures/user-project");
    const manifestPath = path.resolve(
      "fixtures/user-project/.peakflow/website-snapshot.json",
    );
    const runProcess = jest.fn<RunJestProcess>(async () => ({
      exitCode: 0,
      noTestsFound: false,
    }));

    await expect(
      runWebsiteJest(
        { projectDirectory, manifestPath },
        {
          resolveJest: (directory) => {
            expect(directory).toBe(projectDirectory);
            return path.join(directory, "node_modules/jest/bin/jest.js");
          },
          runProcess,
        },
      ),
    ).resolves.toEqual({ exitCode: 0, noTestsFound: false });

    expect(runProcess).toHaveBeenCalledTimes(1);
    const request = runProcess.mock.calls[0]?.[0];

    expect(request).toMatchObject({
      executable: process.execPath,
      args: [
        "--disable-warning=ExperimentalWarning",
        "--experimental-vm-modules",
        path.join(projectDirectory, "node_modules/jest/bin/jest.js"),
        "--colors",
        "--verbose=false",
        "--selectProjects",
        "website",
        "--passWithNoTests",
      ],
      cwd: projectDirectory,
    });
    expect(request?.env.PEAKFLOW_WEBSITE_SNAPSHOT).toBe(manifestPath);
    expect(request?.args).not.toContain("unit");
  });

  test("preserves Jest failures and no-tests discovery", async () => {
    const runProcess = jest.fn<RunJestProcess>(async () => ({
      exitCode: 1,
      noTestsFound: true,
    }));

    await expect(
      runWebsiteJest(
        { manifestPath: "website-snapshot.json" },
        {
          resolveJest: () => "jest.js",
          runProcess,
        },
      ),
    ).resolves.toEqual({ exitCode: 1, noTestsFound: true });
  });

  test("passes verbose output through to Jest", async () => {
    const runProcess = jest.fn<RunJestProcess>(async () => ({
      exitCode: 0,
      noTestsFound: false,
    }));

    await runWebsiteJest(
      { manifestPath: "website-snapshot.json", verbose: true },
      { resolveJest: () => "jest.js", runProcess },
    );

    expect(runProcess.mock.calls[0]?.[0].args).toContain("--verbose");
    expect(runProcess.mock.calls[0]?.[0].args).not.toContain("--verbose=false");
  });

  test("uses the existing config without running the independent unit project", async () => {
    const projectDirectory = await mkdtemp(
      path.join(os.tmpdir(), "peakflow-jest-project-"),
    );
    const actualJestPath = resolveProjectJest(process.cwd());
    const manifestPath = path.join(projectDirectory, "website-snapshot.json");
    const pagePath = path.join(projectDirectory, "pages", "page.html");
    const localJestDirectory = path.join(
      projectDirectory,
      "node_modules",
      "jest",
    );
    const unitTestDirectory = path.join(projectDirectory, "tests", "unit");
    const websiteTestDirectory = path.join(
      projectDirectory,
      "tests",
      "website",
    );

    try {
      await mkdir(path.join(localJestDirectory, "bin"), { recursive: true });
      await mkdir(unitTestDirectory, { recursive: true });
      await mkdir(websiteTestDirectory, { recursive: true });
      await mkdir(path.dirname(pagePath), { recursive: true });
      await writeFile(
        path.join(projectDirectory, "package.json"),
        '{"name":"peakflow-jest-project","private":true}\n',
      );
      await writeFile(
        path.join(localJestDirectory, "package.json"),
        '{"name":"jest","bin":{"jest":"bin/jest.js"}}\n',
      );
      await writeFile(
        path.join(localJestDirectory, "bin", "jest.js"),
        `import(${JSON.stringify(pathToFileURL(actualJestPath).href)});\n`,
      );
      await writeFile(
        pagePath,
        "<html><body><h1>Snapshot page</h1></body></html>\n",
      );
      await writeFile(
        manifestPath,
        JSON.stringify({
          version: "0.1.0",
          createdAt: "2026-11-18T10:00:00.000Z",
          source: {
            targetUrl: "https://example.com/",
            origin: "https://example.com/",
            mode: "single",
            sitemapUrls: [],
            sitemapHost: "preserve",
          },
          pages: [
            {
              requestedUrl: "https://example.com/",
              finalUrl: "https://example.com/",
              file: "pages/page.html",
            },
          ],
          errors: [],
        }) + "\n",
      );
      await writeFile(
        path.join(projectDirectory, "jest.config.cjs"),
        `const rootDir = __dirname;

module.exports = {
  projects: [
    { displayName: "unit", rootDir, testMatch: ["<rootDir>/tests/unit/**/*.test.cjs"] },
    { displayName: "website", rootDir, testMatch: ["<rootDir>/tests/website/**/*.test.cjs"] },
  ],
};\n`,
      );
      await writeFile(
        path.join(unitTestDirectory, "independent.test.cjs"),
        `test("independent unit test", () => {
  throw new Error("The independent unit project must not run");
});\n`,
      );
      await writeFile(
        path.join(websiteTestDirectory, "snapshot.test.cjs"),
        `test("receives and reads the website snapshot", async () => {
  const { getWebsiteSnapshot } = await import(${JSON.stringify(pathToFileURL(path.resolve("dist/testing/index.js")).href)});
  const website = getWebsiteSnapshot();
  expect(website.pages).toHaveLength(1);
  expect(website.pages[0].html).toContain("Snapshot page");
});\n`,
      );

      expect(resolveProjectJest(projectDirectory)).toBe(
        path.join(localJestDirectory, "bin", "jest.js"),
      );
      await expect(
        runWebsiteJest({ projectDirectory, manifestPath }),
      ).resolves.toEqual({ exitCode: 0, noTestsFound: false });
    } finally {
      await rm(projectDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});
