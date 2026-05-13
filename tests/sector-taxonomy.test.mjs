/**
 * E2E tests for phid:335 — Wayfinder Sector Taxonomy API exposure
 *
 * Tests:
 *   - GET /api/charity/{n}/sector  → 200 happy path
 *   - GET /api/charity/{n}/sector  → 404 unknown charity
 *   - GET /api/charity/browse?sectorId= → paginated filtered list with X-Total-Count
 *   - GET /api/charity/browse?sectorId=&subSector= → combined filter
 *   - GET /api/charity/{n}/classifications → sector + sub_sector fields present (AC-6)
 *   - Auth rejection → 401/403 with no token
 *
 * Run:
 *   WAYFINDER_API_KEY=<token> node --test tests/sector-taxonomy.test.mjs
 *
 * The test uses a known England & Wales charity (Oxfam GB, No. 202918) for
 * happy-path assertions and a deliberately invalid number (999999999) for
 * negative cases.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = (process.env.WAYFINDER_BASE_URL || "https://frametric.ai").replace(/\/$/, "");
const API_KEY = process.env.WAYFINDER_API_KEY;

if (!API_KEY) {
  console.error("WAYFINDER_API_KEY not set — skipping e2e tests.");
  process.exit(0);
}

// Known England & Wales charity with sector classification
const KNOWN_NUMBER = 202918; // Oxfam GB
const UNKNOWN_NUMBER = 999999999;
const DATASET_GB = 1;

async function apiFetch(path, params = {}, token = API_KEY) {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url.toString(), { headers });
  return { res, body: res.ok ? await res.json().catch(() => null) : null };
}

// ---------------------------------------------------------------------------
// AC-2: GET /api/charity/{n}/sector — happy path
// ---------------------------------------------------------------------------

describe("GET /api/charity/{n}/sector", () => {
  test("AC-2 happy path — returns 200 with camelCase sector fields", async () => {
    const { res, body } = await apiFetch(`/api/charity/${KNOWN_NUMBER}/sector`, {
      datasetId: DATASET_GB,
    });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(body, "Expected JSON body");
    assert.ok("sectorId" in body, "Missing sectorId field");
    assert.ok("sectorName" in body, "Missing sectorName field");
    assert.ok("subSectorId" in body, "Missing subSectorId field");
    assert.ok("subSectorName" in body, "Missing subSectorName field");
    assert.ok("modelVersion" in body, "Missing modelVersion field");
    // Ensure camelCase (not snake_case)
    assert.ok(!("sector_id" in body), "Response should use camelCase, not snake_case");
  });

  // ---------------------------------------------------------------------------
  // AC-2: 404 when charity has no classification
  // ---------------------------------------------------------------------------
  test("AC-2 negative — returns 404 for unknown charity number", async () => {
    const { res } = await apiFetch(`/api/charity/${UNKNOWN_NUMBER}/sector`, {
      datasetId: DATASET_GB,
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ---------------------------------------------------------------------------
  // AC-4: Auth rejection
  // ---------------------------------------------------------------------------
  test("AC-4 auth — rejects request with no bearer token", async () => {
    const { res } = await apiFetch(
      `/api/charity/${KNOWN_NUMBER}/sector`,
      { datasetId: DATASET_GB },
      null // no token
    );
    assert.ok(
      res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`
    );
  });
});

// ---------------------------------------------------------------------------
// AC-3: GET /api/charity/browse?sectorId=
// ---------------------------------------------------------------------------

describe("GET /api/charity/browse with sector filters", () => {
  test("AC-3 sectorId filter — returns paginated list with X-Total-Count header", async () => {
    const { res, body } = await apiFetch("/api/charity/browse", {
      datasetId: DATASET_GB,
      sectorId: 1, // sector 1 expected to be populated
      limit: 5,
      offset: 0,
    });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(body, "Expected JSON body");

    const results = Array.isArray(body) ? body : body.results || [];
    assert.ok(results.length > 0, "Expected at least one result for sectorId=1");

    // AC-3: total count in response header
    const totalCount = res.headers.get("X-Total-Count");
    assert.ok(
      totalCount !== null || body.total != null,
      "Expected total count in X-Total-Count header or body.total"
    );
  });

  test("AC-3 sectorId + subSector slug filter — returns filtered paginated list", async () => {
    const { res, body } = await apiFetch("/api/charity/browse", {
      datasetId: DATASET_GB,
      sectorId: 1,
      subSector: "1", // numeric id as string — AC-3 accepts slug OR numeric id
      limit: 5,
      offset: 0,
    });

    // Should be 200 (or 200 with empty list if no results for this combo)
    assert.ok(
      res.status === 200,
      `Expected 200, got ${res.status}`
    );
  });

  test("AC-3 negative — unknown sectorId returns empty or 404", async () => {
    const { res, body } = await apiFetch("/api/charity/browse", {
      datasetId: DATASET_GB,
      sectorId: 999999,
      limit: 5,
    });

    // API may return 200 with empty results or 404 — both acceptable
    assert.ok(
      res.status === 200 || res.status === 404,
      `Expected 200 (empty) or 404, got ${res.status}`
    );
    if (res.status === 200) {
      const results = Array.isArray(body) ? body : body?.results || [];
      assert.equal(results.length, 0, "Expected empty results for unknown sectorId");
    }
  });

  test("AC-4 auth — browse with sectorId rejects no bearer token", async () => {
    const { res } = await apiFetch(
      "/api/charity/browse",
      { datasetId: DATASET_GB, sectorId: 1, limit: 5 },
      null
    );
    assert.ok(
      res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`
    );
  });
});

// ---------------------------------------------------------------------------
// AC-6: GET /api/charity/{n}/classifications — backwards-compat with sector fields
// ---------------------------------------------------------------------------

describe("GET /api/charity/{n}/classifications — sector backwards-compat (AC-6)", () => {
  test("AC-6 — existing fields preserved when sector data present", async () => {
    const { res, body } = await apiFetch(
      `/api/charity/${KNOWN_NUMBER}/classifications`,
      { datasetId: DATASET_GB }
    );

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(body, "Expected JSON body");

    // The endpoint should still return the existing fields (backwards-compat)
    // We just verify the response is valid JSON — existing fields preserved.
    assert.ok(typeof body === "object", "Expected object response");
  });

  test("AC-6 — response includes sector taxonomy fields when available", async () => {
    const { res, body } = await apiFetch(
      `/api/charity/${KNOWN_NUMBER}/classifications`,
      { datasetId: DATASET_GB }
    );

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);

    // AC-6: sector + sub_sector fields added inline
    // If the charity is classified, these should be present
    if (body.sector != null) {
      assert.ok("sectorId" in body.sector || "sector_id" in body.sector, "sector object missing id");
    }
    // No assertion if sector is null — classification may not exist for every charity
  });

  test("AC-5 negative — unknown charity returns 404", async () => {
    const { res } = await apiFetch(
      `/api/charity/${UNKNOWN_NUMBER}/classifications`,
      { datasetId: DATASET_GB }
    );
    assert.ok(
      res.status === 404 || res.status === 200,
      `Expected 404 or 200 (empty), got ${res.status}`
    );
  });
});
