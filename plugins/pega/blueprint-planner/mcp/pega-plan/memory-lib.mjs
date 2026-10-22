// memory-lib.mjs — the CALLER-OWNED memory contract (the TypeSafe `basic_memory` cookbook), kept
// STATELESS.
//
// The cookbook (docs.typesafe.ai/cookbooks/basic_memory) has two halves:
//   1. AFTER a call, a Noul GATE asks whether the request states a lasting fact worth remembering.
//      If P(yes) reaches the threshold, the request and its answer are saved as a memory.
//   2. BEFORE a call, a wrapper injects the saved memories into the state, so a later request can
//      resolve a reference the earlier one established.
// The cookbook also notes that a gate which IGNORES the answer can be a second question in the
// routing request (see fan-out) instead of a call of its own. Ours ignores the answer — it counts
// only what the question itself says — so the gate rides in the SAME classification call: memory
// costs tokens, never wall-clock.
//
// WHAT IS DELIBERATELY NOT HERE: a store. The planner remembers nothing between calls. The CALLER
// owns the list of turns and passes it back as `history`; the planner returns `memory` and the caller
// decides whether to keep it. That is what keeps this tool a planner rather than a session, and it
// makes the memory auditable: the caller can drop, edit or re-rank what it sends.
export const HISTORY_MAX = 5;

// A STARTING threshold, not a calibrated one. The cookbook says the same of its own 0.5: evaluate it
// against labelled examples from your traffic and move it to the value that best separates the pairs
// worth remembering from the ones that are not. Raise it if a stale/misleading memory costs you more
// than a missing one; lower it if the reverse.
export const MEMORY_THRESHOLD = 0.5;

// WHERE the saved turns go in the classifier's state. The questions never mention the memories: the
// model reads the whole state (cookbook, "Your questions never mention the memories").
export const MEMORY_KEY = "earlier_turns";

// The cookbook's GATE, worded for a Pega application instead of a support customer. Like the
// cookbook's, it counts ONLY what the request says (an answer that leaned on an earlier memory must
// not be saved again as if it were new).
export const GATE_INSTRUCTIONS =
  "Does this question state something about this Pega application that stays true for later, unrelated questions — the application namespace, the system of record, or a naming convention? Count only what the question itself says.";
export const GATE_CRITERIA = {
  true: "Yes: it states a lasting fact about the application, such as its namespace, its system of record, or a convention that later questions inherit.",
  false: "No: it only asks for one thing to be built, or states something specific to this request.",
};

// The gate question, ready for the SAME `questions` map the classification uses. One per QUESTION
// (not per clause): the lasting fact belongs to the request, and `memory` is one turn in the answer.
export function gateQuestion() {
  return { type: "noul", instructions: GATE_INSTRUCTIONS, criteria: { ...GATE_CRITERIA } };
}

// P(remember) → the cookbook's decision. Absent (no gate ran: an outage, or a caller-supplied
// classifier) is NOT a guess: nothing is saved.
export function worthSaving(remember) {
  return typeof remember === "number" && Number.isFinite(remember) && remember >= MEMORY_THRESHOLD;
}

// The saved memory, mirroring the cookbook's `as_memory()` shape: the request plus the answer. Here
// that is the question, the verdict, the families it chose (and the namespace when the caller gave
// one) — enough for a later turn to resolve "the data page one".
export function memoryTurn({ question, verdict, families, namespace } = {}) {
  return {
    question: String(question ?? "").trim(),
    verdict: String(verdict ?? "unsure"),
    families: [...new Set((families || []).filter(Boolean).map((f) => String(f).trim().replace(/^rules-rule-/, "")))],
    ...(namespace ? { namespace: String(namespace) } : {}),
  };
}

// Validate the CALLER's list and keep the LAST `HISTORY_MAX` turns: a follow-up refers to what was
// just said, so the most recent turns are the ones worth the state's tokens. A malformed entry is a
// clear error naming the index and the field — this is a caller-owned document, so silence would
// hand a broken memory to the model and blame the model for the answer.
export function normaliseHistory(history) {
  if (history === undefined || history === null) return [];
  if (!Array.isArray(history))
    throw new TypeError(
      `planPegaChange: \`history\` must be an array of earlier turns ({ question, verdict?, families?, namespace? }) — ` +
      `the planner stores nothing, so the CALLER owns this list (got ${typeof history})`);
  const turns = history.map((turn, i) => {
    const where = `history[${i}]`;
    if (!turn || typeof turn !== "object" || Array.isArray(turn))
      throw new TypeError(
        `planPegaChange: \`${where}\` must be an object ({ question, verdict?, families?, namespace? }) — got ` +
        `${Array.isArray(turn) ? "an array" : turn === null ? "null" : typeof turn}`);
    if (typeof turn.question !== "string" || !turn.question.trim())
      throw new TypeError(
        `planPegaChange: \`${where}.question\` must be a non-empty string (got ` +
        `${typeof turn.question === "string" ? "a blank string" : typeof turn.question})`);
    if (turn.verdict !== undefined && typeof turn.verdict !== "string")
      throw new TypeError(`planPegaChange: \`${where}.verdict\` must be a string when present (got ${typeof turn.verdict})`);
    if (turn.families !== undefined && (!Array.isArray(turn.families) || turn.families.some((f) => typeof f !== "string")))
      throw new TypeError(`planPegaChange: \`${where}.families\` must be an array of family names when present (got ${Array.isArray(turn.families) ? "an array with a non-string member" : typeof turn.families})`);
    if (turn.namespace !== undefined && typeof turn.namespace !== "string")
      throw new TypeError(`planPegaChange: \`${where}.namespace\` must be a string when present (got ${typeof turn.namespace})`);
    return {
      question: turn.question.trim(),
      ...(turn.verdict !== undefined ? { verdict: turn.verdict } : {}),
      ...(turn.families !== undefined ? { families: [...turn.families] } : {}),
      ...(turn.namespace !== undefined ? { namespace: turn.namespace } : {}),
    };
  });
  return turns.slice(-HISTORY_MAX);
}
