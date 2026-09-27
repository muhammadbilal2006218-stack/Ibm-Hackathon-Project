/**
 * Blast-Radius Agent
 *
 * Statically analyses a codebase to answer: "if I change this file or function,
 * what else breaks?"
 *
 * Strategy (no AST parser required — pure regex + fs walk):
 *   1. Walk every .js / .ts / .mjs / .cjs file under repoRoot (skipping node_modules/.git)
 *   2. For each file, collect:
 *        a. require("...targetFile...")  / import ... from "...targetFile..."  → file-level import
 *        b. If functionName provided: bare symbol references  e.g.  findUserByEmail(
 *   3. Resolve the target module alias relative to each scanning file so we
 *      match both "../db/users" and "../../db/users" correctly.
 *   4. Classify each hit as "test" vs "source" based on path patterns.
 *   5. Build findings:
 *        • total caller count → low / medium / high risk threshold
 *        • test-coverage flag (any test file imports it?)
 *        • no-test warning when zero test files reference it
 *        • per-file call count when functionName is supplied
 *
 * Output shape:
 * {
 *   findings: string[],
 *   sources: Array<{ type: "reference", file: string, line: number }>
 * }
 */

"use strict";

const fs   = require("fs");
const path = require("path");

/**
 * Walk up the directory tree from `startDir` until a directory containing
 * a `.git` entry is found. Returns the absolute path to that directory, or
 * null if the filesystem root is reached without finding one.
 *
 * @param {string} startDir – absolute path to begin from
 * @returns {string|null}
 */
function findGitRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // filesystem root — no .git found
    dir = parent;
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** File extensions we scan. */
const SCAN_EXTS = new Set([".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx"]);

/** Directories to skip during the file walk. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

/** Path fragments that identify a file as a test. */
const TEST_PATH_RE = /[\\/](tests?|__tests?__|spec|e2e|integration)[\\/]|\.test\.[jt]s|\.spec\.[jt]s/i;

/** High-risk caller threshold. */
const HIGH_RISK_CALLERS = 3;

// ── File walker ───────────────────────────────────────────────────────────────

/**
 * Recursively yield every scannable file under `dir`, skipping SKIP_DIRS.
 * @param {string} dir
 * @returns {string[]}
 */
function walkFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile() && SCAN_EXTS.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

// ── Import / require matcher ──────────────────────────────────────────────────

/**
 * Given the source text of a file, return every line number (1-based) + matched
 * specifier string where a require / import of `specifier` appears.
 *
 * Handles:
 *   require("./foo/bar")
 *   require('../foo/bar')
 *   import X from "./foo/bar"
 *   import { a, b } from '../foo/bar'
 *   import * as X from "./foo/bar"
 *   const x = require("./foo/bar")
 *
 * Also handles cases where the import uses a different relative prefix that still
 * resolves to the same basename (e.g. "../db/users" vs "../src/db/users") by
 * falling back to a basename match when the full-path match fails.
 *
 * @param {string} src
 * @param {string} specifier       – the computed relative specifier (e.g. "../src/db/users")
 * @param {string} [basenameHint]  – just the file basename without extension (e.g. "users")
 * @returns {Array<{ line: number, raw: string }>}
 */
function findImportLines(src, specifier, basenameHint) {
  const lines = src.split("\n");

  // Build the primary (exact relative path) regex
  const escapedSpec = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactRe = new RegExp(
    `(?:require|from)\\s*\\(?\\s*['"\`]${escapedSpec}(?:\\.[jt]sx?)?['"\`]`,
    "i"
  );

  // Build a basename-fallback regex: matches any require/import that ends with
  // /<basename> or /<basename>.js etc., so we catch moved/wrong-depth paths.
  let baseFallbackRe = null;
  if (basenameHint) {
    const escapedBase = basenameHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    baseFallbackRe = new RegExp(
      `(?:require|from)\\s*\\(?\\s*['"\`][^'"\`]*[\\/]${escapedBase}(?:\\.[jt]sx?)?['"\`]`,
      "i"
    );
  }

  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (exactRe.test(line) || (baseFallbackRe && baseFallbackRe.test(line))) {
      hits.push({ line: i + 1, raw: line.trim() });
    }
  }
  return hits;
}

