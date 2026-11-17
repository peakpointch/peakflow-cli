# ADR-0005: Store page snapshots in separate files

Status: Accepted

## Decision

Each successfully fetched page is stored as a separate HTML file inside the
temporary `.peakflow` test-run directory. The JSON manifest stores page
metadata and a relative file path rather than embedding the HTML content.

The serialized manifest entry is represented by `SerializedPageSnapshot`.
The runtime fixture is represented by `PageSnapshot` and is created by
`getWebsiteSnapshot()`.

`PageSnapshot.html` reads its HTML file lazily and caches the returned string.
`PageSnapshot.document` parses that cached HTML lazily and caches the Cheerio
document. Loading the website snapshot therefore reads only the manifest;
page HTML is read only when a test accesses that page's HTML or document.

The manifest format uses provisional semver `0.1.0` until the format has
stabilized.

## Consequences

- Large websites do not require every HTML document to be loaded when the
  fixture is created.
- Bounded capture concurrency limits the amount of fetched HTML held during
  capture.
- Repeated access to a page does not reread or reparse its HTML.
- Tests that intentionally access every page's HTML can still load the whole
  site into memory.
- Cleaning up the temporary test-run directory removes the manifest and all
  page files together.
- Future manifest changes must preserve the distinction between serialized
  page entries and runtime page fixtures.
