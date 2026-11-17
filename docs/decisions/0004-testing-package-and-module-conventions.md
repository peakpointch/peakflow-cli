# ADR-0004: Keep the first testing API in the CLI package

Status: Accepted

## Decision

The first implementation of the website snapshot API and built-in audit
modules stays inside the `peakflow-cli` package. A separate
`@peakflow/testing` package may be extracted later, after the public API has
stabilized.

Built-in modules are opt-in and use a `test*` or `audit*` prefix. They may
accept an optional configuration object as their second argument, for example:

```ts
testPhoneLinks(website, options);
```

## Consequences

- Users do not get surprise audits enabled automatically.
- The initial release does not require a multi-package repository setup.
- Module names are recognizable as testing or audit helpers.
- Provider-specific metadata is deferred to a future plugin API.
