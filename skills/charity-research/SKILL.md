---
name: charity-research
description: >
  Research and enrich charity and nonprofit data using Frametric Wayfinder. Use when the user asks to
  "search for charities", "find nonprofits", "charity data", "enrich company records", "look up a charity",
  "check charity finances", "find grantmakers", "charity intelligence", "prospect research", "nonprofit lookup",
  "US nonprofits", "Australian charities", "Canadian charities", "Irish charities", "Scottish charities",
  "sector taxonomy", "filter by sector", "sector classification",
  or needs charity/nonprofit registry data for any supported country.
metadata:
  version: "0.4.0"
---

# Charity & Nonprofit Research with Wayfinder

Use the Wayfinder MCP tools (`charity_search`, `charity_profile`, `charity_financials`, `charity_browse`, `charity_classifications`, `charity_benchmarks`) to research charities and nonprofits across multiple countries.

## Supported Countries

| Country | Code | Status | Currency | Registry |
|---------|------|--------|----------|----------|
| England & Wales | GB, UK | Live | £ | Charity Commission |
| United States | US, USA | Live | $ | IRS (990 filings) |
| Scotland | GB-SC, SCO | Coming soon | £ | OSCR |
| Ireland | IE, IRL | Coming soon | € | CRA |
| Canada | CA, CAN | Coming soon | C$ | CRA |
| Australia | AU, AUS | Coming soon | A$ | ACNC |

Default country is England & Wales (GB). Always specify `country` when the user asks about charities in other countries.

If a query returns no results for Scotland, Ireland, Canada, or Australia — the data may not be ingested yet. Let the user know it's coming soon.

## Available Tools

### charity_search
Search by name, registration number, or postcode/zip. Supports batch exact matching.

**When to use:** Finding charities, matching company names to registry records, verifying details.

**Tips:**
- For broad searches: `query: "cancer research"`
- For US nonprofits: `query: "Red Cross", country: "US"`
- For batch exact matching: `query: "Oxfam,RSPCA,NSPCC", exact: true`
- If no results, try alternative names (e.g., "MAP" → "Medical Aid for Palestinians")
- Professional bodies ARE often registered charities (e.g., CIOB, RICS)
- Filter by `regStatus: "Registered"` to exclude removed/merged entries

### charity_profile
Full profile by registration number. Returns trustees, activities, contact details, classification.

**When to use:** Deep research, due diligence, finding contact details.

**Note:** Specify `country` for non-UK charities — e.g., `charityNumber: 530196, country: "US"` for an IRS EIN.

### charity_financials
Multi-year income and expenditure history.

**When to use:** Trend analysis, financial health assessment, size comparison.

### charity_browse
Paginated browse through a national dataset. Supports filtering by Wayfinder's proprietary sector taxonomy.

**When to use:** Building prospect lists, exploring datasets by country, or filtering charities by sector.

**Sector filtering (new):**
- `sectorId: <number>` — filter to a specific Wayfinder sector (e.g., `sectorId: 3` for Health & Medical)
- `subSector: <slug-or-id>` — further filter to a sub-sector; accepts numeric ID or slug string
- Response includes total count (from `X-Total-Count` header or `body.total`)

### charity_sector *(new — phid:335)*
Wayfinder's proprietary AI-enriched sector taxonomy for a specific charity.

**When to use:** When you need the proprietary sector/sub-sector classification for a charity — not available via generic Charity Commission APIs. Returns `sectorId`, `sectorName`, `subSectorId`, `subSectorName`, and `modelVersion`. Returns an error if the charity has not been classified yet.

**Example:** `charityNumber: 202918` → `{ sectorId: 2, sectorName: "International Development", subSectorId: 5, subSectorName: "Development Aid", modelVersion: "v2.1" }`

### charity_classifications
Detailed classification data — areas of activity, beneficiary groups, and operating methods. Now also includes Wayfinder's proprietary sector taxonomy (`sector` + `sub_sector` inline, backwards-compatible).

**When to use:** Understanding exactly what a charity does, who it serves, and how it operates. Useful for matching charities to specific criteria.

### charity_benchmarks
Benchmarking data comparing a charity against similar organisations in its sector and size bracket.

**When to use:** Due diligence, competitive analysis, understanding relative performance, assessing financial health in context.

## Enrichment Pattern

When enriching CRM records with Wayfinder data:

1. Search for the charity using `charity_search` with the appropriate country
2. Pick the best match — prefer `regStatus: "Registered"` over "Removed"
3. Extract: registration number, sector, sub-sector, income, expenditure, postcode, website, domain
4. Format description as: `Charity No: X | Sector: Y | Sub-sector: Z | Income: £X | Expenditure: £X`
5. Update the CRM record with domain, website, postcode (zip), and description

## Common Gotchas

- Many UK charities have **two records** — an old Trust (Removed) and a new CIO (Registered). Always prefer the Registered one.
- Income/expenditure figures are from the **latest filed accounts**, not necessarily current year.
- Some charities have `null` for postcode, website, or email — normal for smaller organisations.
- US nonprofits use EIN (Employer Identification Number) instead of charity number.
- Currency differs by country — the tools handle this automatically (£, $, C$, A$, €).

For detailed sector information, see `references/sectors-guide.md`.
