import { mkdir } from "node:fs/promises";
import path from "node:path";
const PEAKFLOW_DIRECTORY_NAME = ".peakflow";
async function ensurePeakflowDirectory(options = {}) {
  const projectDirectory = options.cwd ?? process.cwd();
  const directory = path.resolve(projectDirectory, PEAKFLOW_DIRECTORY_NAME);
  await mkdir(directory, { recursive: true });
  return directory;
}
export {
  PEAKFLOW_DIRECTORY_NAME,
  ensurePeakflowDirectory
};
