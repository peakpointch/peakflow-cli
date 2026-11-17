import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

import { websiteSnapshotManifestEnvironmentVariable } from "./fixture.js";

const websiteProjectName = "website";
const noTestsFoundPattern = /No tests found(?:,|\.|$)/i;

/** Result returned after the project-local website Jest project exits. */
export interface WebsiteJestResult {
  /** Jest process exit code. */
  exitCode: number;
  /** Whether Jest reported that it did not discover any tests. */
  noTestsFound: boolean;
}

/** Inputs required to launch the website Jest project. */
export interface RunWebsiteJestOptions {
  /** Absolute path to the website snapshot manifest. */
  manifestPath: string;
  /** User project directory containing Jest and its configuration. */
  projectDirectory?: string;
}

/** Process request used by the Jest bridge. */
export interface JestProcessRequest {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

/** Injectable process launcher used by bridge tests. */
export type RunJestProcess = (
  request: JestProcessRequest,
) => Promise<WebsiteJestResult>;

/** Injectable dependencies used to resolve and launch Jest. */
export interface WebsiteJestDependencies {
  resolveJest?: (projectDirectory: string) => string;
  runProcess?: RunJestProcess;
}

/**
 * Resolve Jest through the user project's Node module graph.
 *
 * @param projectDirectory - User project directory expected to contain Jest.
 * @returns Absolute path to the project-local Jest executable module.
 */
export function resolveProjectJest(projectDirectory: string): string {
  const resolvedProjectDirectory = path.resolve(projectDirectory);
  const projectRequire = createRequire(
    path.join(resolvedProjectDirectory, "package.json"),
  );

  try {
    return projectRequire.resolve("jest/bin/jest");
  } catch (error) {
    const cause = error instanceof Error ? ` ${error.message}` : "";

    throw new Error(
      `Unable to resolve Jest from ${resolvedProjectDirectory}. Install Jest in the project before running \`peakflow test\`.${cause}`,
    );
  }
}

/**
 * Stream one child-process channel while looking for Jest's no-tests message.
 *
 * @param stream - Child-process output stream.
 * @param destination - Parent-process stream receiving the same output.
 * @param onNoTestsFound - Called when the no-tests message is observed.
 */
function relayOutput(
  stream: NodeJS.ReadableStream,
  destination: NodeJS.WritableStream,
  onNoTestsFound: () => void,
): void {
  let tail = "";

  stream.on("data", (chunk: Buffer | string) => {
    destination.write(chunk);

    const text = tail + chunk.toString();
    if (noTestsFoundPattern.test(text)) onNoTestsFound();
    tail = text.slice(-64);
  });
}

/**
 * Launch Jest as a child Node process and preserve its terminal output.
 *
 * @param request - Executable, arguments, working directory, and environment.
 * @returns Jest exit code and no-tests discovery state.
 */
async function runJestProcess(
  request: JestProcessRequest,
): Promise<WebsiteJestResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(request.executable, request.args, {
      cwd: request.cwd,
      env: request.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let noTestsFound = false;
    const markNoTestsFound = (): void => {
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

/**
 * Run only the user project's website Jest project against a captured snapshot.
 *
 * @param options - Manifest and user-project paths.
 * @param dependencies - Resolver and process overrides used by tests.
 * @returns Jest exit code and whether no website tests were discovered.
 */
export async function runWebsiteJest(
  options: RunWebsiteJestOptions,
  dependencies: WebsiteJestDependencies = {},
): Promise<WebsiteJestResult> {
  const projectDirectory = path.resolve(
    options.projectDirectory ?? process.cwd(),
  );
  const getJestPath = dependencies.resolveJest ?? resolveProjectJest;
  const launchProcess = dependencies.runProcess ?? runJestProcess;
  const jestPath = getJestPath(projectDirectory);

  return launchProcess({
    executable: process.execPath,
    args: [
      "--experimental-vm-modules",
      jestPath,
      "--selectProjects",
      websiteProjectName,
      "--passWithNoTests",
    ],
    cwd: projectDirectory,
    env: {
      ...process.env,
      [websiteSnapshotManifestEnvironmentVariable]: path.resolve(
        options.manifestPath,
      ),
    },
  });
}
