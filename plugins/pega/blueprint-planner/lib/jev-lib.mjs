// Jev / TypeSafe System One client (GAP-019 Phase 2).
// Raw HTTP wrapper: POST https://api.typesafe.ai/v1/systemone.
// Pinned model, model logged per call, injectable fetch, fail-closed keyword
// fallback for listing classification (advisory-first: raw nouls are kept).
export const JEV_MODEL = "jev-1.13.0";
export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const RETRY = { attempts: 2, backoffMs: 250 }; // one retry on a transient (network / 5xx / 429) failure
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const DEFAULT_NOUL_THRESHOLD = 0.6;

export class JevError extends Error {}
export class JevUnavailable extends JevError {}

// Credentials come from the PROCESS ENVIRONMENT only. No dotenv-file reads anywhere: a shipped tool
// that silently loads repo secrets is a leak with a friendly name (a decoy dotenv in the cwd must
// never be read either).
const { env: ENV } = process; // aliased: this module must contain no dotenv literal at all (surface test)
export function resolveApiKey() {
  return ENV.TYPESAFE_API_KEY || null;
}

const VAN_TERMS = [
  "bestelbus", "bestelauto", "vivaro", "transit", "expert", "e-expert",
  "kangoo", "berlingo", "partner", "caddy", "crafter", "sprinter",
  "transporter", "kipper", "clubcar", "l2h1", "l3h1", "dubbele cabine",
  "delivery",
];

const NOUL = (instructions) => ({ type: "noul", instructions });
const CHOICE = (instructions, criteria) => ({ type: "choice", instructions, criteria });

// Exact, card-structured signals code can compute — Jev only adds judgment for
// what isn't already in the features array (per Jev's meta-rule: don't ask the
// model what code can compute exactly).
const EXACT_FEATURES = {
  heat_pump: ["warmtepomp"],
  acc: ["adaptive cruise control", "lane assist", "lane keeping"],
  three_phase: ["3-fase", "3 fase", "driefasen", "three-phase", "11kw", "22kw"],
  tow_hitch: ["trekhaak", "tow hitch", "towbar"],
  panorama: ["panoramadak", "panorama", "panoramic"],
  camera_360: ["360", "360°"],
};

const FEATURE_QUESTIONS = {
  heat_pump: "Does items[i] mention a heat pump (warmtepomp)?",
  acc: "Does items[i] mention adaptive cruise control or lane assist?",
  three_phase: "Does items[i] mention 3-phase AC charging?",
  tow_hitch: "Does items[i] mention a tow hitch or towbar (trekhaak)?",
  panorama: "Does items[i] mention a panoramic roof?",
  camera_360: "Does items[i] mention a 360° camera?",
};

export function buildFeatureQuestions(listings, fields = []) {
  const questions = {};
  listings.forEach((_, i) => {
    for (const f of fields) {
      if (FEATURE_QUESTIONS[f]) questions[`item${i}_${f}`] = NOUL(FEATURE_QUESTIONS[f]);
    }
  });
  return questions;
}

function mergeExactSignals(listing, flag) {
  const feats = (listing.features || []).map((f) => String(f).toLowerCase());
  const merged = { ...flag, _exact: {} };
  for (const [field, terms] of Object.entries(EXACT_FEATURES)) {
    if (terms.some((t) => feats.some((f) => f.includes(t)))) {
      merged[field] = 1;
      merged._exact[field] = true;
    }
  }
  return merged;
}

