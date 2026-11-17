# ADR-0003: Preserve sitemap hosts by default

Status: Accepted

## Decision

Sitemap page URLs are tested exactly as published by default. When a sitemap
contains URLs from another origin, Peakflow warns but preserves those URLs.

Users can explicitly rewrite page URLs to the `--url` origin:

```sh
peakflow test --url https://site.webflow.io --sitemap \
  --sitemap-host target
```

Only page URLs are rewritten. Sitemap and sitemap-index documents continue to
be fetched from their declared URLs.

## Consequences

- Production sitemap URLs are never silently changed to staging URLs.
- Staging and development workflows can opt into target-origin rewriting.
- URLs are deduplicated after rewriting.
