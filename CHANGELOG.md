# Changelog

All notable changes to the Wayfinder Connector are documented in this file.

## [0.5.0] - 2026-05-13

### Added
- **`charity_sector` tool** — new dedicated tool to fetch Wayfinder's proprietary AI-enriched sector taxonomy for a charity (`sectorId`, `sectorName`, `subSectorId`, `subSectorName`, `modelVersion`). Returns a clear error when no classification exists. phid:335.
- **Sector filtering on `charity_browse`** — new `sectorId` (numeric) and `subSector` (slug or id) parameters. Response includes total count via `X-Total-Count` header or `body.total`. phid:335.
- **Sector taxonomy in `charity_classifications`** — the `/classifications` endpoint now returns `sector` + `sub_sector` fields inline; existing fields preserved (backwards-compatible). phid:335.
- **E2E test suite** — `tests/sector-taxonomy.test.mjs` covering happy paths, 404 negative cases, sector filter combinations, pagination, and auth rejection.

### Updated
- Skill description and tool docs updated to surface sector-filterable browse and the new `charity_sector` tool.

## [0.4.0] - 2026-03-27

### Added
- **Website/domain search** — Search for charities by their website domain (e.g. `?website=naomihouse.org.uk`), enabling automated CRM enrichment workflows
- **Fuzzy name matching** — Partial and abbreviated charity names now return results. "Naomi House" correctly matches "Naomi House & Jacksplace", "SSAFA" matches the full registered name
- **Charity number search** — The search endpoint now accepts charity registration numbers directly
- **Match confidence scores** — Search results include a confidence score, allowing automated pipelines to set match thresholds

### Improved
- Updated organisation count to 2M+ across all supported datasets
- Better handling of edge cases in charity name matching
- Improved search relevance ranking

### Coming soon
- Scottish (OSCR) and Welsh charity datasets
- International charity support (non-UK/US registries)
- Browse endpoint pagination and income range filtering

## [0.3.0] - 2026-03-25

### Added
- Initial release of the Wayfinder Connector plugin
- Six tools: charity_search, charity_profile, charity_financials, charity_browse, charity_classifications, charity_benchmarks
- Charity research skill for Claude best practices
- Support for England & Wales (Charity Commission) and United States (IRS) datasets
- Pioneer and Pro tier rate limits
