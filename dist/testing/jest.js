import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { websiteSnapshotManifestEnvironmentVariable } from "./fixture.js";
const websiteProjectName = "website";
const noTestsFoundPattern = /No tests found(?:,|\.|$)/i;
function resolveProjectJest(projectDirectory) {
  const resolvedProjectDirectory = path.resolve(projectDirectory);
  const projectRequire = createRequire(
    path.join(resolvedProjectDirectory, "package.json")
  );
  try {
    return projectRequire.resolve("jest/bin/jest");
  } catch (error) {
    const cause = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(
      `Unable to resolve Jest from ${resolvedProjectDirectory}. Install Jest in the project before running \`peakflow test\`.${cause}`
    );
  }
}
function relayOutput(stream, destination, onNoTestsFound) {
  let tail = "";
  stream.on("data", (chunk) => {
    destination.write(chunk);
    const text = tail + chunk.toString();
    if (noTestsFoundPattern.test(text)) onNoTestsFound();
    tail = text.slice(-64);
  });
}
async function runJestProcess(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(request.executable, request.args, {
      cwd: request.cwd,
      env: request.env,
      stdio: ["inherit", "pipe", "pipe"]
    });
    let noTestsFound = false;
    const markNoTestsFound = () => {
      noTestsFound = true;
    };
    if (child.stdout)
      relayOutput(child.stdout, process.stdout, markNoTestsFound);
    if (child.stderr)
      relayOutput(child.stderr, process.stderr, markNoTestsFound);
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      if (signal) {
        reject(new Error(`Jest was terminated by signal ${signal}.`));
        return;
      }
      resolve({ exitCode: exitCode ?? 1, noTestsFound });
    });
  });
}
async function runWebsiteJest(options, dependencies = {}) {
  const projectDirectory = path.resolve(
    options.projectDirectory ?? process.cwd()
  );
  const getJestPath = dependencies.resolveJest ?? resolveProjectJest;
  const launchProcess = dependencies.runProcess ?? runJestProcess;
  const jestPath = getJestPath(projectDirectory);
  return launchProcess({
    executable: process.execPath,
    args: [
      "--disable-warning=ExperimentalWarning",
      "--experimental-vm-modules",
      jestPath,
      "--colors",
      "--selectProjects",
      websiteProjectName,
      "--passWithNoTests"
    ],
    cwd: projectDirectory,
    env: {
      ...process.env,
      [websiteSnapshotManifestEnvironmentVariable]: path.resolve(
        options.manifestPath
      )
    }
  });
}
export {
  resolveProjectJest,
  runWebsiteJest
};