export async function systemOne({ state, questions, model = JEV_MODEL, apiKey, fetchFn = fetch, log = () => {}, retry = RETRY } = {}) {
  const key = apiKey ?? resolveApiKey();
  if (!key) throw new JevUnavailable("TYPESAFE_API_KEY not set");
  const body = JSON.stringify({ state, model, questions });
  let lastErr;
  for (let attempt = 1; attempt <= retry.attempts; attempt++) {
    let res;
    try {
      res = await fetchFn(JEV_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
      });
    } catch (e) {
      lastErr = new JevUnavailable(`Jev network error: ${e.message}`);
      if (attempt < retry.attempts) { await sleep(retry.backoffMs); continue; }
      throw lastErr;
    }
    if (res.ok) {
      const parsed = await res.json();
      log(`jev model=${parsed.model} in=${parsed.usage?.input_tokens ?? "?"} out=${parsed.usage?.output_tokens ?? "?"}`);
      return { model: parsed.model, answers: parsed.answers || {}, usage: parsed.usage };
    }
    const retryable = res.status === 429 || res.status >= 500; // 4xx (except 429) is a client error — don't retry
    lastErr = new JevError(`Jev HTTP ${res.status}`);
    if (retryable && attempt < retry.attempts) { await sleep(retry.backoffMs); continue; }
    throw lastErr;
  }
  throw lastErr;
}

export function buildListingQuestions(listings, { criteria } = {}) {
  const questions = {};
  listings.forEach((_, i) => {
    const k = (s) => `item${i}_${s}`;
    questions[k("is_van")] = NOUL(`Is items[${i}] a van, LCV, transporter or delivery van (bestelwagen), not a passenger car?`);
    questions[k("is_pure_ev")] = NOUL(`Is items[${i}] a pure electric (BEV) vehicle?`);
    questions[k("sold")] = NOUL(`Is items[${i}] sold, reserved or delisted?`);
    // SOH is the one attribute every EV hunt cares about — always asked. The
    // feature nouls (heat_pump/acc/three_phase/…) are NOT: they come only from
    // buildFeatureQuestions when the buyer lists them as must-haves, so an
    // unmentioned feature never reads as "confirmed absent" (GAP-019 rule).
    questions[k("soh_ge90")] = NOUL(`Does items[${i}] state battery SOH (state of health) of 90% or higher?`);
    // The code-owned fit gate: Jev judges the card against the buyer's stated
    // criteria (budget, km, features) instead of the LLM structuring them. The
    // item's own price/year/km are in state (GAP-029 measurable-state rule) and
    // are echoed here so the budget/limit judgment has the numbers to judge.
    if (criteria) {
      const p = `price ${listings[i]?.price_eur != null ? `€${listings[i].price_eur}` : "unknown"}, year ${listings[i]?.year ?? "?"}, ${listings[i]?.km ?? "?"} km`;
      questions[k("fit")] = NOUL(`Given the buyer's stated criteria — ${criteria} — does items[${i}] (${p}) genuinely fit? It must be within budget and meet the stated must-have features/limits with no obvious mismatch.`);
    }
    questions[k("body")] = CHOICE(`What body style is items[${i}]?`, {
      hatchback: "Hatchback",
      suv: "SUV or crossover",
      estate: "Estate/wagon",
      sedan: "Sedan/saloon",
      mpv: "MPV or people carrier",
      coupe_convertible: "Coupe or convertible",
      van: "Van, LCV, transporter or bestelwagen",
      other: "Something else or not stated",
    });
  });
  return questions;
}

export function flagsFromAnswers(answers, listings, threshold = DEFAULT_NOUL_THRESHOLD, extraFields = []) {
  const flag = (answers, key) => answers[key]?.noul ?? null;
  return listings.map((l, i) => {
    const k = (s) => `item${i}_${s}`;
    const extra = {};
    for (const f of extraFields) extra[f] = flag(answers, k(f));
    return mergeExactSignals(l, {
      id: l.id,
      title: l.title,
      is_van: flag(answers, k("is_van")),
      is_pure_ev: flag(answers, k("is_pure_ev")),
      sold: flag(answers, k("sold")),
      soh_ge90: flag(answers, k("soh_ge90")),
      heat_pump: flag(answers, k("heat_pump")),
      acc: flag(answers, k("acc")),
      three_phase: flag(answers, k("three_phase")),
      fit: flag(answers, k("fit")),
      body: answers[k("body")]?.choice ?? null,
      ...extra,
      _threshold: threshold,
    });
  });
}

