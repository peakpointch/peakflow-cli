# ADR-0002: Provide fetched pages through a website snapshot

Status: Accepted

## Decision

Peakflow will expose a synchronous `getWebsiteSnapshot()` fixture to website
tests. The fixture contains the selected pages and their static HTML data.

Tests use native Jest parameterization:

```ts
const website = getWebsiteSnapshot();

describe.each(website.pages)("$url", (page) => {
  // Test page.html or page.document here.
});
```

## Consequences

- Fetching happens once before Jest runs.
- Tests do not need to perform network requests themselves.
- The fixture can later carry sitemap, environment, and provider metadata.
- Running website tests directly with Jest requires a Peakflow snapshot.
