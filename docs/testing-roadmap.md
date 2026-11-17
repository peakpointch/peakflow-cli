# Peakflow Testing Roadmap

Last updated: 2026-11-17

This is the living roadmap for Peakflow website testing. It records the
current implementation, the agreed direction, and the work that remains.

Related documentation:

- [Testing architecture](testing-architecture.md)
- [ADR-0001: Jest owns website test execution](decisions/0001-jest-owns-website-tests.md)
- [ADR-0002: Website snapshot fixture](decisions/0002-website-snapshot-fixture.md)
- [ADR-0003: Sitemap host policy](decisions/0003-sitemap-host-policy.md)
- [ADR-0004: Testing package and module conventions](decisions/0004-testing-package-and-module-conventions.md)

## Product direction

Peakflow should prepare a website snapshot and let the user's Jest project
run the actual website tests. Peakflow owns target resolution, fetching,
snapshot creation, and reporting. Jest owns test discovery, assertions,
test execution, filtering, and CI behavior.

The intended user-facing flow is:

```text
peakflow test
  -> resolve target pages
  -> fetch static HTML
  -> create a temporary website snapshot
  -> run the user's Jest website project
  -> combine fetch and Jest failures in Peakflow reporting
```

Website tests should be opt-in from the user's test code. Peakflow should
ship reusable audit modules, but should not silently enable every audit.

## Immediate next step: write the implementation plan

The architecture decisions are now settled. The next task is a commit-based
implementation plan for the Jest migration covering the snapshot manifest,
Jest bridge, public fixture API, template setup, and migration of the phone
audit.

## Completed

### Target resolution and sitemap handling

- [x] Validate absolute HTTP(S) `--url` values.
- [x] Preserve URL paths and queries while removing fragments.
- [x] Test only the exact URL when `--sitemap` is absent.
- [x] Support bare `--sitemap` automatic discovery.
- [x] Support relative and absolute sitemap URLs.
- [x] Discover sitemaps from `robots.txt` with `/sitemap.xml` fallback.
- [x] Recursively process sitemap indexes with cycle protection.
- [x] Validate, order, and deduplicate sitemap page URLs.
- [x] Add explicit sitemap host policy:
  - [x] Preserve sitemap hosts by default.
  - [x] Warn when sitemap page origins differ from the target origin.
  - [x] Rewrite page URLs to the target origin with
    `--sitemap-host target`.
  - [x] Deduplicate after rewriting.
- [x] Keep nested sitemap documents on their declared fetch URLs.

### Current static audit implementation

- [x] Fetch HTML without executing page JavaScript.
- [x] Analyze pages with bounded concurrency.
- [x] Continue after individual page or module failures.
- [x] Validate Swiss telephone links.
- [x] Detect invalid, foreign, extension-bearing, or malformed telephone
  hrefs.
- [x] Detect non-canonical Swiss E.164 hrefs.
- [x] Compare telephone hrefs with recognizable displayed phone numbers.
- [x] Preserve source locations and evidence for findings.

### CLI and reporting

- [x] Add `peakflow test --url <url>`.
- [x] Add `peakflow test --url <url> --sitemap [url]`.
- [x] Use the existing `TaskLogger` and `Table` components.
- [x] Report findings and scan errors in separate tables.
- [x] Collect all findings before setting the final exit status.
- [x] Set exit code `1` for findings, scan errors, or fatal discovery errors.
- [x] Add deterministic sorting and formatter tests.
- [x] Build and track the generated CLI output in `dist`.

Completed implementation commits:

- `f04b585` — URL and sitemap target resolution.
- `37a4f4a` — Modular static Swiss phone-link audit.
- `cbb4b90` — URL testing command and table reporting.
- `211f7c3` — Explicit sitemap host rewriting.

## Next: migrate execution to Jest

The current `AuditModule` runner is a working transitional implementation.
It should be replaced as the primary user-facing testing model by Jest,
without losing the existing target resolution, fetching, or reporting work.

### Website snapshot and manifest

- [ ] Define the stable `WebsiteSnapshot` contract.
- [ ] Define the `WebsitePageSnapshot` contract containing URL, final URL,
  HTML, and parsed Cheerio document data.
- [ ] Define a versioned manifest format for communication with Jest.
- [ ] Fetch pages before Jest starts.
- [ ] Store the manifest in a temporary run directory.
- [ ] Clean up temporary manifests by default.
- [ ] Add an optional way to retain a manifest for debugging.
- [ ] Preserve fetch failures in the manifest or a companion error file.
- [ ] Print one warning for every page that fails to fetch.
- [ ] Make snapshot loading synchronous from test code.

### Public testing API

- [ ] Expose `getWebsiteSnapshot()` from the testing package.
- [ ] Return a snapshot with a `pages` property.
- [ ] Keep page fixtures usable with normal Jest APIs:

  ```ts
  import { getWebsiteSnapshot } from "peakflow-cli/testing";

  const website = getWebsiteSnapshot();

  describe.each(website.pages)("$url", (page) => {
    // Normal Jest tests using page.html or page.document.
  });
  ```