export function keywordFlags(listings) {
  return listings.map((l) => ({
    id: l.id,
    title: l.title,
    is_van: VAN_TERMS.some((t) => (l.title || "").toLowerCase().includes(t)) ? 1 : 0,
    is_pure_ev: null,
    sold: null,
    soh_ge90: null,
    heat_pump: null,
    acc: null,
    three_phase: null,
    fit: null,
    body: null,
    _fallback: true,
  }));
}

export async function classifyListings(listings, opts = {}) {
  if (!listings || !listings.length) return [];
  const batch = Math.min(opts.batch || 30, 30);
  const extraFields = opts.extraFields || [];
  const out = [];
  for (let i = 0; i < listings.length; i += batch) {
    const chunk = listings.slice(i, i + batch);
    // GAP-029: measurable state is the biggest lever. The `fit` noul asks "is
    // this within budget?" — so the state must carry the item's price/year/km,
    // not just prose. Aligns classifyListings with classifySteals.
    const state = {
      items: chunk.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        features: l.features,
        price_eur: l.price_eur ?? null,
        year: l.year ?? null,
        km: l.km ?? null,
      })),
    };
    const questions = { ...buildListingQuestions(chunk, { criteria: opts.criteria }), ...buildFeatureQuestions(chunk, extraFields) };
    try {
      const { answers } = await systemOne({
        state,
        questions,
        model: opts.model,
        apiKey: opts.apiKey,
        fetchFn: opts.fetchFn,
        log: opts.log,
      });
      out.push(...flagsFromAnswers(answers, chunk, opts.threshold, extraFields));
    } catch (e) {
      if (opts.failClosed !== false) {
        opts.log?.(`jev unavailable (${e.message}); keyword fallback`);
        out.push(...keywordFlags(chunk));
      } else {
        throw e;
      }
    }
  }
  return out;
}

// A.3: generic record judgment — the adapter-agnostic noul_check engine. Any
// skill contract declares `questions` (a template per record) + `checks` (a
// field/op/value on the answers) and the bridge runs it over raw records OR the
// delivered structured output. Each record gets its own per-question id
// (GAP-029: per-item discrimination needs per-item ids). Fail-open: when Jev is
// unavailable the answers stay null → checks never fire (unverified ≠ bad).
export async function judgeRecords(records, { questions = {}, criteria, fetchFn, apiKey, model, log } = {}) {
  if (!records?.length) return [];
  const templates = Object.entries(questions || {}).map(([id, q]) => ({ id, ...q }));
  if (!templates.length) return records.map((r) => ({ id: r.id, _judged: false }));
  const state = { items: records.map((r) => ({ id: r.id, ...r })) };
  const qs = {};
  records.forEach((_, i) => {
    for (const t of templates) {
      qs[`item${i}_${t.id}`] = {
        type: t.type || "noul",
        instructions: String(t.instructions || "")
          .replace(/\{i\}/g, String(i))
          .replace(/\{criteria\}/g, criteria || ""),
        ...(t.criteria ? { criteria: t.criteria } : {}),
      };
    }
  });
  try {
    const { answers } = await systemOne({ state, questions: qs, model, apiKey, fetchFn, log });
    return records.map((r, i) => {
      const a = {};
      for (const t of templates) {
        const ans = answers[`item${i}_${t.id}`] || {};
        // choice (string) OR noul/score (number) — never guess which shape a
        // template returns; the answer object carries exactly the shape of the
        // question type we sent.
        a[t.id] = ans.choice ?? ans.noul ?? ans.score ?? null;
      }
      return { id: r.id, _judged: true, ...a };
    });
  } catch {
    return records.map((r) => ({ id: r.id, _judged: false }));
  }
}

export function gateDetailFetch(listings, flags, { max = 5, threshold = DEFAULT_NOUL_THRESHOLD, mustHaves } = {}) {
  const plausible = (f) => {
    const isVan = f.body === "van" || (f.is_van != null && f.is_van >= threshold);
    const sold = f.sold != null && f.sold >= threshold;
    return !isVan && !sold;
  };
  // Without user must-haves the gate falls back to the universal EV signals:
  // SOH (always asked) + budget fit (asked when criteria are given).
  const signalFields = mustHaves && mustHaves.length ? mustHaves : ["soh_ge90", "fit"];
  const signals = (f) => signalFields.filter((k) => f[k] != null && f[k] >= threshold).length;
  return listings
    .map((l, i) => ({ l, f: flags[i] || {} }))
    .filter(({ f }) => plausible(f))
    .sort((a, b) => signals(b.f) - signals(a.f))
    .slice(0, max)
    .map(({ l }) => l);
}

