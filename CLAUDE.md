# Enhancer for Tesco

Browser extension (MV3, Chrome + Firefox) that scores Tesco product tiles and, optionally, restyles them as cards.

## Data reference

- `research/tesco-api.ts`: types for Tesco's category API response, with comments mapping each field to the tile DOM. Read this instead of querying the JSON.
- `research/fixtures/ice-cream-api.json`: sample API response. `npm run types:api` regenerates the types from it.
- `research/tesco-taxonomy.ts`: types for the All Departments menu response (`research/fixtures/categories.json`, 3 levels, no URLs). `npm run types:taxonomy` regenerates it.
- `research/fixtures/ice-cream.html`: saved category page (no extension) used by tests and screenshots.
- The extension reads the DOM only; it never calls or intercepts the API.

## Testing

- `npm test`: parser tests plus JSDOM tests against the saved page. `npm run lint`: web-ext lint.
- `node research/fixture_shot.js [fixture] [out-prefix] [restyle=1|0]`: renders the saved page with the extension and writes `-grid`, `-list`, `-tile` and `-cc` screenshots.
- tesco.com blocks automated browsers (Akamai "Access Denied"); use the saved page instead of the live site.
