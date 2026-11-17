# Peakflow Testing Architecture

Status: agreed direction; Jest integration is not implemented yet.

## Responsibilities

Peakflow owns:

- Target and sitemap resolution.
- Page fetching and static HTML snapshots.
- Sitemap host policy.
- Fetch errors and final CLI reporting.
- Launching the user's website Jest project.

Jest owns:

- Test discovery and execution.
- `describe`, `test`, and `expect`.
- Test filtering, reporters, and normal CI behavior.

Independent unit tests remain the user's responsibility and are not run by
`peakflow test` by default.

## Website snapshot

`peakflow test` will fetch pages before Jest starts and expose one synchronous
website snapshot to the website tests:

```ts
import { getWebsiteSnapshot } from "peakflow-cli/testing";

const website = getWebsiteSnapshot();

describe.each(website.pages)("$url", (page) => {
  // Normal Jest tests using page.html or page.document.
});
```

The snapshot will contain generic website-level metadata and page snapshots. A
page snapshot will include its requested URL, final URL, HTML, and parsed
Cheerio document. Page HTML is stored in separate files and loaded lazily;
the HTML string and Cheerio document are cached after first access. The
serialized manifest and runtime `PageSnapshot` are separate contracts.
Provider-specific metadata is deferred to a future plugin API.

## Jest projects

User projects should separate ordinary tests from website tests, for example:

```text
tests/
  unit/
  website/
```

`peakflow test` runs only the website Jest project. The user's normal Jest
command can run unit tests independently.

## Current implementation

The current CLI fetches and analyzes static HTML directly with an internal
`AuditModule` runner. That runner is a transitional implementation. The
target-resolution, sitemap, phone-link, logging, and reporting behavior will
be retained while test execution moves to the user's Jest project.

JavaScript is not executed in the current static mode. Browser-rendered tests
are a future source mode.

## Accepted implementation decisions

- Build the first testing architecture inside the `peakflow-cli` package.
- Use the user's project-local Jest installation and configuration.
- Create one temporary, versioned manifest per `peakflow test` run.
- Run only the website Jest project from `peakflow test`.
- Keep independent unit tests under the user's normal Jest command.
- Continue after individual page-fetch failures, print one warning for each
  failed page, and return a failing exit status when any fetch or Jest
  failure occurs.
- Inform users when no website tests are found, explain that tests should be
  added to the website Jest project, and link to the planned
  [website testing guide](website-testing.md).
- Do not fail solely because no website tests were found.
- Export built-in modules with a `test*` or `audit*` prefix, such as
  `testPhoneLinks` or `auditPhoneLinks`.
- Allow built-in modules to accept an optional configuration object as their
  second argument.
- Keep website metadata generic. Webflow-specific metadata belongs in a
  future plugin API rather than the core snapshot contract.

The package may be extracted to `@peakflow/testing` later, after the API
stabilizes. That is not part of the first implementation.
