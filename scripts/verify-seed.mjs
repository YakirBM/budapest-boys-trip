#!/usr/bin/env node
/**
 * Seed verification (docs/09 §Verification checklist after seeding).
 * Reads .env.local, counts rows via the REST API with the service-role key
 * (RLS would deny reads as anon), and compares against expected counts.
 * Idempotency probe: re-running seed.sql must not change counts.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}

const EXPECTED = {
  trips: 1,
  allowed_emails: 5,
  day_plans: 5,
  flights: 2,
  places: 17, // 5 anchors + 12 idea bank
  checklists: 7, // doc 06 template lists
  emergency_contacts: 3,
  transit_tickets: 6,
  transit_anchor_stations: 4,
  expenses: 0,
};

let failures = 0;
const counts = new Map();
async function countRows(table) {
  const res = await fetch(`${URL_}/rest/v1/${table}?select=*`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return Number((res.headers.get("content-range") ?? "*/0").split("/")[1] ?? 0);
}

for (const [table, expected] of Object.entries(EXPECTED)) {
  let count;
  try {
    count = await countRows(table);
  } catch (error) {
    console.log(`FAIL ${error instanceof Error ? error.message : table}`);
    failures += 1;
    continue;
  }
  counts.set(table, count);
  const ok = count === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${table}: ${count} (expected ${expected})`);
}

// Flight passenger rows are intentionally dynamic: the signup trigger creates
// one row per seeded flight for every real trip member. Validate the invariant
// instead of incorrectly requiring the pre-signup count of zero forever.
try {
  const memberCount = await countRows("trip_members");
  const passengerCount = await countRows("flight_passengers");
  const expectedPassengers = memberCount * (counts.get("flights") ?? 0);
  const ok = passengerCount === expectedPassengers;
  if (!ok) failures += 1;
  console.log(`${ok ? "OK  " : "FAIL"} flight_passengers: ${passengerCount} (expected ${expectedPassengers} from ${memberCount} members × ${counts.get("flights") ?? 0} flights)`);
} catch (error) {
  console.log(`FAIL ${error instanceof Error ? error.message : "dynamic passenger check"}`);
  failures += 1;
}

// Masked-refs scan: no full reservation/serial may exist anywhere in seedable data
const flightsRes = await fetch(`${URL_}/rest/v1/flights?select=booking_ref_masked`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const flights = flightsRes.ok ? await flightsRes.json() : [];
const leak = flights.some((f) => (f.booking_ref_masked ?? "").includes("13859993"));
if (leak) {
  console.log("FAIL flights contain a FULL reservation number");
  failures += 1;
}

console.log(failures === 0 ? "\nSEED VERIFICATION PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
