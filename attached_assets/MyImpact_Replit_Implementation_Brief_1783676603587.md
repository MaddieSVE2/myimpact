# My Impact: discoverability, trust and conversion improvements

Implementation brief for Replit

Prepared: 10 July 2026

## Purpose

Improve the public My Impact website at `https://myimpact.uk` so that:

- public pages can be crawled and indexed;
- search engines and AI systems can understand the product more easily;
- individuals can quickly understand what the tool does;
- organisational buyers have a clear route through the site;
- claims accurately reflect how the data and methodology work;
- private, account and application screens remain excluded from indexing.

Do not deploy these changes automatically. Implement them in the Replit project, run the checks in this brief, and provide a clear summary of changed files for review.

## Important current findings

The live site was reviewed on 10 July 2026. At that point:

1. `https://myimpact.uk/robots.txt` contained:

   ```text
   User-agent: *
   Disallow: /
   ```

2. The homepage and `/about` contained:

   ```html
   <meta name="robots" content="noindex, nofollow">
   ```

3. `https://myimpact.uk/sitemap.xml` returned `Not Found`.
4. Public pages had the generic title `My Impact`.
5. The homepage had no meta description, canonical link or JSON-LD structured data.
6. The organisational proposition appeared well below the main consumer call to action and did not have a prominent route in the main navigation.

The crawl and index blocks are the first priority. Google documents that `noindex` prevents a page from appearing in Google Search. It may also skip JavaScript rendering when `noindex` is present in the original HTML, so do not rely on client-side JavaScript to remove the tag after the page loads.

Relevant guidance:

- https://developers.google.com/search/docs/crawling-indexing/block-indexing
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- https://developers.google.com/search/docs/appearance/structured-data/sd-policies

## Priority 1: make public pages crawlable

### Replace `robots.txt`

Replace the global block with:

```text
User-agent: *
Allow: /

Sitemap: https://myimpact.uk/sitemap.xml
```

Do not use `robots.txt` as the main way to protect personal or account information. Authenticated routes must remain protected through authentication and access controls.

### Apply route-specific robots metadata

Public marketing and information pages should use:

```html
<meta name="robots" content="index, follow">
```

Apply `noindex, nofollow` to login, account, dashboard and private application screens. Review the actual route structure before implementing. Likely private or functional routes include:

- `/login`
- authenticated personal dashboards and profiles;
- authenticated organisation dashboards;
- account settings;
- private reports or records;
- intermediate wizard and calculation states that should not appear in search.

Do not add private URLs to the sitemap.

### Generate `sitemap.xml`

Generate a valid XML sitemap using the project's normal build process. Include only canonical, public pages that return HTTP 200.

Initial candidate URLs:

```text
https://myimpact.uk/
https://myimpact.uk/about
https://myimpact.uk/methodology
https://myimpact.uk/whats-new
https://myimpact.uk/suggestions
https://myimpact.uk/contact
https://myimpact.uk/org/demo
```

Check whether `/suggestions` and `/org/demo` are appropriate landing pages for organic visitors before including them. Exclude login, registration completion, dashboards, wizard states, privacy and terms pages unless there is a clear reason to index them.

## Priority 2: add unique metadata

Metadata must be present in the initial HTML response for each public route. If the project is a client-rendered single-page application, use the framework's supported prerendering, server rendering or static generation approach rather than inserting all metadata after load.

### Homepage

```html
<title>My Impact | Calculate the Social Value You Create</title>
<meta
  name="description"
  content="Calculate the social value of your volunteering, caring and community activity. Build a personal impact record for CVs, applications and more."
>
<link rel="canonical" href="https://myimpact.uk/">
```

Add equivalent Open Graph and social-sharing metadata:

```html
<meta property="og:type" content="website">
<meta property="og:site_name" content="My Impact">
<meta property="og:title" content="My Impact | Calculate the Social Value You Create">
<meta property="og:description" content="Calculate the social value of your volunteering, caring and community activity. Build a personal impact record for CVs, applications and more.">
<meta property="og:url" content="https://myimpact.uk/">
<meta property="og:image" content="[INSERT ABSOLUTE URL FOR APPROVED SOCIAL-SHARING IMAGE]">
<meta name="twitter:card" content="summary_large_image">
```

