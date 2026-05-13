#!/usr/bin/env node

/**
 * Frametric Wayfinder MCP Server
 *
 * Connects Claude to the Wayfinder charity intelligence API.
 * Exposes tools for searching, browsing, and enriching charity and nonprofit
 * data across multiple countries.
 *
 * Supported datasets:
 *   GB-EW (1) — England & Wales  |  US-IRS (2) — United States
 *   GB-SC (3) — Scotland         |  IE (4)     — Ireland
 *   CA (5)    — Canada           |  AU (6)     — Australia
 *
 * Environment variables:
 *   WAYFINDER_API_KEY  — Bearer token for the Wayfinder API (required)
 *   WAYFINDER_BASE_URL — API base URL (default: https://frametric.ai)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.WAYFINDER_API_KEY;
const BASE_URL = (process.env.WAYFINDER_BASE_URL || "https://frametric.ai").replace(/\/$/, "");

if (!API_KEY) {
  console.error("ERROR: WAYFINDER_API_KEY environment variable is required.");
  process.exit(1);
}

// --- Country → datasetId mapping -------------------------------------------

const DATASETS = {
  "GB":    1, "GB-EW": 1, "UK": 1, "ENGLAND": 1, "WALES": 1,
  "US":    2, "US-IRS": 2, "USA": 2, "UNITED STATES": 2,
  "GB-SC": 3, "SCOTLAND": 3, "SCO": 3,
  "IE":    4, "IRELAND": 4, "IRL": 4,
  "CA":    5, "CANADA": 5, "CAN": 5,
  "AU":    6, "AUSTRALIA": 6, "AUS": 6,
};

const COUNTRY_LABELS = {
  1: "England & Wales",
  2: "United States",
  3: "Scotland",
  4: "Ireland",
  5: "Canada",
  6: "Australia",
};

const AVAILABLE_DATASETS = new Set([1, 2]); // Currently populated with data

function resolveDataset(country) {
  if (!country) return 1; // Default to England & Wales
  const id = DATASETS[country.toUpperCase().trim()];
  if (!id) throw new Error(`Unknown country "${country}". Supported: GB/UK, US/USA, Scotland/GB-SC, Ireland/IE, Canada/CA, Australia/AU`);
  return id;
}

function datasetWarning(datasetId) {
  if (!AVAILABLE_DATASETS.has(datasetId)) {
    return `\n\n⚠️ Note: ${COUNTRY_LABELS[datasetId]} data is coming soon. Results may be limited or empty.`;
  }
  return "";
}

// --- HTTP helper -----------------------------------------------------------

async function wayfinder(path, params = {}) {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Wayfinder API ${res.status}: ${body}`);
  }

  return res.json();
}

// --- Formatting helpers ----------------------------------------------------

function fmtMoney(n, datasetId) {
  if (n == null) return "N/A";
  const symbol = datasetId === 2 ? "$" : datasetId === 6 ? "A$" : datasetId === 5 ? "C$" : "£";
  if (n >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${symbol}${(n / 1_000).toFixed(0)}K`;
  return `${symbol}${n}`;
}

function formatCharitySummary(c, datasetId = 1) {
  const parts = [
    `${c.charityName || c.name} (No. ${c.charityNumber || c.number})`,
    c.primarySector || c.sector ? `Sector: ${c.primarySector || c.sector}` : null,
    c.primarySubsector || c.subSector ? `Sub-sector: ${c.primarySubsector || c.subSector}` : null,
    c.latestIncome != null ? `Income: ${fmtMoney(c.latestIncome, datasetId)}` : null,
    c.latestExpenditure != null ? `Expenditure: ${fmtMoney(c.latestExpenditure, datasetId)}` : null,
    c.contactPostcode ? `Postcode: ${c.contactPostcode}` : null,
    c.contactWeb ? `Website: ${c.contactWeb}` : null,
    c.contactEmail ? `Email: ${c.contactEmail}` : null,
    c.regStatus ? `Status: ${c.regStatus}` : null,
  ];
  return parts.filter(Boolean).join(" | ");
}

// Country parameter shared across all tools
const countryParam = z
  .string()
  .optional()
  .describe("Country code: GB/UK (default), US/USA, Scotland/GB-SC, Ireland/IE, Canada/CA, Australia/AU");

// --- MCP Server ------------------------------------------------------------

const server = new McpServer({
  name: "wayfinder",
  version: "0.5.0",
});

// Tool 1: Search charities / nonprofits
server.tool(
  "charity_search",
  `Search charities and nonprofits by name, registration number, or postcode/zip code. Covers England & Wales, United States, Scotland, Ireland, Canada, and Australia. Returns matching organisations with sector, income, expenditure, website, and contact details. Use exact=true for precise name matching when searching multiple organisations.`,
  {
    query: z.string().describe("Search term — organisation name, registration number, or postcode/zip"),
    country: countryParam,
    limit: z.number().optional().default(10).describe("Max results to return (default 10, max 50)"),
    exact: z.boolean().optional().default(false).describe("Use exact name matching. When true, query can be comma-separated names for batch search"),
  },
  async ({ query, country, limit, exact }) => {
    const datasetId = resolveDataset(country);
    const data = await wayfinder("/api/charity/search", {
      q: query,
      datasetId,
      limit: Math.min(limit || 10, 50),
      exact: exact ? "true" : undefined,
    });

    const results = Array.isArray(data) ? data : data.results || [];
    const region = COUNTRY_LABELS[datasetId];

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `No results found for "${query}" in ${region}.${datasetWarning(datasetId)}` }],
      };
    }

    const summaries = results.map((c, i) => `${i + 1}. ${formatCharitySummary(c, datasetId)}`);
    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}" in ${region}:\n\n${summaries.join("\n\n")}${datasetWarning(datasetId)}`,
        },
      ],
    };
  }
);

// Tool 2: Get full charity / nonprofit profile
server.tool(
  "charity_profile",
  `Get the full profile for a specific charity or nonprofit by its registration number. Returns detailed information including trustees, activities, contact details, and classification. Specify country if not England & Wales.`,
  {
    charityNumber: z.number().describe("Registration number (e.g., Charity Commission number, EIN)"),
    country: countryParam,
  },
  async ({ charityNumber, country }) => {
    const datasetId = resolveDataset(country);
    const data = await wayfinder(`/api/charity/${charityNumber}`, { datasetId });
    return {
      content: [
        {
          type: "text",
          text: `Profile for ${COUNTRY_LABELS[datasetId]} registration ${charityNumber}:\n\n${JSON.stringify(data, null, 2)}${datasetWarning(datasetId)}`,
        },
      ],
    };
  }
);

// Tool 3: Get financial history
server.tool(
  "charity_financials",
  `Get financial history for a charity or nonprofit — income and expenditure over multiple years. Useful for trend analysis, due diligence, and understanding financial trajectory. Specify country if not England & Wales.`,
  {
    charityNumber: z.number().describe("Registration number (e.g., Charity Commission number, EIN)"),
    country: countryParam,
  },
  async ({ charityNumber, country }) => {
    const datasetId = resolveDataset(country);
    const data = await wayfinder(`/api/charity/${charityNumber}/financials`, { datasetId });
    return {
      content: [
        {
          type: "text",
          text: `Financial history for ${COUNTRY_LABELS[datasetId]} registration ${charityNumber}:\n\n${JSON.stringify(data, null, 2)}${datasetWarning(datasetId)}`,
        },
      ],
    };
  }
);

// Tool 4: Browse charities / nonprofits
server.tool(
  "charity_browse",
  `Browse charities and nonprofits with pagination. Supports filtering by proprietary Wayfinder sector taxonomy (sectorId and subSector). Returns a paginated list of organisations with total count. Useful for exploring datasets or building large prospect lists filtered by sector. Specify country to browse a specific national dataset.`,
  {
    country: countryParam,
    limit: z.number().optional().default(20).describe("Results per page (default 20, max 50)"),
    offset: z.number().optional().default(0).describe("Pagination offset"),
    sectorId: z.number().optional().describe("Filter by Wayfinder proprietary sector ID (numeric)"),
    subSector: z.union([z.number(), z.string()]).optional().describe("Filter by sub-sector — accepts slug (e.g. 'youth-clubs') or numeric ID"),
  },
  async ({ country, limit, offset, sectorId, subSector }) => {
    const datasetId = resolveDataset(country);
    const data = await wayfinder("/api/charity/browse", {
      datasetId,
      limit: Math.min(limit || 20, 50),
      offset: offset || 0,
      ...(sectorId != null ? { sectorId } : {}),
      ...(subSector != null ? { subSector } : {}),
    });

    const results = Array.isArray(data) ? data : data.results || [];
    const summaries = results.map((c, i) => `${offset + i + 1}. ${formatCharitySummary(c, datasetId)}`);
    const region = COUNTRY_LABELS[datasetId];
    const filterNote = sectorId != null ? ` (sector ${sectorId}${subSector != null ? `, sub-sector ${subSector}` : ""})` : "";
    const total = data.total != null ? ` of ${data.total} total` : "";

    return {
      content: [
        {
          type: "text",
          text: `${region}${filterNote} — entries ${offset + 1}–${offset + results.length}${total}:\n\n${summaries.join("\n\n")}${datasetWarning(datasetId)}`,
        },
      ],
    };
  }
);

// Tool 5: Get charity classifications
server.tool(
  "charity_classifications",
  `Get detailed classification data for a charity — areas of activity, beneficiary groups, operating methods, and (where available) Wayfinder's proprietary AI-enriched sector taxonomy. The response now includes 'sector' and 'sub_sector' fields alongside existing Charity Commission classification codes.`,
  {
    charityNumber: z.number().describe("Registration number (e.g., Charity Commission number, EIN)"),
    country: countryParam,
  },
  async ({ charityNumber, country }) => {
    const datasetId = resolveDataset(country);
    const data = await wayfinder(`/api/charity/${charityNumber}/classifications`, { datasetId });

    // Surface proprietary sector taxonomy prominently if present
    const sectorNote = data.sector
      ? `\n🏷️ Wayfinder Sector Taxonomy:\n  Sector: ${data.sector.sectorName || data.sector.sectorId} (ID: ${data.sector.sectorId})\n  Sub-sector: ${data.sector.subSectorName || data.sector.subSectorId} (ID: ${data.sector.subSectorId})\n  Model version: ${data.sector.modelVersion}\n`
      : "";

    return {
      content: [
        {
          type: "text",
          text: `Classifications for ${COUNTRY_LABELS[datasetId]} registration ${charityNumber}:${sectorNote}\n${JSON.stringify(data, null, 2)}${datasetWarning(datasetId)}`,
        },
      ],
    };
  }
);

// Tool 6: Get proprietary sector taxonomy for a charity
server.tool(
  "charity_sector",
  `Get Wayfinder's proprietary AI-enriched sector taxonomy classification for a specific charity. Returns sectorId, sectorName, subSectorId, subSectorName, and modelVersion. Returns a not-found error if the charity has not been classified yet. This is Frametric's moat data — not available via generic Charity Commission API wrappers.`,
  {
    charityNumber: z.number().describe("Registration number (e.g., Charity Commission number, EIN)"),
    country: countryParam,
  },
  async ({ charityNumber, country }) => {
    const datasetId = resolveDataset(country);
    const data = await wayfinder(`/api/charity/${charityNumber}/sector`, { datasetId });
    const region = COUNTRY_LABELS[datasetId];

    const lines = [
      `Sector taxonomy for ${region} registration ${charityNumber}:`,
      ``,
      `  Sector:      ${data.sectorName} (ID: ${data.sectorId})`,
      `  Sub-sector:  ${data.subSectorName} (ID: ${data.subSectorId})`,
      `  Model:       ${data.modelVersion}`,
    ];

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// Tool 8: Get charity benchmarks
server.tool(
  "charity_benchmarks",
  `Get benchmarking data comparing a charity against similar organisations. Returns financial and operational comparisons within the same sector and size bracket. Useful for due diligence, competitive analysis, and understanding relative performance.`,
  {
    charityNumber: z.number().describe("Registration number (e.g., Charity Commission number, EIN)"),
    country: countryParam,
  },
  async ({ charityNumber, country }) => {
    const datasetId = resolveDataset(country);
    const data = await wayfinder(`/api/charity/${charityNumber}/benchmarks`, { datasetId });
    return {
      content: [
        {
          type: "text",
          text: `Benchmarks for ${COUNTRY_LABELS[datasetId]} registration ${charityNumber}:\n\n${JSON.stringify(data, null, 2)}${datasetWarning(datasetId)}`,
        },
      ],
    };
  }
);

// --- Start -----------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
