# Jest Website Testing Implementation Plan

This is the implementation plan for migrating website testing to
project-local Jest. The first implementation remains inside `peakflow-cli`.
The future package extraction to `@peakflow/testing` is intentionally deferred.

## Status

- Commit 0, accepted architecture documentation: complete.
- Commit 1, snapshot capture and manifest storage: complete.
- Commit 2, public lazy snapshot fixture: complete.
- Commit 3, project-local website Jest bridge: next.
- Commit 4, opt-in phone audit module: pending.
- Template repository setup: pending follow-up.

## Commit 0 — document the accepted architecture

Commit message: `docs(test): document Jest testing architecture`

Record the accepted behavior for project-local Jest, website-only execution,
temporary manifests, per-page fetch warnings, no-tests-found messaging,
opt-in `test*`/`audit*` modules, and generic snapshot metadata. Keep the
planned website-testing documentation link as a placeholder.

## Commit 1 — add website snapshot manifests

Commit message: `feat(test): add website snapshot manifests`

- Resolve target pages using the existing URL, sitemap, and sitemap-host
  behavior.
- Fetch selected pages with bounded concurrency and continue after failures.
- Print one warning for every failed page.
- Store successful HTML in separate files under a temporary `.peakflow` run
  directory.
- Store page metadata and fetch errors in a provisional `0.1.0` manifest.
- Preserve deterministic page ordering and cleanup behavior.

Follow-up manifest refactor:

`refactor(test): store snapshots in per-page files` (`d8bf349`)

## Commit 2 — expose the website snapshot fixture

Commit message: `feat(test): expose website snapshot fixtures`

- Export `getWebsiteSnapshot` from `peakflow-cli/testing`.
- Read and validate the manifest synchronously without network requests.
- Expose `WebsiteSnapshot.pages` as runtime `PageSnapshot` instances.
- Keep serialized manifest entries separate as `SerializedPageSnapshot`.
- Load page HTML lazily from its file and cache both HTML and the Cheerio
  document after first access.
- Fail clearly for missing, empty, malformed, invalid, or incompatible
  manifests.
- Keep the manifest version at provisional semver `0.1.0` until the format
  stabilizes.

Completed in `4463c24`.

## Commit 3 — run the project-local website Jest project

Commit message: `feat(test): run project-local website Jest tests`

- Capture the website snapshot before Jest starts.
- Set `PEAKFLOW_WEBSITE_SNAPSHOT` for the Jest process.
- Resolve and run the user project’s local Jest installation.
- Use the user’s existing Jest configuration.
- Select only the Jest project named `website`.
- Combine Jest failures and page-fetch failures into the final exit status.
- Print one warning for every failed page.
- Inform users when no website tests are found without failing solely for
  that reason, and include the planned documentation link.
- Preserve Peakflow lifecycle logging and table reporting.
- Prove that independent unit tests are not run by `peakflow test`.

## Commit 4 — add the opt-in phone audit module

Commit message: `feat(test): add opt-in phone audit module`

Move the phone audit to a user-invoked Jest-compatible module:

```ts
import { getWebsiteSnapshot } from "peakflow-cli/testing";
import { testPhoneLinks } from "peakflow-cli/testing/audits";

const website = getWebsiteSnapshot();

testPhoneLinks(website, options);
```

Preserve the existing Swiss phone behavior and rule IDs. Require users to
explicitly enable the module, allow optional configuration, preserve useful
failure context, and prove ordinary user-authored Jest tests can run beside
the audit.

## Template repository follow-up

In `clients/template`, add `tests/unit` and `tests/website` conventions, a
multi-project Jest configuration with a `website` project, test scripts, a
minimal snapshot test, an explicit phone-audit example, and CI guidance.
Keep this repository change separate from the `peakflow-cli` commits.

## Out of scope

- `--staging`, `--development`, and `--production`.
- Browser-rendered testing, authentication, and cookies.
- Cross-run caching and provider-specific metadata.
- Broken-link and scroll-link audits.
- `@peakflow/testing` extraction.
- A custom assertion framework.
- `peakflow test --all` and `peakflow ci`.

## Verification before each commit

```sh
pnpm exec tsc --noEmit
pnpm test --runInBand
pnpm run build:cli
```

Also run formatting and diff checks. Stop before each commit and wait for
approval.

## Deferred validation improvement

Replace the manual `readManifest` validation with a Zod schema in the future,
matching the existing `peakflow.config.ts` validation approach.
