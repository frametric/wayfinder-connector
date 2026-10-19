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
 * The key (never printed, never on argv):
 *   WAYFINDER_API_KEY  — a Wayfinder key (fm_…), if the environment really holds one; else
 *   WAYFINDER_KEY_FILE — a file holding it, mode 0600 (default: ~/.frametric/wayfinder-connector.key)
 *   WAYFINDER_BASE_URL — API base URL (default: https://frametric.ai)
 * The Claude desktop app does not read ~/.zshrc, so "${WAYFINDER_API_KEY}" in .mcp.json can arrive
 * UNEXPANDED; the server used to send that literal text and every call came back 401 "Invalid or
 * expired API key" (19 Oct 2026). It now refuses to start, naming the cause, instead.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KEY_FILE = process.env.WAYFINDER_KEY_FILE || join(homedir(), ".frametric", "wayfinder-connector.key");
const looksLikeKey = (k) => typeof k === "string" && /^fmc?_[A-Za-z0-9_-]{16,}$/.test(k.trim());

function refuse(why) {
  console.error(`Wayfinder connector refused to start: ${why}`);
  process.exit(1);
}

function loadKey() {
  const env = process.env.WAYFINDER_API_KEY;
  if (looksLikeKey(env)) return env.trim();
  let st = null;
  try { st = statSync(KEY_FILE); } catch { /* no key file */ }
  if (st) {
    if ((st.mode & 0o077) !== 0) refuse(`${KEY_FILE} can be read by others (mode ${(st.mode & 0o777).toString(8)}); run chmod 600 on it.`);
    const k = readFileSync(KEY_FILE, "utf8").trim();
    if (looksLikeKey(k)) return k;
    refuse(`${KEY_FILE} does not hold a Wayfinder key (fm_...).`);
  }
  const why = !env ? "WAYFINDER_API_KEY is not set"
    : env.includes("${") ? "WAYFINDER_API_KEY arrived as an unexpanded placeholder (the app does not read your shell profile)"
    : "WAYFINDER_API_KEY is not a Wayfinder key (fm_...)";
  refuse(`${why}, and there is no key file at ${KEY_FILE}. Put the connector's key there (chmod 600).`);
}

const API_KEY = loadKey();
const BASE_URL = (process.env.WAYFINDER_BASE_URL || "https://frametric.ai").replace(/\/$/, "");

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
  version: "0.3.0",
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
  `Browse charities and nonprofits with pagination. Returns a paginated list of organisations. Useful for exploring datasets or building large prospect lists. Specify country to browse a specific national dataset.`,
  {
    country: countryParam,
    limit: z.number().optional().default(20).describe("Results per page (default 20, max 50)"),
    offset: z.number().optional().default(0).describe("Pagination offset"),
  },
  async ({ country, limit, offset }) => {
    const datasetId = resolveDataset(country);
    const data = await wayfinder("/api/charity/browse", {
      datasetId,
      limit: Math.min(limit || 20, 50),
      offset: offset || 0,
    });

    const results = Array.isArray(data) ? data : data.results || [];
    const summaries = results.map((c, i) => `${offset + i + 1}. ${formatCharitySummary(c, datasetId)}`);
    const region = COUNTRY_LABELS[datasetId];

    return {
      content: [
        {
          type: "text",
          text: `${region} — entries ${offset + 1}–${offset + results.length}:\n\n${summaries.join("\n\n")}${datasetWarning(datasetId)}`,
        },
      ],
    };
  }
);

// Tool 5: Get charity classifications
server.tool(
  "charity_classifications",
  `Get detailed classification data for a charity — areas of activity, beneficiary groups, and operating methods. Useful for understanding exactly what a charity does and who it serves.`,
  {
    charityNumber: z.number().describe("Registration number (e.g., Charity Commission number, EIN)"),
    country: countryParam,
  },
  async ({ charityNumber, country }) => {
    const datasetId = resolveDataset(country);
    const data = await wayfinder(`/api/charity/${charityNumber}/classifications`, { datasetId });
    return {
      content: [
        {
          type: "text",
          text: `Classifications for ${COUNTRY_LABELS[datasetId]} registration ${charityNumber}:\n\n${JSON.stringify(data, null, 2)}${datasetWarning(datasetId)}`,
        },
      ],
    };
  }
);

// Tool 6: Get charity benchmarks
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
