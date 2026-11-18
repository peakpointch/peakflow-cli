# Complete link-audit test matrix

## Summary

Expand the temporary `testLinks` audit into a deterministic static link audit that validates URL syntax, captured internal targets, and fragment targets without making arbitrary network requests.

Cross-page checks will use a prebuilt lookup index. No deferred “wait until the target page’s loop iteration” state is needed.

## Link categories and exact behavior

### 1. Empty links

Inspect every `<a href>` element.

Fail with `link-href-empty` when:

- `href=""`
- `href` contains only whitespace

Treat these as valid:

- `<a>` without an `href` — ignored because it may be a JavaScript control
- `href="#"` — valid “scroll to top”

Trim surrounding whitespace before validation. Keep the trimmed value in evidence.

### 2. Normal same-page links

For ordinary relative, root-relative, and absolute HTTP(S) links:

- Resolve the URL against `page.finalUrl`.
- Remove the fragment for target-page lookup.
- A link is valid when the resolved target URL matches the current captured page.
- Query strings remain significant.
- Path normalization comes from the standard `URL` class.

Examples:

- `about`
- `/about`
- `../about`
- `https://example.com/about`
- `?section=team`

No network request is made for these links.

### 3. Same-page scroll links

For links whose resolved target page is the current page:

- `#section`
- `/current-page#section`
- `current-page#section`
- `https://same-origin/current-page#section`

Decode the fragment once and look for an exact, case-sensitive `id` match.

Fail with `link-fragment-missing` when:

- The fragment is non-empty.
- No element has the matching `id`.

Treat `href="#"` as valid and do not require an empty ID.

Legacy `name` anchors are out of scope for this first implementation.

### 4. Cross-page internal links

For same-origin links whose target URL differs from the current page:

- Build an index of captured pages before registering tests.
- Index both each page’s requested URL and final URL.
- Use origin + pathname + search as the lookup key.
- Do not use pathname alone because different origins or query strings can represent different documents.

For a captured target page:

- A plain link is valid.
- A link with a fragment is checked against the target page’s IDs.
- Missing IDs fail with `link-fragment-missing`.
- Missing target pages fail with `link-target-missing` in sitemap mode.

### 5. Pages that failed to fetch

If an internal target URL matches an entry in `website.errors`:

- Fail with `link-target-unverified`.
- Include the target URL and fetch error in the evidence.
- Do not report it as a missing fragment, because the target document was unavailable.

### 6. Single-page mode

`testLinksPage(page)` only has one page and therefore checks:

- Empty hrefs
- Malformed hrefs
- Same-page fragments

It must not claim that an uncaptured cross-page target is broken.

`testLinks(website)` performs the full cross-page behavior because it has the complete snapshot and fetch-error list.

### 7. External links

For HTTP(S) links to another origin:

- Validate URL syntax only.
- Do not make HEAD/GET requests.
- Do not attempt to validate the external fragment.
- Do not fail because the external page was not captured.

### 8. Relative and protocol-relative links

Resolve all relative forms against the source page’s final URL:

- `about`
- `./about`
- `../about`
- `/about`
- `//other.example/about`
- `?tab=details`
- `#section`

Protocol-relative links inherit the source protocol and are treated as external or internal after resolution.

### 9. Mail and telephone links

Allow and syntax-check:

- `mailto:`
- `tel:`

The link audit does not duplicate the Swiss phone formatting rules. `testPhoneLinks` remains responsible for telephone-number validity and display matching.

### 10. Non-navigation schemes

Ignore, rather than fail:

- `javascript:`
- `data:`
- `blob:`
- Other unsupported schemes

These are not ordinary navigational links and should be handled by separate security or accessibility audits.

### 11. Malformed URLs

Fail with `link-href-invalid` when URL resolution fails, including malformed absolute URLs or invalid encoded fragments.

Every finding retains:

- Rule ID
- Source URL
- Trimmed href
- Source HTML
- Line and column
- Expected target/ID where applicable

Repeated links are checked and reported independently.

## Public API changes

Keep the existing public functions:

```ts
inspectLinks(page)
testLinksPage(page, options?)
testLinks(website, options?)
```

Add semantic, nested configuration rather than separate relative/absolute URL
switches. Relative and absolute URLs are input forms; the audit classifies
them by their resolved destination.

All checks are enabled by default:

```ts
testLinks(website);
```

The configuration accepts either `true`/`false` or a detailed object:

```ts
testLinks(website, {
  checks: {
    href: true,
    navigation: true,
    scroll: {
      samePage: true,
      crossPage: false,
      external: true,
    },
  },
});
```

Disabling a whole category is concise:

```ts
testLinks(website, {
  checks: {
    href: false,
    navigation: false,
    scroll: false,
  },
});
```

Detailed checks are:

- `href.empty` — empty or whitespace-only hrefs.
- `href.invalid` — malformed URL references or invalid encoded fragments.
- `navigation.samePage` — links without fragments targeting the current page.
- `navigation.crossPage` — internal links without fragments targeting another
  captured page.
- `navigation.external` — HTTP(S) links to another origin, checked for syntax
  only.
- `scroll.samePage` — fragments targeting the current page.
- `scroll.crossPage` — fragments targeting another captured internal page.
- `scroll.external` — external HTTP(S) fragments, checked for syntax only.

The same `checks` object is accepted by `testLinksPage` and `testLinks`.
Same-page checks work directly with `testLinksPage`; cross-page checks only
take effect through `testLinks(website)`, which has the complete page snapshot.

Internally:

- Add a website link-index/context used by `testLinks(website)`.
- Keep `testLinksPage` backward-compatible for single-page usage.
- Do not expose the lookup helper as public API unless tests require it.

Add these rule IDs:

```ts
"link-href-empty"
"link-href-invalid"
"link-target-missing"
"link-target-unverified"
"link-fragment-missing"
```

## Test plan

Add tests for:

- Empty and whitespace hrefs
- Missing href ignored
- `href="#"` accepted
- Absolute, root-relative, path-relative, query-only, and protocol-relative URLs
- Same-page existing and missing fragments
- Percent-encoded fragment IDs
- Cross-page fragment found in another captured page
- Cross-page fragment missing from another captured page
- Cross-page target absent in sitemap mode
- Cross-page target represented in `website.errors`
- Single-page mode skipping uncaptured cross-page verification
- External links validated without network access
- `mailto:` and `tel:` accepted
- `javascript:` and `data:` ignored
- Malformed URL references
- Source location and evidence preservation

Acceptance criteria:

- `testLinks(website)` checks captured cross-page targets.
- `testLinksPage(page)` never reports an uncaptured page as broken.
- Sitemap-mode missing targets fail.
- Fetch failures produce a distinct unverified failure.
- No link audit test performs arbitrary network requests.
- Existing phone-link behavior remains unchanged.
