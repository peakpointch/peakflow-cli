import { mkdir } from "node:fs/promises";
import path from "node:path";

export const peakflowDirectoryName = ".peakflow";

export interface EnsurePeakflowDirectoryOptions {
  cwd?: string;
}

/**
 * Ensure the current project has a Peakflow working directory.
 *
 * @param options - Optional project working-directory override.
 * @returns The absolute `.peakflow` directory path.
 */
export async function ensurePeakflowDirectory(
  options: EnsurePeakflowDirectoryOptions = {},
): Promise<string> {
  const projectDirectory = options.cwd ?? process.cwd();
  const directory = path.resolve(projectDirectory, peakflowDirectoryName);

  await mkdir(directory, { recursive: true });
  return directory;
}
