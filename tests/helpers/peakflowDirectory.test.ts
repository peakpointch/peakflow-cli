import { access, mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "@jest/globals";

import {
  PEAKFLOW_DIRECTORY_NAME,
  ensurePeakflowDirectory,
} from "../../src/helpers/peakflowDirectory.js";

describe(ensurePeakflowDirectory.name, () => {
  test("creates the project directory lazily and reuses it", async () => {
    const projectDirectory = await mkdtemp(
      path.join(os.tmpdir(), "peakflow-project-test-"),
    );
    const peakflowDirectory = path.join(
      projectDirectory,
      PEAKFLOW_DIRECTORY_NAME,
    );

    try {
      await expect(access(peakflowDirectory)).rejects.toThrow();

      await expect(
        ensurePeakflowDirectory({ cwd: projectDirectory }),
      ).resolves.toBe(peakflowDirectory);
      await expect(stat(peakflowDirectory)).resolves.toMatchObject({
        isDirectory: expect.any(Function),
      });
      await expect(
        ensurePeakflowDirectory({ cwd: projectDirectory }),
      ).resolves.toBe(peakflowDirectory);
    } finally {
      await rm(projectDirectory, { recursive: true, force: true });
    }
  });
});