- [ ] Fail clearly when website tests run without a Peakflow manifest.
- [ ] Keep the page API close to Cheerio instead of hiding DOM capabilities
  behind phone- or link-specific abstractions.

### Jest integration

- [ ] Run the user's project-local Jest installation.
- [ ] Select only the website Jest project from `peakflow test`.
- [ ] Leave independent unit tests under the user's normal Jest command.
- [ ] Support the user's Jest configuration and TypeScript/ESM setup.
- [ ] Decide how additional Jest arguments are passed through the CLI.
- [ ] Inform users when no website tests are found, without failing solely
  for that reason, and include a sentence on how to add them plus a link to
  the planned testing guide.
- [ ] Combine Jest exit status with page-fetch and manifest errors.
- [ ] Preserve Peakflow table reporting around Jest output.

### Opt-in audit modules

- [ ] Move the phone audit into a reusable user-importable module.
- [ ] Require users to explicitly call or enable imported audit modules.
- [ ] Preserve stable rule IDs and structured evidence.
- [ ] Map module failures to normal Jest test failures where useful.
- [ ] Use `test*` or `audit*` prefixes for built-in module names.
- [ ] Allow optional module configuration as the second argument.
- [ ] Decide whether built-in modules use generic Jest assertions,
  custom matchers, or a small Peakflow assertion helper.
- [ ] Retire or deprecate the current internal `AuditModule` execution path
  after Jest parity is established.

## User project and template work

- [ ] Add a recommended `tests/unit` and `tests/website` layout to the
  project template.
- [ ] Add a multi-project Jest configuration example.
- [ ] Add package scripts for unit tests and website tests.
- [ ] Document that `peakflow test` runs the website project only.
- [ ] Document how users import and enable built-in audits.
- [ ] Document direct Jest behavior when no website snapshot exists.
- [ ] Add the planned website testing guide linked by the no-tests message.
- [ ] Add a template acceptance test for the complete CI workflow.

## Reporting and diagnostics after Jest migration

- [ ] Keep page-fetch errors separate from Jest assertion failures.
- [ ] Include page URL, test name, rule ID, and source location where
  available.
- [ ] Preserve the existing compact table style.
- [ ] Add a manifest/run identifier to verbose diagnostics.
- [ ] Add optional request timing and status diagnostics for investigating
  unusually fast or slow runs.
- [ ] Never print full HTML snapshots in normal output.

## Website metadata

The snapshot may eventually expose optional website-level metadata, but the
generic contract must not depend on Webflow-specific HTML comments.

- [ ] Add stable metadata such as origin, source mode, sitemap URLs,
  environment, and fetch timestamp.
- [ ] Define optional provider metadata for Webflow site ID, name, and
  publication information.
- [ ] Keep provider metadata generic and optional.
- [ ] Define a future plugin API for provider-specific metadata.

## Future target modes

The snapshot source should be abstracted so future environments do not
change the Jest fixture API.

- [ ] Add production mode using a configured production domain.
- [ ] Add staging mode using the configured Webflow staging domain.
- [ ] Add development mode using the local proxy/dev server.
- [ ] Support the agreed URL/environment matrix:

  | Invocation | Upstream | Fetch mode |
  | --- | --- | --- |
  | `--url U` | `U` | Direct HTTP |
  | `--url U --production` | `U` | Direct HTTP |
  | `--production` | Configured production URL | Direct HTTP |
  | `--staging` | Configured staging URL | Direct HTTP |
  | `--development` | Staging URL | Local proxy |
  | `--url U --development` | `U` | Local proxy |

- [ ] Enforce mutually exclusive environment flags.
- [ ] Add configuration for the production domain.

## Future audit modules

- [ ] Broken links.
- [ ] Broken scroll links.
- [ ] Additional HTML and accessibility audits.
- [ ] Optional browser-rendered mode for JavaScript-created DOM.
- [ ] Custom user-installed audit modules beyond the built-in package.

## Operational and security requirements

- [ ] Add response-size limits.
- [ ] Define redirect and content-type behavior in the snapshot contract.
- [ ] Decide how authenticated staging pages are fetched.
- [ ] Define safe handling of private or unexpected sitemap hosts.
- [ ] Review SSRF protections for arbitrary URLs and sitemap entries.
- [ ] Ensure temporary snapshots are cleaned up on success, failure, and
  interruption.
- [ ] Avoid persisting sensitive HTML unless explicitly requested.
- [ ] Document that static mode does not execute JavaScript.

## Deferred decisions

- [ ] Decide whether to extract the testing API into `@peakflow/testing`
  after it stabilizes.
- [ ] Decide whether a future `peakflow test --all` or `peakflow ci` command
  is useful for combining unit and website test projects.

## Current non-goals

- Executing JavaScript in the current static HTML mode.
- Automatically enabling every built-in audit module.
- Automatically rewriting sitemap hosts without an explicit policy.
- Running unrelated user unit tests from `peakflow test` by default.
