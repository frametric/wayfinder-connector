# Wayfinder Connector

Connect Claude to **Frametric Wayfinder** — the charity and nonprofit intelligence platform covering 2 million+ organisations across six countries.

## Supported Countries

| Country | Status | Organisations |
|---------|--------|---------------|
| England & Wales | Live | 170,000+ charities |
| United States | Live | 1.8M+ nonprofits (IRS) |
| Scotland | Coming soon | OSCR registered charities |
| Ireland | Coming soon | CRA registered charities |
| Canada | Coming soon | CRA registered charities |
| Australia | Coming soon | ACNC registered charities |

## What it does

This plugin gives Claude direct access to Wayfinder's data through six tools:

- **charity_search** — Search charities and nonprofits by name, number, website domain, or postcode/zip. Supports fuzzy matching, batch exact-matching, and charity number lookups.
- **charity_profile** — Get full profiles including trustees, activities, and classification
- **charity_financials** — Pull multi-year income and expenditure history
- **charity_browse** — Paginated browsing of national charity datasets
- **charity_classifications** — Areas of activity, beneficiary groups, and operating methods
- **charity_benchmarks** — Compare a charity against similar organisations in its sector

Plus a **charity-research skill** that teaches Claude best practices for charity research, CRM enrichment, grantmaker identification, and financial analysis.

## What's new in v0.4.0

- **Website/domain search** — Match charities by their website domain, ideal for CRM enrichment workflows
- **Fuzzy name matching** — Partial and abbreviated names now return results (e.g. "Naomi House" matches "Naomi House & Jacksplace", "SSAFA" matches the full registered name)
- **Charity number search** — Search directly by charity registration number
- **Match confidence scores** — API returns confidence scores for search results, enabling automated enrichment pipelines
- **Improved US coverage** — 1.8M+ IRS-registered nonprofits now searchable

See the [CHANGELOG](CHANGELOG.md) for full details.

## Setup

### 1. Get a Wayfinder API key

Sign up at [frametric.ai](https://frametric.ai) and generate an API key from the [Developers page](https://frametric.ai/developers).

### 2. Set your API key

Set the `WAYFINDER_API_KEY` environment variable:

```bash
export WAYFINDER_API_KEY="fm_your_api_key_here"
```

### 3. Install the plugin

Install the `.plugin` file in Claude Desktop or Cowork. The MCP server starts automatically when Claude needs charity data.

## Usage examples

Once installed, just ask Claude:

- "Search for cancer research charities in the UK"
- "Find US nonprofits working in education"
- "Look up charity number 1045315"
- "What are the financials for the Wellcome Trust?"
- "Compare the top 10 children's charities by income"
- "Enrich these company records with Wayfinder data"
- "Find charities with the domain cancerresearchuk.org"
- "Find grantmaker charities in Australia" (coming soon)

## Rate limits

Rate limits are based on your Wayfinder subscription tier:

| Tier | Requests/hour |
|------|---------------|
| Free | 100 |
| Pioneer / Pro | 500 |

## Requirements

- Node.js 18+
- A valid Wayfinder API key ([sign up](https://frametric.ai))

## About Wayfinder

[Wayfinder](https://frametric.ai/wayfinder) is built by Frametric. It provides structured, searchable data on charities and nonprofits — including sector classification, financial history, trustee information, and contact details — across multiple national registries.
