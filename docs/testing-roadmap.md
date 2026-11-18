# Peakflow Testing Roadmap

Last updated: 2026-11-18

This is the meta roadmap for Peakflow website testing. It records milestones,
dependencies, current status, and the intended order of work. Detailed behavior
belongs in the linked plans; architectural choices belong in ADRs.

## Documentation map

- [Historical testing implementation plan](testing-plan.md)
- [Audit reporting and test separation plan](audit-reporting-plan.md)
- [Link audit plan](link-audit-plan.md)
- [Future testing and monitoring ideas](future-testing-and-monitoring-ideas.md)
- [Testing architecture](testing-architecture.md)
- [Decision records](decisions/)

## Current state

Peakflow can currently:

- Resolve direct URL and sitemap targets.
- Fetch static HTML with bounded concurrency.
- Store a temporary, versioned website snapshot with per-page HTML files.
- Expose lazy `getWebsiteSnapshot()` fixtures to project-local Jest tests.
- Run only the user project's Jest `website` project.
- Preserve page-fetch failures and Jest results in the final CLI status.
- Provide an opt-in Swiss phone-link audit through the compatibility Jest API.

The audit-focused reporting architecture is not implemented yet. The current
link-audit implementation is a temporary, uncommitted prototype and is not a
completed roadmap milestone.

## Milestones

### 1. Snapshot foundation — complete

Deliver the generic static website snapshot contract and lifecycle.

- Target and sitemap resolution, including host policy.
- Bounded page fetching with per-page errors.
- Versioned manifests with separate per-page HTML files.
- Lazy runtime page fixtures.

Completed in commits including `362b536`, `d8bf349`, and `4463c24`.

### 2. Project-local Jest bridge — complete

Run the user's `website` Jest project against the captured snapshot.

- Resolve the project's local Jest installation.
- Pass the manifest through `PEAKFLOW_WEBSITE_SNAPSHOT`.
- Select only the `website` project.
- Preserve Jest output and combine Jest/fetch status.
- Support the CLI `--verbose` reporter option.

Completed in commits `32f3ab1` and `c6dab30`, with the verbose option in
`4b52089`.

### 3. Audit reporting and test separation — current

Replace binary Jest failures for built-in audits with structured audit results
while keeping user-authored Jest tests independent.

The implementation order is defined in
[audit-reporting-plan.md](audit-reporting-plan.md):

1. Define the audit result model.
2. Add audit collection, thresholds, exit codes, and the audit reporter.
3. Migrate the phone audit to the new audit API.
4. Migrate the link audit to the same API.
5. Implement the complete link matrix, including cross-page lookup.
6. Keep temporary `test*` wrappers and add `--jest` compatibility output.

### 4. Template and project workflow — next

Update the project template after the audit/test contracts stabilize.

- Recommend `tests/unit` and `tests/website` layouts.
- Add a multi-project Jest configuration.
- Add unit, website, and audit scripts.
- Document how users invoke audits and tests.
- Add a complete template acceptance test.

### 5. Browser execution — future

Add an optional browser runner for checks that require evaluated JavaScript or
rendered layout. This is not part of the static audit milestone.

See [future-testing-and-monitoring-ideas.md](future-testing-and-monitoring-ideas.md)
for browser console diagnostics, development-server auditing, and mobile
overflow ideas.

### 6. Scenario testing and monitoring — future

Explore workflows outside the core static-audit CLI, including form submission
scenarios, prepared seed data, AI assistance, and real-user client-side
monitoring.

These ideas require separate decisions about side effects, credentials,
hosting, privacy, alerting, and ownership.

## Current non-goals

- Executing JavaScript in static snapshot mode.
- Browser-based verification or mobile layout measurement.
- Development-server watch auditing.
- Form submission workflows or external Make.com side effects.
- AI-assisted test data generation.
- Real-user monitoring and email notifications.
- Automatically enabling every built-in audit.
- Running unrelated user unit tests from `peakflow test` by default.

## Planning rules

- Keep this file milestone-level and dependency-oriented.
- Put exact audit behavior in an audit-specific plan.
- Put implementation details for the active milestone in its plan.
- Record accepted architectural choices in ADRs.
- Keep exploratory ideas out of the active milestone until their execution
  environment and ownership are clear.