/**
 * Find lines where `symbolName` is called or referenced in `src`.
 * Matches:  symbolName(  /  symbolName.  /  { symbolName }  /  symbolName,
 * (intentionally broad — avoids false negatives in usage detection)
 *
 * @param {string} src
 * @param {string} symbolName
 * @returns {Array<{ line: number, raw: string }>}
 */
function findSymbolLines(src, symbolName) {
  const hits = [];
  const lines = src.split("\n");
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match the symbol being used — exclude the definition line itself
  const re = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])(?!\\s*[:=]\\s*function)`);
  const defRe = new RegExp(
    `^\\s*(?:async\\s+)?function\\s+${escaped}\\b|^\\s*(?:const|let|var)\\s+${escaped}\\s*=`
  );
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (defRe.test(line)) continue; // skip the declaration itself
    if (re.test(line)) {
      hits.push({ line: i + 1, raw: line.trim() });
    }
  }
  return hits;
}

// ── Core scan ─────────────────────────────────────────────────────────────────

/**
 * @typedef {{ file: string, line: number, kind: "import"|"symbol", isTest: boolean }} Hit
 */

/**
 * Scan the entire repository for references to `targetFile` and optionally
 * `functionName`.
 *
 * @param {string} repoRoot      – absolute path to the repository root
 * @param {string} targetFile    – absolute path to the file being analysed
 * @param {string|undefined} functionName
 * @returns {Hit[]}
 */
function scanRepo(repoRoot, targetFile, functionName) {
  const allFiles = walkFiles(repoRoot);
  const hits = [];

  for (const scanFile of allFiles) {
    // Never match the target file against itself
    if (path.resolve(scanFile) === path.resolve(targetFile)) continue;

    let src;
    try {
      src = fs.readFileSync(scanFile, "utf8");
    } catch {
      continue;
    }

    const isTest = TEST_PATH_RE.test(scanFile);

    // ── Check for file-level import ─────────────────────────────────────────
    // Build the specifier as seen from scanFile → targetFile (no extension)
    const relSpec = path
      .relative(path.dirname(scanFile), targetFile)
      .replace(/\\/g, "/")
      .replace(/\.[jt]sx?$/, "");

    // Ensure it starts with ./ or ../
    const normalised = relSpec.startsWith(".") ? relSpec : "./" + relSpec;

    // Basename hint lets us catch imports that use an off-by-one relative path
    const basenameHint = path.basename(targetFile).replace(/\.[jt]sx?$/, "");

    const importLines = findImportLines(src, normalised, basenameHint);
    for (const { line } of importLines) {
      hits.push({ file: scanFile, line, kind: "import", isTest });
    }

    // ── Check for function-name references (only when functionName given) ───
    if (functionName && importLines.length > 0) {
      // Only look for symbol usage inside files that actually import the module
      const symbolLines = findSymbolLines(src, functionName);
      for (const { line } of symbolLines) {
        // Avoid double-counting the import line itself
        if (!importLines.some((il) => il.line === line)) {
          hits.push({ file: scanFile, line, kind: "symbol", isTest });
        }
      }
    }
  }

  return hits;
}

// ── Findings builder ──────────────────────────────────────────────────────────

/**
 * @param {string} relTarget      – repo-relative target file path
 * @param {string|undefined} functionName
 * @param {Hit[]} hits
 * @param {string} repoRoot
 * @returns {string[]}
 */
function buildFindings(relTarget, functionName, hits, repoRoot) {
  const findings = [];

  // Deduplicate to one hit-per-file for the import fan-in count
  const importHits  = hits.filter((h) => h.kind === "import");
  const importFiles = [...new Set(importHits.map((h) => h.file))];
  const testFiles   = importFiles.filter((f) => TEST_PATH_RE.test(f));
  const sourceFiles = importFiles.filter((f) => !TEST_PATH_RE.test(f));

  const symbolHits = hits.filter((h) => h.kind === "symbol");

  const total = importFiles.length;
  const subject = functionName
    ? `Function "${functionName}" in "${relTarget}"`
    : `"${relTarget}"`;

  // ── 1. Fan-in / caller-count finding ──────────────────────────────────────
  if (total === 0) {
    findings.push(
      `${subject} has no importers found in the codebase. ` +
        `It may be an entry-point, dead code, or only required dynamically.`
    );
  } else {
    const risk = total > HIGH_RISK_CALLERS ? "HIGH" : total === HIGH_RISK_CALLERS ? "MEDIUM" : "LOW";
    const callerList = importFiles
      .map((f) => path.relative(repoRoot, f).replace(/\\/g, "/"))
      .join(", ");
    findings.push(
      `${subject} is imported by ${total} file${total !== 1 ? "s" : ""} ` +
        `[risk: ${risk}] — ${total > HIGH_RISK_CALLERS ? "a change here has a wide blast radius" : "a change here has a contained blast radius"}. ` +
        `Importers: ${callerList}.`
    );
  }

  // ── 2. Test coverage finding ───────────────────────────────────────────────
  if (testFiles.length > 0) {
    const tList = testFiles.map((f) => path.relative(repoRoot, f).replace(/\\/g, "/")).join(", ");
    findings.push(
      `${testFiles.length} test file${testFiles.length !== 1 ? "s" : ""} import this module, ` +
        `providing a safety net for refactoring: ${tList}.`
    );
  } else {
    findings.push(
      `No test files import "${relTarget}". ` +
        `There is no automated safety net — changes may break callers silently.`
    );
  }

  // ── 3. Source-file breakdown ───────────────────────────────────────────────
  if (sourceFiles.length > 0) {
    const sList = sourceFiles.map((f) => path.relative(repoRoot, f).replace(/\\/g, "/")).join(", ");
    findings.push(
      `${sourceFiles.length} non-test source file${sourceFiles.length !== 1 ? "s" : ""} depend on this module: ${sList}.`
    );
  }

  // ── 4. Function-level call-site finding ───────────────────────────────────
  if (functionName) {
    if (symbolHits.length === 0) {
      findings.push(
        `No explicit call sites for "${functionName}" were found beyond the import lines. ` +
          `It may be invoked indirectly, spread into an object, or aliased.`
      );
    } else {
      const callCount = symbolHits.length;
      const callRisk  = callCount > HIGH_RISK_CALLERS ? "HIGH" : callCount === HIGH_RISK_CALLERS ? "MEDIUM" : "LOW";
      findings.push(
        `"${functionName}" is referenced at ${callCount} call site${callCount !== 1 ? "s" : ""} across the codebase [risk: ${callRisk}].`
      );
    }
  }

  return findings;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyse the blast radius of changes to a file (and optionally a function).
 *
 * @param {string} filePath
 *   Absolute path OR path relative to `options.repoRoot`.
 * @param {{
 *   repoRoot?: string,      // defaults to dirname(filePath)
 *   functionName?: string   // if supplied, also counts call sites
 * }} options
 * @returns {Promise<{ findings: string[], sources: Array<{type:"reference", file:string, line:number}> }>}
 */
async function analyze(filePath, options = {}) {
  // ── 1. Resolve the absolute path of the file under investigation ──────────
  // filePath may be absolute, relative to cwd, or relative to an explicit repoRoot.
  const absoluteTarget = path.isAbsolute(filePath)
    ? filePath
    : options.repoRoot
      ? path.resolve(options.repoRoot, filePath)
      : path.resolve(process.cwd(), filePath);

  // ── 2. Locate the repository root ─────────────────────────────────────────
  // Use the explicit option when provided; otherwise walk up from the file's
  // own directory until a .git folder is found.
  let repoRoot;
  if (options.repoRoot) {
    repoRoot = path.resolve(options.repoRoot);
  } else {
    repoRoot = findGitRoot(path.dirname(absoluteTarget));
    if (!repoRoot) {
      throw new Error(
        `Could not locate a git repository root for "${absoluteTarget}". ` +
          `Pass options.repoRoot explicitly if the .git directory is not an ancestor.`
      );
    }
  }

  // ── 3. Repo-relative path — what git and the scanner both use ─────────────
  const relTarget = path.relative(repoRoot, absoluteTarget).replace(/\\/g, "/");
  const { functionName } = options;

  // ── Scan ────────────────────────────────────────────────────────────────────
  const hits = scanRepo(repoRoot, absoluteTarget, functionName);

  // ── Build findings ──────────────────────────────────────────────────────────
  const findings = buildFindings(relTarget, functionName, hits, repoRoot);

  // ── Build sources ───────────────────────────────────────────────────────────
  const sources = hits.map((h) => ({
    type: "reference",
    file: path.relative(repoRoot, h.file).replace(/\\/g, "/"),
    line: h.line,
    kind: h.kind,       // "import" | "symbol"
    isTest: h.isTest,
  }));

  return { findings, sources };
}

module.exports = { analyze };