// ---- verification / anti-hallucination gate (inventory B.7) ----
//
// The delivery claims must-haves ("this has a heat pump", "SOH > 90%"). This
// gate checks each claim against the actual listing text: exact features that
// code can confirm are confirmed in code; anything ambiguous goes to Jev as a
// per-claim noul ("does the listing text support this claim?"). A claim that
// the text does NOT support becomes a violation — a confident-but-wrong
// delivery surfaces instead of reaching the user.
//
// claims: [{ id, must_haves: ["heat_pump", "soh_ge90", …] }] — the delivered
// top-N with the fields the agent/UI asserted. mustHaves names must match
// EXACT_FEATURES (code-confirmable) or be a Jev-judged field.
//
// Returns { verdicts: [{id, field, source: "exact"|"jev"|"unsupported", p}],
//           violations: [{id, field, claim}] }.

export function buildVerificationQuestions(listings) {
  const questions = {};
  listings.forEach((l, i) => {
    const label = `items[${i}] (${l.title || l.id})`;
    questions[`item${i}_has_must_have`] = NOUL(
      `Does the listing text for ${label} actually state that it has the claimed must-have "${l.claim}"? Answer yes only if the text supports it — never infer from price, year, or the model name alone.`
    );
  });
  return questions;
}

export function verifyListings(listings, { threshold = DEFAULT_NOUL_THRESHOLD, fetchFn, apiKey, model, log, failClosed = true } = {}) {
  return verifyMustHaves(listings, { threshold, fetchFn, apiKey, model, log, failClosed });
}

// Code-confirmable features (EXACT_FEATURES) are checked against the features
// array directly; anything else goes to Jev. Unsupported → violation.
export async function verifyMustHaves(listings, { threshold = DEFAULT_NOUL_THRESHOLD, fetchFn, apiKey, model, log, failClosed = true } = {}) {
  const rows = listings || [];
  const verdicts = [];
  const violations = [];
  const jevCandidates = [];

  rows.forEach((l, i) => {
    const feats = (l.features || []).map((f) => String(f).toLowerCase());
    const claim = String(l.claim || l.must_have || "");
    if (!claim) return;
    const terms = EXACT_FEATURES[claim];
    if (terms && terms.some((t) => feats.some((f) => f.includes(t)))) {
      verdicts.push({ id: l.id, field: claim, source: "exact", p: 1 });
      return;
    }
    jevCandidates.push({ ...l, _i: i, claim });
  });

  if (jevCandidates.length) {
    try {
      const state = { items: jevCandidates.map((l) => ({ id: l.id, title: l.title, description: l.description, features: l.features, claim: l.claim })) };
      const { answers } = await systemOne({
        state,
        questions: buildVerificationQuestions(jevCandidates),
        model,
        apiKey,
        fetchFn,
        log,
      });
      jevCandidates.forEach((l, j) => {
        const p = answers[`item${j}_has_must_have`]?.noul ?? null;
        if (p == null) {
          verdicts.push({ id: l.id, field: l.claim, source: "unknown", p: null });
          return;
        }
        if (p >= threshold) verdicts.push({ id: l.id, field: l.claim, source: "jev", p });
        else {
          verdicts.push({ id: l.id, field: l.claim, source: "unsupported", p });
          violations.push({ id: l.id, field: l.claim, claim: `${l.claim} asserted but listing text does not support it (p=${p.toFixed(2)})` });
        }
      });
    } catch (e) {
      if (!failClosed) throw e;
      log?.(`jev unavailable for verification (${e.message}); remaining claims unverified`);
      jevCandidates.forEach((l) => verdicts.push({ id: l.id, field: l.claim, source: "unverified", p: null }));
    }
  }
  return { verdicts, violations };
}

