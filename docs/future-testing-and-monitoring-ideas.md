# Future Testing and Monitoring Ideas

This document captures ideas that may be valuable later but are not part of the
current Peakflow CLI testing and static-audit scope. They are deliberately
exploratory rather than commitments to build them into this CLI.

## Browser-based verification

Add an optional browser execution layer that evaluates client-side JavaScript
instead of inspecting only fetched static HTML.

Potential capabilities:

- Report browser console errors and warnings when client-side code fails.
- Check behavior that only exists after JavaScript runs.
- Test rendered layout and responsive behavior at mobile viewports.
- Run isolated browser contexts with explicit authentication and test data.

This may eventually belong in a separate browser-testing package or workflow,
rather than the static website-audit path.

## Development-server auditing

Provide a development workflow that runs selected checks directly against a
local dev server while a project is being developed.

Possible forms include:

- On-demand browser audits against the dev server.
- Watch mode with repeated checks after changes.
- Live diagnostics for browser console errors and audit findings.

The development workflow should share audit rules with production checks where
possible, while allowing source-specific checks for dev-only behavior.

## Form submission scenarios

Support explicit tests for forms and submission workflows, including websites
where Webflow forms are connected to services such as Make.com.

Possible future capabilities:

- Declarative form scenarios with prepared seed data.
- Assertions about validation, navigation, confirmation states, and responses.
- Cleanup or rollback for created test data.
- Explicit credentials, secrets, and external-side-effect controls.
- Optional AI assistance for preparing or adapting test data and scenarios.

Form workflows are likely a separate scenario or end-to-end testing tool, not a
default static audit in the Peakflow CLI. They must be opt-in because they can
create external side effects.

## Production placeholder-content audit

Add a static audit that searches production pages for placeholder content such
as lorem ipsum.

Potential configuration could include:

- Case-insensitive placeholder phrase matching.
- Additional project-specific phrases.
- Allowlisted pages or content regions.
- Severity configuration for known intentional examples.

This idea fits the future static-audit model more naturally than the browser
and form ideas, but it is not part of the current milestone.

## Mobile overflow audit

Add a browser-based audit for horizontal overflow and layout problems at one or
more mobile viewport profiles.

Potential checks include:

- Document or root scroll width exceeding the viewport width.
- Individual elements extending beyond the viewport.
- Configurable tolerance for sub-pixel and scrollbar differences.
- A small set of named device or viewport profiles.

This requires rendered layout measurements, so it belongs to a future browser
execution layer rather than the current static HTML snapshot mode.

## Real-user client-side monitoring

Investigate a live reporting system that detects client-side failures for real
users and notifies the project team, for example by email.

Possible signals include:

- Uncaught browser exceptions.
- Unhandled promise rejections.
- Console errors where appropriate.
- Page, route, release, and browser metadata.

This is observability and monitoring rather than a deterministic test or audit.
It may require a separate hosted service, browser SDK, privacy model, alerting
system, and retention policy. It should not be coupled to the static
`peakflow test` command.

## Current boundary

The current Peakflow CLI milestone remains focused on:

- Capturing static website snapshots.
- Running user-authored Jest tests separately from audits.
- Reporting built-in static audits with structured severity.
- Preserving native Jest output through an explicit compatibility option.

The ideas above should only enter the implementation plan after their execution
environment, side effects, and ownership are clear.