Do not invent an image URL. Use an approved, publicly accessible My Impact social-sharing image with a suitable aspect ratio and meaningful alt text where the image is displayed on the page.

### Suggested page titles

Use unique titles and descriptions for every public page. Suggested titles:

- `/about`: `About My Impact | Making Hidden Contributions Visible`
- `/methodology`: `How My Impact Calculates Social Value`
- `/whats-new`: `My Impact Updates | New Features and Improvements`
- `/suggestions`: `Ideas for Community Action and Volunteering | My Impact`
- `/org/demo`: `My Impact for Organisations | Example Dashboard`

Write a specific meta description for each route based on its visible content. Avoid using the same description across the site.

## Priority 3: add homepage structured data

Add the following JSON-LD to the homepage. Adapt the implementation to the project's component and metadata architecture, but preserve the meaning.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://myimpact.uk/#website",
      "url": "https://myimpact.uk/",
      "name": "My Impact",
      "description": "A free tool for calculating and recording the social value of volunteering, caring and community activity."
    },
    {
      "@type": "WebApplication",
      "@id": "https://myimpact.uk/#application",
      "name": "My Impact",
      "url": "https://myimpact.uk/",
      "applicationCategory": "LifestyleApplication",
      "operatingSystem": "Any",
      "isAccessibleForFree": true,
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "GBP"
      },
      "description": "Calculate the social value of volunteering, caring and community activity and create a personal impact record."
    }
  ]
}
</script>
```

Do not add an `Organization`, `provider`, legal name or ownership claim until the current legal entity and approved wording have been confirmed. Structured data must describe information that is accurate and visible to users. It does not guarantee rankings, enhanced search results or inclusion in AI-generated answers.

## Priority 4: correct trust-sensitive wording

### Replace the claim that the personal record is verified

The homepage currently describes the output as a “verified, quantified record”. Activity information is self-reported, so `verified` should not be used unless a genuine verification process applies to the individual record.

Replace that section with:

#### Heading

```text
Turn your contribution into evidence.
```

#### Body copy

```text
My Impact gives you a structured, quantified record of the time you contribute and the outcomes you support. Use it to explain your experience in CVs, applications, funding conversations and impact reports.
```

### Review the “Real stories” section

The current section uses named people, locations, quotations and precise social value figures. This presentation implies that they are genuine customer testimonials.

Before deployment, confirm whether every story is:

- from a genuine user;
- quoted accurately;
- supported by the underlying calculation;
- covered by documented permission to publish the name, location and quotation.

If they are illustrative or composite examples, change the heading to:

```text
Illustrative examples
```

Add this explanation:

```text
These examples show how different forms of contribution could be recorded and valued using My Impact. They are illustrative rather than individual customer testimonials.
```

Do not describe illustrative examples as real stories.

### Check the integration claim

The organisation section currently says that data “feeds directly into SVE for SROI analysis”. Retain this only if the live product currently supports that direct data flow. Otherwise use a more accurate approved description, such as:

```text
Use your My Impact data as part of wider reporting and SROI analysis.
```

## Priority 5: strengthen the organisational route

The main navigation currently prioritises `Log in` and `Calculate my impact`. Add a visible text link for organisational buyers:

```text
For organisations
```

For the initial implementation, this can link to the existing organisation section using a stable anchor such as:

```text
/#for-organisations
```

Add the corresponding `id="for-organisations"` to the section.

Under the main consumer calls to action, add:

```text
Measuring the impact of a group or programme? See how My Impact works for organisations.
```

Link the final sentence to `/#for-organisations`.

A future phase should create a dedicated `/organisations` landing page explaining audiences, use cases, implementation, reporting, methodology, onboarding and the next step before asking someone to register. Do not build this page as part of the current technical fix unless it is separately approved.

## Priority 6: add a visible FAQ

Add a concise FAQ near the bottom of the homepage. The questions and answers must be visible in the page content. Use accessible accordion controls if the design calls for collapsible answers.

### What is My Impact?

