// question-lib.mjs — turn what a user ASKS into what the planner BUILDS.
// The tool's input is free text ("How do I configure an SLA?"), but every downstream composer is
// written for an imperative goal statement ("Configure an SLA"): the goal text seeds composed
// labels, the choice questions, and the routing vocabulary. So the question is normalised to a
// goal, and a question that asks for several things at once is split into one clause per goal.
//
// PURE: string in, string(s) out. No filesystem, no network, no state.
//
// Two deliberate decisions (controller ruling R8):
//   * "with" is a clause boundary ONLY when it heads a fresh noun phrase ("with an SLA",
//     "with 2 stages", "with 24x7 support"). In "a case with stages" the "with" is part of the noun
//     phrase — splitting there would invent a goal called "stages".
//   * a comma is a clause boundary only when what follows can START a clause (article, digit, or
//     an authoring verb). "intake, investigation, and resolution" is one noun-phrase list, not three
//     goals; "add a view, then configure an SLA" and "add a view, and an SLA" are two goals.

const WHITESPACE = /\s+/g;
const TRAILING_PUNCT = /[\s?.!,;:]+$/;
const LEADING_PUNCT = /^[,;:.!?]+/;
const LEADING_CONNECTOR = /^(?:and|plus|then|also)\s+/i;

// One regex pass per question shape. Each is anchored, matches the interrogative wrapper only —
// never the verb — so the remainder is already the goal. Applied in a bounded loop because users
// stack wrappers ("Please, can you tell me how to …"). ORDER MATTERS: a specific shape must be
// listed before the generic shape that would otherwise eat its head ("how do I go about …" before
// "how do I …").
const QUESTION_PREFIXES = [
  /^(?:please|kindly)[,\s]+/i, // politeness is not part of the goal
  /^how\s+(?:do|does|can|could|would|should|might|may)\s+(?:i|we|you|one)\s+go\s+about\s+/i, // how do I go about …
  /^how\s+(?:do|does|can|could|would|should|might|may)\s+(?:i|we|you|one)\s+/i, // how do I …
  /^how\s+to\s+/i, // how to …
  // what's / what is + the best/easiest/… + way/approach/practice/method + to/for/of
  /^what(?:'s|’s|\s+is|\s+are)\s+(?:the\s+)?(?:best|easiest|quickest|fastest|right|correct|recommended|proper|preferred)\s+(?:way|approach|practice|method)\s+(?:to|for|of)\s+/i,
  /^where\s+(?:do|can|should|could|would)\s+(?:i|we|you)\s+/i, // where do I …
  /^when\s+(?:do|should|must)\s+(?:i|we)\s+/i, // when do I …
  /^(?:can|could|should|would|may)\s+(?:i|we|you)\s+/i, // can I …
  /^i\s+(?:want|need|would\s+like|'d\s+like)\s+to\s+/i, // I want to …
  /^tell\s+me\s+(?:how\s+)?to\s+/i, // tell me how to …
];

// The authoring verbs the planner understands. Used twice: to decide that a comma starts a new
// clause, and to turn a leading gerund ("adding a view") back into the imperative ("Add a view").
const AUTHORING_VERBS = [
  "add", "create", "configure", "build", "set", "define", "make", "write", "map", "send",
  "schedule", "author", "update", "attach", "route", "validate", "apply", "use", "enable",
  "explain", "test", "review", "remove", "delete", "change", "move", "call", "fetch", "retrieve",
  "link", "design", "implement", "promote", "migrate", "rename", "notify", "escalate", "assign",
  "close", "resolve", "approve", "publish", "export", "import", "grant", "secure", "monitor",
  "track", "capture", "store", "load", "connect", "integrate", "replace", "run", "start", "stop",
];

// A comma is a boundary only before something that can START a clause. This is what keeps the
// commas of a noun-phrase list ("intake, investigation, and resolution") inside one clause.
const CLAUSE_STARTER = "(?:a|an|the|\\d|then|also|" + AUTHORING_VERBS.join("|") + ")";

// "with" heads a clause only when what follows can stand alone as a goal's noun phrase: an article
// or — R8 literally — a DIGIT ("24x7 support" counts; hence no word boundary after \d).
const FRESH_NOUN_PHRASE = "(?:(?:a|an|the)\\b|\\d)";

// ONE boundary regex, built from the rules above. Notes:
//   * "`, and <clause starter>`" splits ("Add a view, and an SLA"). It is listed BEFORE the plain
//     " and " arm, and that arm refuses to fire after a comma: "intake, investigation, and
//     resolution" has no article/digit/verb after ", and", so the list stays one clause.
//   * the `with` arm requires a following article or digit (R8); "a case with stages" stays whole.
const CLAUSE_BOUNDARY = new RegExp(
  "(?:;\\s*" + // an explicit separator always splits
  "|,\\s*(?:and|plus)\\s+(?=" + CLAUSE_STARTER + "\\b)" + // ", and <goal>" / ", plus <goal>"
  "|,\\s*(?=" + CLAUSE_STARTER + "\\b)" + // comma only before a clause starter
  "|(?<![,;])(?<![,;]\\s)\\s+(?:and|plus)\\s+" + // and / plus, but not after a comma
  "|\\s+with\\s+(?=" + FRESH_NOUN_PHRASE + "))", // with + article/digit (R8)
  "gi"
);

// gerund -> imperative verb, derived from AUTHORING_VERBS so the two lists cannot drift.
//   configure -> configuring, use -> using, write -> writing   (drop the final "e")
//   set -> setting, map -> mapping, stop -> stopping            (double a final CVC consonant)
//   apply -> applying, add -> adding, build -> building         (plain + "ing")
const GERUND_TO_VERB = new Map();
for (const verb of AUTHORING_VERBS) for (const form of gerundForms(verb)) GERUND_TO_VERB.set(form, verb);

function gerundForms(verb) {
  const forms = new Set([verb + "ing"]);
  if (/[^aeiou]e$/.test(verb)) forms.add(verb.slice(0, -1) + "ing");
  else if (/ie$/.test(verb)) forms.add(verb.slice(0, -2) + "ying");
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(verb) && verb.length <= 5) forms.add(verb + verb.at(-1) + "ing");
  return forms;
}

// "adding a view" -> "add a view": a question wrapped as "go about <gerund>" or "the best practice
// for <gerund>" still asks for a goal. Only a KNOWN authoring gerund is converted; anything else is
// left exactly as written.
function degerund(goal) {
  const [first, ...rest] = goal.split(" ");
  const verb = GERUND_TO_VERB.get(first.toLowerCase());
  return verb ? [verb, ...rest].join(" ") : goal;
}

// Quoted spans are data, not clause structure: a comma or "and" inside quotes must survive intact.
const QUOTED_SPAN = /"[^"]*"|“[^”]*”|‘[^’]*’|(?:^|(?<=\s))'[^']*'/g;
const SPAN = "\u0000"; // cannot occur in real input; survives split() and trim()

