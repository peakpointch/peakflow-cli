import { mkdir } from "node:fs/promises";
import path from "node:path";
const peakflowDirectoryName = ".peakflow";
async function ensurePeakflowDirectory(options = {}) {
  const projectDirectory = options.cwd ?? process.cwd();
  const directory = path.resolve(projectDirectory, peakflowDirectoryName);
  await mkdir(directory, { recursive: true });
  return directory;
}
export {
  ensurePeakflowDirectory,
  peakflowDirectoryName
};