My Impact is a free tool that helps individuals record volunteering, caring, environmental action and other positive contributions, then calculate an estimated social value using published evidence and Social Value Engine methodology.

### Which activities can I record?

You can record activities that support people, communities or the environment, including volunteering, informal caring, mentoring, peer support, community activity and environmental action.

### How is my social value calculated?

My Impact combines the information you enter with published UK evidence and financial proxy values. The methodology page should explain the sources, assumptions and limitations in plain language.

### Is My Impact free for individuals?

Yes. Individuals can calculate and record their personal impact without paying for access.

### Are My Impact figures independently verified?

Your activity record is based on the information you enter. Calculations use published evidence and Social Value Engine methodology, but the resulting figure is a social value estimate. It is not a financial entitlement or an independently assured SROI report.

### Can an organisation measure the collective impact of its people?

Yes. My Impact offers organisations a companion dashboard for understanding and reporting the combined activity of a group, programme or community. Only describe aggregation as anonymous or anonymised where the current data design supports that claim.

After adding the visible FAQ, add matching `FAQPage` JSON-LD. The structured answers must reproduce the meaning of the visible answers and must not include claims that are absent from the page.

## Accessibility and semantic checks

- Keep one clear `h1` on each public page.
- Use logical `h2` and `h3` nesting.
- Ensure navigation links have meaningful accessible names.
- Preserve the existing high-contrast option.
- Confirm keyboard access and visible focus states for navigation, calls to action, carousels and FAQ controls.
- Give meaningful images useful alt text. Decorative images should use empty alt attributes.
- Do not use colour alone to communicate status or meaning.
- Check the mobile layout at common widths, including 320, 375, 768 and 1024 pixels.

## Implementation sequence

1. Inspect the framework, routing and current metadata implementation.
2. Remove the global crawl and index blocks from public pages.
3. Add route-specific metadata controls so private routes remain excluded.
4. Generate and expose `sitemap.xml`.
5. Add unique titles, descriptions, canonical links and social metadata.
6. Add homepage `WebSite` and `WebApplication` JSON-LD.
7. Apply the approved copy corrections.
8. Add the `For organisations` navigation and section anchor.
9. Add the visible FAQ and matching FAQ structured data.
10. Run the verification checklist below.

## Verification checklist

Provide the results of each check before requesting deployment approval.

### Crawl and metadata

- `https://myimpact.uk/robots.txt` allows public crawling and references the sitemap.
- `https://myimpact.uk/sitemap.xml` returns valid XML and only contains canonical public URLs.
- Public pages contain `index, follow` in the initial HTML.
- Private and authenticated pages contain `noindex, nofollow` where appropriate.
- Every public page has a unique title and meta description.
- Every public page has a correct absolute canonical URL.
- Homepage Open Graph fields use absolute URLs.

### Structured data

- JSON-LD is valid JSON.
- Structured data reflects visible, accurate page content.
- The homepage passes the Schema Markup Validator.
- Supported markup is checked with Google's Rich Results Test, while recognising that `WebApplication` is primarily semantic markup and may not produce a dedicated Google rich result.

Validation tools:

- https://validator.schema.org/
- https://search.google.com/test/rich-results

### Content and trust

- No self-reported record is described as independently verified.
- Stories are either documented customer stories with permission or clearly labelled illustrative examples.
- The SVE integration wording matches current functionality.
- The methodology page explains sources, assumptions and limitations.
- The organisational aggregation wording matches the actual privacy and data model.

### UX and accessibility

- `For organisations` is visible in the main navigation.
- The organisation link reaches the correct section.
- All primary calls to action work.
- Keyboard navigation and focus states work.
- No horizontal overflow occurs at the agreed mobile widths.
- The high-contrast option still works.
- Run the project's existing tests, linting and production build.

## Expected Replit handover

When implementation is complete, return:

1. a concise summary of what changed;
2. the list of files changed;
3. any assumptions made;
4. any claims or wording that still require confirmation;
5. results from tests, linting and the production build;
6. screenshots or previews of the homepage at desktop and mobile widths;
7. confirmation that no deployment has been performed.

