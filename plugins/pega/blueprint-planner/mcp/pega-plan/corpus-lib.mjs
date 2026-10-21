// corpus-lib.mjs — find and VALIDATE the skill corpus once, at startup.
// The planner cannot plan without a corpus, so a missing corpus is a loud startup error naming
// every path we looked at — never a silent empty answer. Discovery is ordered, and one root wins:
//   $PEGA_SKILLS_PATH → $PEGA_CORPUS_ROOT → $PEGA_CORPUS (deprecated) → sibling plugin
//   */claude/resources/<version> → repo index/…
// A directory is the corpus only when it carries BOTH manifest.json and graphs/skills-graph.json;
// anything less is a wrong directory, not a corpus. The skills graph is always derived from the
// root, so $PEGA_GRAPH is ignored (loudly — a silent ignore hides a stale override).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../.."); // pega-automated/, or the plugin root in the fork

const MANIFEST = "manifest.json";
const GRAPH_REL = path.join("graphs", "skills-graph.json");
const DEFAULT_VERSION = "26-1";
const ENV_SOURCES = ["PEGA_SKILLS_PATH", "PEGA_CORPUS_ROOT", "PEGA_CORPUS"];
const SKILLS_PATH = "PEGA_SKILLS_PATH"; // names the resources *parent*, not a corpus root
const DEPRECATED = "PEGA_CORPUS"; // old name for PEGA_CORPUS_ROOT; still honoured, never silent

// version: env → package.json corpusVersion → pinned default (one corpus version per planner run)
export function corpusVersion() {
  if (process.env.PEGA_CORPUS_VERSION) return process.env.PEGA_CORPUS_VERSION;
  try {
    const v = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).corpusVersion;
    if (v) return String(v);
  } catch { /* no package.json corpusVersion — the pinned default stands */ }
  return DEFAULT_VERSION;
}

// The plugin scaffolding can sit either inside this repo (plugins/pega/<plugin>) or beside it —
// in the fork this planner IS plugins/pega/<plugin>, so its siblings are <repo>/../<plugin>.
// NOTE: the beside-us branch keys off the parent directory being literally named "pega"; a fork
// checked out anywhere else simply finds no sibling here and falls through to the index/ candidate.
function pluginRoots() {
  const roots = [path.join(ROOT, "plugins", "pega")];
  const parent = path.dirname(ROOT);
  if (path.basename(parent) === "pega") roots.push(parent);
  return roots;
}

function siblingPlugins(version) {
  const out = [];
  const self = path.basename(ROOT);
  for (const root of pluginRoots()) {
    let names = [];
    try {
      names = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    } catch { continue; /* that plugin root does not exist here */ }
    for (const name of names) {
      if (name === self) continue; // never claim our own scaffolding as the corpus
      out.push({ dir: path.join(root, name, "claude", "resources", version), source: "sibling plugin" });
    }
  }
  return out;
}

// Env values are relative to the REPO ROOT, never to process.cwd() — the cwd is chosen by whoever
// launches the MCP, so resolving against it would silently point at the wrong corpus.
// PEGA_SKILLS_PATH names the resources *parent* (e.g. "./resources"), so it is probed twice: as a
// corpus root itself, and as the parent of <version>.
function envCandidates(version) {
  const out = [];
  for (const name of ENV_SOURCES) {
    const raw = process.env[name];
    if (!raw) continue;
    const base = path.resolve(ROOT, raw);
    out.push({ dir: base, source: name });
    if (name === SKILLS_PATH) out.push({ dir: path.join(base, version), source: name });
  }
  return out;
}

function candidates() {
  const version = corpusVersion();
  const ordered = envCandidates(version);
  ordered.push(...siblingPlugins(version));
  ordered.push({ dir: path.join(ROOT, `index/pega-infinity-ai-plugins-resources-${version}`), source: "repo index" });
  return { version, ordered };
}

function missingCorpus(version, ordered) {
  const lines = [
    "planner: no skill corpus found — a corpus must contain BOTH manifest.json and graphs/skills-graph.json.",
    `corpus version: ${version} (PEGA_CORPUS_VERSION → package.json corpusVersion → "${DEFAULT_VERSION}")`,
    "tried, in order:",
    ...ENV_SOURCES.filter((name) => !process.env[name]).map((name) => `  - $${name}${name === DEPRECATED ? " (deprecated)" : ""} (not set)`),
    ...ordered.map((c) => `  - ${c.dir}  [${c.source}${c.source === DEPRECATED ? " (deprecated)" : ""}]`),
  ];
  return new Error(lines.join("\n"));
}

let _paths = null;

// → { corpus, graph, version, tried } — memoised; throws (with every path tried) when absent.
// `tried` is sliced at the winning candidate: it holds the paths actually probed, nothing after the hit.
export function corpusPaths() {
  if (_paths) return _paths;
  if (process.env.PEGA_GRAPH) {
    console.error(`[pega-plan] PEGA_GRAPH is ignored — the skills graph is derived from the discovered corpus root (set PEGA_CORPUS_ROOT to move the corpus instead).`);
  }
  const { version, ordered } = candidates();
  const idx = ordered.findIndex((c) => existsSync(path.join(c.dir, MANIFEST)) && existsSync(path.join(c.dir, GRAPH_REL)));
  if (idx < 0) throw missingCorpus(version, ordered);
  const hit = ordered[idx];
  if (hit.source === DEPRECATED) {
    console.error(`[pega-plan] PEGA_CORPUS is deprecated — use PEGA_CORPUS_ROOT instead (same value: the corpus root directory).`);
  }
  // a stale override must never be silent: say which set env var lost, and out to what
  for (const name of ENV_SOURCES) {
    if (process.env[name] && name !== hit.source) {
      console.error(`[pega-plan] $${name} is ignored — the corpus resolved from a higher-priority source: ${hit.dir}`);
    }
  }
  return (_paths = { corpus: hit.dir, graph: path.join(hit.dir, GRAPH_REL), version, tried: ordered.slice(0, idx + 1).map((c) => c.dir) });
}

// tests swap env vars between cases; the memo would otherwise answer for the old environment.
export function resetCorpusCache() {
  _paths = null;
}
