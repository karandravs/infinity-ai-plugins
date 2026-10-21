// jev-client.mjs — the ONE place the planner talks to the judgment service.
//
// It exists so the call budget is measurable across modules: the classifier (taxonomy-lib) and the
// composer (plan-lib) share one counter, so a test can assert "one judgment call per question"
// instead of trusting each module's own tally. Credentials come from the PROCESS ENVIRONMENT only —
// never a dotenv/secrets file (a shipped tool that reads repo secrets is a leak with a friendly name).
import { systemOne, JevUnavailable } from "../../lib/jev-lib.mjs";

const { env: ENV } = process; // aliased: this module must contain no dotenv literal at all (surface test)
const key = () => ENV.TYPESAFE_API_KEY || null;

// TEST-ONLY instrumentation: how many judgment calls THIS process has made. The shipped tool never
// reads it (no production telemetry); the suite uses it to prove the one-call budget.
let _jevCalls = 0;
export const jevCallCount = () => _jevCalls;
export const resetJevCallCount = () => { _jevCalls = 0; };

export async function jev({ state, questions }) {
  const apiKey = key();
  if (!apiKey) throw new JevUnavailable("TYPESAFE_API_KEY not set");
  _jevCalls += 1;
  return systemOne({ apiKey, state, questions });
}
