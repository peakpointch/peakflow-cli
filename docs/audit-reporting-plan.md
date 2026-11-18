# Audit Reporting and Test Separation Plan

Status: draft

This plan defines how Peakflow should distinguish website audits from
user-authored Jest tests. It is separate from the link-audit rules plan and
from the exploratory ideas in `future-testing-and-monitoring-ideas.md`.

## Why change the current model?

The current built-in phone and link checks register ordinary Jest tests. That
forces every result into a binary pass/fail model and makes Jest's test
reporter the primary user experience.

Audits need to report multiple findings with different severities, locations,
evidence, and confidence. User-authored tests should continue to use Jest's
normal assertions and lifecycle.

## Current milestone scope

Keep this milestone focused on the existing static website snapshot pipeline:

- Capture static HTML pages before analysis.
- Run built-in phone and link audits against those snapshots.
- Run user-authored website Jest tests separately.
- Produce an audit-focused default report.
- Preserve native Jest output through an explicit `--jest` option.

Do not add browser execution, dev-server watch mode, form workflows, AI test
data, or real-user monitoring in this milestone. Those ideas are tracked in
`future-testing-and-monitoring-ideas.md`.

## Result model

### Severity

Use three user-facing severity levels:

- `error` — a definite, actionable defect.
- `warning` — a likely defect or quality problem that is not necessarily
  release-blocking.
- `notice` — an informational recommendation or improvement opportunity.

Severity is assigned by the audit rule and may be configurable where a project
has a different policy.

### Status

Keep severity separate from the result status:

- `fail` — the rule found a definite problem.
- `review` — static analysis cannot determine the answer confidently.
- `pass` — the rule ran and found no issue.
- `not-applicable` — the rule does not apply to this page or run.

Technical failures such as fetch errors, malformed manifests, or a crashed Jest
process are run failures, not audit severities.

### Finding data

Each finding should include, where available:

- Audit ID
- Rule ID
- Severity
- Status
- Human-readable message
- Page URL
- Source location
- Source HTML or other evidence
- Suggested action or documentation link

The shape should remain compatible with SARIF concepts so a SARIF exporter can
be added later without redesigning every audit. SARIF is an output standard,
not a required runtime dependency.

## Initial rule severity guidance

The initial built-in rules should use these defaults:

| Rule category | Default severity |
| --- | --- |
| Missing internal page | `error` |
| Missing scroll target | `error` |
| Invalid phone href | `error` |
| Phone text does not match href | `error` |
| Non-canonical phone formatting | `warning` |
| Static result requiring human judgment | `review` status |

The rule registry should own these defaults rather than scattering severity
decisions through report formatting code.

## Exit behavior

Separate technical failures from audit findings:

- `0` — the run completed and no finding exceeded the configured threshold.
- `1` — a technical failure prevented a reliable run.
- `2` — the run completed, but audit findings exceeded the threshold.

The default threshold should be `error`. A future CLI option can make the
policy explicit, for example:

```text
peakflow test --fail-on error
peakflow test --fail-on warning
peakflow test --fail-on notice
peakflow test --fail-on none
```

Warnings and notices should still be reported when they do not fail the run.

## Reporting modes

### Default Peakflow report

The default output should be audit-focused and grouped by severity, audit,
page, and rule:

```text
Website audit report

ERROR   links/link-target-missing
        /path1 -> /path2
        Target page was not captured

WARNING phone/phone-href-not-e164
        /contact:12:4
        Expected tel:+41446681800

Summary: 1 error, 1 warning, 0 notices
Jest tests: 12 passed, 1 failed
```

The report should show all audit findings that are not disabled by
configuration. It should not print full HTML snapshots in normal output.

### `--jest` compatibility mode

`--jest` should preserve the current native Jest reporter for users who want
Jest-oriented output. It changes reporting, not the selected pages, audit rules,
or severity threshold.

The exact relationship between the native Jest output and the audit summary is
still an implementation decision: the compatibility mode may either show both
or make the native reporter the primary output while retaining the final
Peakflow status summary.

## Tests and audits

User-authored tests remain ordinary Jest tests:

```ts
test("navigation behaves correctly", () => {
  // normal Jest assertions
});
```

Built-in checks should become first-class audits with structured results:

```ts
auditLinks(website);
auditPhoneLinks(website);
```

The current `testLinks*` and `testPhoneLinks*` APIs are tied to Jest naming and
should be evaluated as compatibility wrappers. The preferred long-term API is
likely to use `audit*` names, while allowing a migration period for existing
website test files.

Audits and tests should share the captured website snapshot, but they should
not share the same result model or reporter.

## Execution architecture

The static milestone should have four separable responsibilities:

1. Snapshot capture and page-fetch diagnostics.
2. Audit rule execution and structured findings.
3. User Jest execution and test-result collection.
4. Final reporting and exit-status policy.

The audit engine must not depend on Jest assertions to represent findings.
Jest remains the execution engine for user-authored tests and a compatibility
path for existing audit registrations only until the migration is complete.

## Standards and dependencies

Adopt conventions rather than adding a large audit framework dependency:

- Use Pa11y-style `error`/`warning`/`notice` threshold semantics.
- Keep the result shape compatible with SARIF fields and levels.
- Reserve axe-core or Pa11y for optional future accessibility integrations.
- Do not make Lighthouse or Pa11y a dependency of the static audit core.

References:

- [Pa11y](https://github.com/pa11y/pa11y)
- [axe-core](https://github.com/dequelabs/axe-core)
- [SARIF](https://sarif.info/)
- [Lighthouse audit results](https://github.com/GoogleChrome/lighthouse/blob/main/docs/understanding-results.md)

## Proposed implementation phases

### Phase 1 — Define contracts

- Add audit severity, status, finding, and run-result types.
- Define rule metadata and default severities.
- Define threshold evaluation and technical-failure handling.

### Phase 2 — Add audit collection and reporting

- Collect structured results independently from Jest assertions.
- Add the default Peakflow audit report.
- Preserve the current native Jest reporter behind `--jest`.
- Keep fetch warnings separate from audit findings.

### Phase 3 — Migrate built-in audits

- Move phone and link rules to structured audit results.
- Preserve rule IDs, source locations, and evidence.
- Add compatibility behavior for existing `test*` imports.
- Add severity and threshold coverage.

### Phase 4 — Document user workflows

- Document the difference between tests and audits.
- Document default and `--jest` reporting.
- Document severity thresholds and exit codes.
- Document the migration from `test*` to `audit*` APIs.

## Open decisions

These decisions must be settled before implementation:

- How users explicitly invoke audits independently of Jest test files.
- Whether `--jest` shows native Jest output only or both native output and the
  audit summary.
- Whether `--fail-on` is CLI-only or also configurable in project config.
- Whether audit results should be persisted as a local JSON artifact in the
  first version.
- Whether `audit*` APIs replace `test*` APIs immediately or through a
  compatibility period.