function protectQuoted(text) {
  const spans = [];
  const masked = text.replace(QUOTED_SPAN, (m) => {
    spans.push(m);
    return `${SPAN}${spans.length - 1}${SPAN}`;
  });
  return { masked, spans };
}

function restoreQuoted(text, spans) {
  return text.replace(new RegExp(`${SPAN}(\\d+)${SPAN}`, "g"), (_, i) => spans[Number(i)]);
}

function tidy(text) {
  return text.replace(WHITESPACE, " ").trim();
}

// normaliseQuestion — "How do I configure an SLA?" -> "Configure an SLA".
// Strips the wrapper (one regex pass per known shape), drops trailing punctuation, turns a leading
// authoring gerund into the imperative verb, and leads with a capital so the result reads as the
// goal statement the composers expect.
export function normaliseQuestion(question) {
  const goal = degerund(stripQuestionPrefix(question));
  if (!goal) return "";
  return goal.charAt(0).toUpperCase() + goal.slice(1);
}

// The wrapper-stripping half, WITHOUT re-casing or de-gerunding: splitClauses works on the user's
// own text and should not force "Configure" into the middle of a question it is slicing up.
function stripQuestionPrefix(question) {
  let text = tidy(String(question ?? ""));
  // bounded: at most one pass per stacked wrapper, and a question never nests four deep
  for (let pass = 0, prev = null; pass < 4 && text !== prev; pass++) {
    prev = text;
    for (const prefix of QUESTION_PREFIXES) text = text.replace(prefix, "");
    text = tidy(text.replace(LEADING_CONNECTOR, ""));
  }
  return tidy(text.replace(TRAILING_PUNCT, ""));
}

// clause connectors left dangling after a split ("then configure…" is fine to keep, but a bare
// "and"/"plus" is punctuation residue). Each strip is tidied on its own so punctuation removal
// cannot leave " and " stranded for the connector strip to miss.
function cleanClause(clause) {
  let text = tidy(clause);
  for (let pass = 0; pass < 2; pass++) {
    text = tidy(text.replace(LEADING_PUNCT, ""));
    text = tidy(text.replace(LEADING_CONNECTOR, ""));
  }
  return tidy(text.replace(TRAILING_PUNCT, ""));
}

// splitClauses — one question, one clause per goal it names.
// Always returns ≥1 clause for a non-blank question; a blank question has none.
export function splitClauses(question) {
  const goal = stripQuestionPrefix(question);
  if (!goal) return [];
  const { masked, spans } = protectQuoted(goal);
  return masked
    .split(CLAUSE_BOUNDARY)
    .map((part) => restoreQuoted(part, spans))
    .map(cleanClause)
    .filter((part) => part.length > 0);
}
