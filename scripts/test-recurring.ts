import { nextOccurrenceJst } from "../src/lib/recurring";
const from = new Date("2026-07-04T06:00:00Z"); // JST 15:00
const cases: Array<[string, string]> = [
  ["18:00", "2026-07-04T09:00:00.000Z"],
  ["09:00", "2026-07-05T00:00:00.000Z"],
  ["15:00", "2026-07-05T06:00:00.000Z"],
];
for (const [t, expect] of cases) {
  const got = nextOccurrenceJst(t, from).toISOString();
  console.log(`${t} -> ${got} ${got === expect ? "OK" : "NG (expect " + expect + ")"}`);
}
try { nextOccurrenceJst("25:00"); console.log("invalid: NG"); } catch { console.log("invalid rejected: OK"); }
