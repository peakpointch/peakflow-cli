# ADR-0001: Jest owns website test execution

Status: Accepted

## Decision

Peakflow fetches website pages and launches the user's website Jest project.
Jest owns test execution and assertions. Peakflow does not maintain a second
user-facing test runner.

## Consequences

- Users can write ordinary Jest tests and use Jest's assertion ecosystem.
- Website tests can remain separate from unit and application tests.
- Peakflow must provide a page snapshot before Jest starts.
- Peakflow still reports page-fetch failures and controls target selection.