// ---- B.8 structured extraction from messy text (guide Workflow F) ----
// The split: code regexes the EXACT parts (year/km/price); Jev judges the
// AMBIGUOUS parts (SOH-in-prose, owners, feature mentions) — per-field
// questions in one batched call. Select-don't-generate: where a value is a
// selection, code extracts candidate spans and Jev picks with `other` as the
// escape hatch — Jev never invents a value that wasn't offered (guide Trap 3).
// Fail-open: Jev unavailable → fields stay null (never fabricated).

// Code-exact regexes (never sent to Jev).
export const EXACT_EXTRACTORS = {
  year: (t) => {
    const m = String(t || "").match(/\b(19|20)\d{2}\b/);
    return m ? Number(m[0]) : null;
  },
  km: (t) => {
    const m = String(t || "").match(/([\d.,]+)\s*km/i);
    if (!m) return null;
    const n = Number(m[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : null;
  },
  price_eur: (t) => {
    const m = String(t || "").match(/€\s?([\d.,]+)/);
    if (!m) return null;
    const n = Number(m[1].replace(/\.(?=\d{3}(?:[.,]|$))/g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : null;
  },
  // B.8: SOH is a NUMBER (the literal % when the text states it). Tolerant of
  // "SOH rond de 92%", "SOH 92%", "92% SOH", "92% accu gezondheid". Never a
  // bucket at the exact layer — the Jev ge90/lt90 bucket is only a fallback
  // when this finds nothing (see EXTRACTION_FIELDS.soh_pct).
  soh_pct: (t) => {
    const s = String(t || "");
    const approx = "(?:rond\\s+de|circa|ongeveer|about|±|ca\\.?)\\s*";
    const m =
      s.match(new RegExp(`SOH[^0-9]{0,30}${approx}([0-9]+(?:\\.[0-9]+)?)\\s*%`, "i")) ||
      s.match(/SOH[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
      s.match(/([0-9]+(?:\.[0-9]+)?)\s*%\s*SOH/i) ||
      s.match(new RegExp(`${approx}([0-9]+(?:\\.[0-9]+)?)\\s*%\\s*(?:accu|batterij)`, "i")) ||
      s.match(/([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:accu|batterij)\s*(?:gezondheid|health)/i) ||
      null;
    if (!m) return null;
    const n = Number(m[1].replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : null;
  },
};

// The B.8 field spec: which fields to extract, and how. `exact` names a code
// regex extractor (tried first, never sent to Jev); otherwise `jev` gives the
// per-field question and `post` turns the answer into a typed value.
export const EXTRACTION_FIELDS = {
  year: {
    exact: "year",
    post: (v) => v,
  },
  km: {
    exact: "km",
    post: (v) => v,
  },
  price_eur: {
    exact: "price_eur",
    post: (v) => v,
  },
  soh_pct: {
    // B.8 rule: SOH is a NUMBER (the literal % when the text states it) or
    // null ("not stated"). The exact extractor gets the number first. Jev is
    // ALWAYS asked too (always: true) — its ge90/lt90/not_stated bucket is a
    // CROSS-CHECK of the regex, not just a fallback:
    //   · regex number + Jev "ge90"  → agree (validated)
    //   · regex number + Jev "lt90"  → disagree (flag: regex or Jev is off)
    //   · regex number + Jev "not_stated" → suspicious (regex may have grabbed
    //     a non-SOH number; flag)
    //   · no regex + Jev bucket → fallback (weak signal, marked _jev)
    exact: "soh_pct",
    always: true,
    jev: (i) => ({
      type: "choice",
      instructions: `Does this listing text state battery SOH (state of health) as a percentage, and is it 90 or higher? Pick "not_stated" if the text does not mention SOH at all — never guess it from age or mileage.`,
      criteria: { ge90: "SOH stated at 90% or higher", lt90: "SOH stated below 90%", not_stated: "SOH not mentioned" },
    }),
    post: (a) => (a === "ge90" ? "ge90" : a === "lt90" ? "lt90" : null),
    // Cross-check the regex number against Jev's independent bucket.
    // exact=92 & jev=ge90 → agree. exact=85 & jev=ge90 → Jev says ≥90, regex
    // says 85 → disagree. exact=92 & jev=not_stated → regex grabbed a number
    // Jev doesn't read as SOH → suspicious (flag; keep the regex value but note
    // the conflict for verification).
    cross: (exactNum, jevBucket) => {
      if (jevBucket === "not_stated") return { exact: exactNum, jev: jevBucket, verdict: "suspicious" };
      const bracket = exactNum >= 90 ? "ge90" : "lt90";
      return { exact: exactNum, jev: jevBucket, verdict: bracket === jevBucket ? "agree" : "disagree" };
    },
  },
  owners: {
    jev: (i) => ({
      type: "choice",
      instructions: `How many owners does this listing text state (e.g. "1e eigenaar", "tweede eigenaar")? Pick "not_stated" if the text does not mention owner count.`,
      criteria: { "1": "one owner (1e eigenaar, first owner)", "2plus": "two or more owners (2e/3e eigenaar)", not_stated: "owner count not mentioned" },
    }),
    post: (a) => (a === "1" ? 1 : a === "2plus" ? 2 : null),
  },
  heat_pump: {
    // GAP-019 (2026-09-20): a noul "does it state X?" returns false when the
    // ad doesn't mention it — indistinguishable from "confirmed absent". Dealer
    // ads rarely list these, so every unmentioned feature came back false. As a
    // choice with not_stated, absence is null ("not stated"), never a hard no.
    jev: (i) => ({
      type: "choice",
      instructions: `Does this listing text state a heat pump (warmtepomp)? Pick "not_stated" if the text does not mention it — never infer from model/year.`,
      criteria: { yes: "heat pump stated", no: "text says no heat pump / zónder warmtepomp", not_stated: "heat pump not mentioned" },
    }),
    post: (a) => (a === "yes" ? true : a === "no" ? false : null),
  },
  tow_hitch: {
    jev: (i) => ({
      type: "choice",
      instructions: `Does this listing text state a tow hitch (trekhaak)? Pick "not_stated" if the text does not mention it.`,
      criteria: { yes: "tow hitch stated", no: "text says no tow hitch / zónder trekhaak", not_stated: "tow hitch not mentioned" },
    }),
    post: (a) => (a === "yes" ? true : a === "no" ? false : null),
  },
  three_phase: {
    jev: (i) => ({
      type: "choice",
      instructions: `Does this listing text state 3-phase AC charging (3-fase)? Pick "not_stated" if the text does not mention it.`,
      criteria: { yes: "3-phase charging stated", no: "text says single-phase only", not_stated: "3-phase not mentioned" },
    }),
    post: (a) => (a === "yes" ? true : a === "no" ? false : null),
  },
  acc: {
    jev: (i) => ({
      type: "choice",
      instructions: `Does this listing text state adaptive cruise control or lane assist? Pick "not_stated" if the text does not mention it.`,
      criteria: { yes: "ACC / lane assist stated", no: "text says no ACC / without adaptive cruise", not_stated: "ACC not mentioned" },
    }),
    post: (a) => (a === "yes" ? true : a === "no" ? false : null),
  },
};

// Extract typed fields from a single messy text (or list of texts). Returns a
// list of { id?, ...extracted, _exact, _jev, _unverified } records.
// opts.fields = subset of EXTRACTION_FIELDS; opts.exactOverrides = extra code
// regex extractors (e.g. the detail lib's own year/km/price).
export async function extractStructuredFields(texts, opts = {}) {
  const inputs = Array.isArray(texts) ? texts : [texts];
  const fields = (opts.fields && opts.fields.length ? opts.fields : Object.keys(EXTRACTION_FIELDS)).filter((f) => EXTRACTION_FIELDS[f]);
  const exactExtractors = { ...EXACT_EXTRACTORS, ...(opts.exactOverrides || {}) };

  // Pass 1 — code computes the exact parts (never sent to Jev).
  const records = inputs.map((t) => {
    const text = typeof t === "string" ? t : (t?.description || t?.text || "");
    const exact = {};
    const jevNeed = {};
    for (const f of fields) {
      const spec = EXTRACTION_FIELDS[f];
      if (spec.exact) {
        const v = exactExtractors[spec.exact]?.(text);
        if (v != null) {
          exact[f] = v;
          // `always`: Jev judges too, to cross-check the regex result (not just
          // as a fallback). E.g. SOH: regex gives 92, Jev confirms "ge90".
          if (spec.jev && spec.always) jevNeed[f] = spec;
        } else if (spec.jev) {
          jevNeed[f] = spec;
        }
      } else if (spec.jev) {
        jevNeed[f] = spec;
      }
    }
    return { id: typeof t === "string" ? null : (t?.id ?? null), text, exact, jevNeed };
  });

  // Pass 2 — Jev judges the ambiguous parts, per-field questions, one call.
  const out = [];
  for (const rec of records) {
    const need = Object.entries(rec.jevNeed);
    if (!need.length) {
      out.push({ id: rec.id, ...rec.exact, _exact: Object.keys(rec.exact), _jev: [], _unverified: [] });
      continue;
    }
    const state = { text: rec.text };
    const questions = {};
    need.forEach(([f], i) => {
      questions[`field${i}_${f}`] = EXTRACTION_FIELDS[f].jev(i);
    });
    const answers = {};
    try {
      const { answers: ans } = await systemOne({ state, questions, model: opts.model, apiKey: opts.apiKey, fetchFn: opts.fetchFn, log: opts.log });
      need.forEach(([f], i) => {
        const raw = ans[`field${i}_${f}`];
        answers[f] = raw?.noul ?? raw?.choice ?? raw?.score ?? null;
      });
    } catch (e) {
      if (opts.failClosed !== false) {
        opts.log?.(`jev unavailable for extraction (${e.message}); ambiguous fields left unverified`);
      } else {
        throw e;
      }
    }
    const extracted = {};
    const jevFields = [];
    const unverified = [];
    const checks = {};
    for (const [f, spec] of need) {
      const v = spec.post(answers[f]);
      if (v == null) unverified.push(f);
      else {
        // For `always` fields the EXACT value wins (Jev is the cross-check, not
        // the value) — e.g. soh_pct stays 92 (regex), Jev's "ge90" lives in
        // _cross. Non-always fields take the Jev value.
        if (!(spec.always && rec.exact[f] != null)) extracted[f] = v;
        jevFields.push(f);
      }
      if (spec.always && spec.cross && rec.exact[f] != null && v != null) {
        checks[f] = spec.cross(rec.exact[f], v);
      }
    }
    out.push({
      id: rec.id,
      ...rec.exact,
      ...extracted,
      ...(Object.keys(checks).length ? { _cross: checks } : {}),
      _exact: Object.keys(rec.exact),
      _jev: jevFields,
      _unverified: unverified,
    });
  }
  // A single STRING input → single object; an array input → array (even if 1).
  const isArr = Array.isArray(texts);
  return isArr ? out : out[0];
}

// Code-enforced gate: classify + return the explicit top-N id list that detail
// verification must open. Keeps the base agent out of Playwright for everything.
export async function classifyAndGate(listings, { max = 5, ...opts } = {}) {
  const flags = await classifyListings(listings, opts);
  const gate = gateDetailFetch(listings, flags, { max, threshold: opts.threshold, mustHaves: opts.mustHaves });
  return { flags, gate: gate.map((l) => l.id) };
}

// ---- steal-deal (GAP-018): code-calculates the price signal, Jev judges value

export function marketStats(listings) {
  const priced = (listings || []).map((l, i) => ({ i, p: l.price_eur })).filter((x) => x.p != null).sort((a, b) => a.p - b.p);
  const rankOf = new Map(priced.map((x, rank) => [x.i, rank]));
  const n = priced.length;
  return (listings || []).map((l, i) => {
    const p = l.price_eur;
    const rank = rankOf.get(i);
    const price_pct = p != null && n > 1 && rank != null ? rank / (n - 1) : p != null && n === 1 ? 0 : null;
    return {
      id: l.id,
      price_eur: p,
      price_pct,
      eur_per_km: p != null && l.km ? +(p / l.km).toFixed(4) : null,
      year: l.year,
    };
  });
}

export function buildStealQuestions(listings, stats) {
  const questions = {};
  listings.forEach((_, i) => {
    const s = stats?.[i] || {};
    const priceDesc = s.price_eur != null
      ? `€${s.price_eur} (${s.price_pct != null ? `${Math.round(s.price_pct * 100)}th percentile of the market set` : "price unknown"}, ${s.eur_per_km ?? "?"} €/km)`
      : "price unknown";
    questions[`item${i}_is_steal`] = NOUL(
      `Given its price (${priceDesc}) and its year, km and included features, is items[${i}] a genuinely exceptional value — a "steal" — even if one desired feature is missing?`
    );
    questions[`item${i}_value`] = {
      type: "score",
      instructions: `How compelling is the value of items[${i}] at its price?`,
      criteria: ["Overpriced", "Fair market price", "Good value", "Exceptional steal"],
    };
  });
  return questions;
}

export function stealScore(flag) {
  const price = flag.price_pct != null ? 1 - flag.price_pct : null;
  const jev = flag.is_steal != null ? flag.is_steal : null;
  const value = flag.value != null ? flag.value / 3 : null;
  const parts = [];
  if (price != null) parts.push(0.5 * price);
  if (jev != null) parts.push(0.3 * jev);
  if (value != null) parts.push(0.2 * value);
  const total = parts.reduce((a, b) => a + b, 0);
  const is_steal_flag = price != null && price >= 0.75 && jev != null && jev >= 0.6;
  return { ...flag, steal_score: parts.length ? +total.toFixed(3) : null, is_steal_flag };
}

export async function classifySteals(listings, opts = {}) {
  if (!listings || !listings.length) return [];
  const stats = marketStats(listings);
  const batch = Math.min(opts.batch || 30, 30);
  const out = [];
  for (let i = 0; i < listings.length; i += batch) {
    const chunk = listings.slice(i, i + batch);
    const chunkStats = stats.slice(i, i + batch);
    const state = {
      items: chunk.map((l, j) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        features: l.features,
        price_eur: l.price_eur,
        year: l.year,
        km: l.km,
        price_pct: chunkStats[j].price_pct,
        eur_per_km: chunkStats[j].eur_per_km,
      })),
    };
    const questions = { ...buildListingQuestions(chunk), ...buildStealQuestions(chunk, chunkStats), ...buildFeatureQuestions(chunk, opts.extraFields || []) };
    try {
      const { answers, model } = await systemOne({
        state,
        questions,
        model: opts.model,
        apiKey: opts.apiKey,
        fetchFn: opts.fetchFn,
        log: opts.log,
      });
      const base = flagsFromAnswers(answers, chunk, opts.threshold);
      out.push(
        ...chunk.map((l, j) => {
          const k = (s) => `item${j}_${s}`;
          return stealScore({
            ...base[j],
            price_pct: chunkStats[j].price_pct,
            eur_per_km: chunkStats[j].eur_per_km,
            is_steal: answers[k("is_steal")]?.noul ?? null,
            value: answers[k("value")]?.score ?? null,
            // calibration signals: the score's confidence + the serving model
            value_confidence: answers[k("value")]?.confidence ?? null,
            _jev_model: model || null,
          });
        })
      );
    } catch (e) {
      if (opts.failClosed !== false) {
        opts.log?.(`jev unavailable (${e.message}); keyword fallback`);
        out.push(
          ...keywordFlags(chunk).map((f, j) =>
            stealScore({ ...f, price_pct: chunkStats[j]?.price_pct, eur_per_km: chunkStats[j]?.eur_per_km, is_steal: null, value: null })
          )
        );
      } else {
        throw e;
      }
    }
  }
  return out;
}