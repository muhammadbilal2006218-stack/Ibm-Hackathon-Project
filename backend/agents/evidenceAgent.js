/**
 * Evidence Agent
 *
 * Input: the combined outputs of history.js, blastRadius.js, and testAgent.js
 * for the same file/function.
 *
 * Responsibilities:
 *   1. Merge all agent findings into one structured report preserving all
 *      original source citations (commit hashes, file:line refs, test names)
 *   2. Compute a risk score (low/medium/high) based on:
 *        - Recent bug-fix commits in history
 *        - Number of callers/importers in blast radius
 *        - Test coverage presence/absence
 *   3. Return every source citation unchanged — nothing is dropped or summarised away
 *
 * Output shape:
 * {
 *   summary:      string,
 *   riskScore:    "low" | "medium" | "high",
 *   riskReasoning: string,
 *   findings:     Array<{ agent: string, text: string, sources: SourceItem[] }>,
 *   allSources:   SourceItem[]
 * }
 */

"use strict";

// ── Risk scoring ──────────────────────────────────────────────────────────────

/**
 * Count bug-fix commits from history sources.
 * @param {Array<{type:string, risky?:boolean}>} historySources
 * @returns {number}
 */
function countRiskyCommits(historySources) {
  if (!Array.isArray(historySources)) return 0;
  return historySources.filter((s) => s.type === "commit" && s.risky).length;
}

/**
 * Count unique caller files from blast-radius sources.
 * @param {Array<{type:string, file:string, kind:string}>} blastSources
 * @returns {number}
 */
function countCallerFiles(blastSources) {
  if (!Array.isArray(blastSources)) return 0;
  const importSources = blastSources.filter((s) => s.type === "reference" && s.kind === "import");
  return new Set(importSources.map((s) => s.file)).size;
}

/**
 * Check whether any test coverage was found.
 * @param {Array<{type:string}>} testSources
 * @returns {boolean}
 */
function hasTestCoverage(testSources) {
  if (!Array.isArray(testSources)) return false;
  return testSources.some((s) => s.type === "test");
}

/**
 * Compute overall risk and produce a short reasoning string.
 *
 * Scoring matrix:
 *   riskyCommits >= 2  → +2  (or +1 if only 1)
 *   callerFiles  >= 3  → +2  (or +1 if 1–2)
 *   no test coverage   → +1
 *
 *   0–1 → low, 2–3 → medium, 4+ → high
 *
 * @param {number} riskyCommits
 * @param {number} callerFiles
 * @param {boolean} covered
 * @returns {{ score: "low"|"medium"|"high", reasoning: string }}
 */
function computeRisk(riskyCommits, callerFiles, covered) {
  let points = 0;
  const reasons = [];

  if (riskyCommits >= 2) {
    points += 2;
    reasons.push(`${riskyCommits} bug-fix commits`);
  } else if (riskyCommits === 1) {
    points += 1;
    reasons.push("1 bug-fix commit");
  }

  if (callerFiles >= 3) {
    points += 2;
    reasons.push(`${callerFiles} importing files (wide blast radius)`);
  } else if (callerFiles >= 1) {
    points += 1;
    reasons.push(`${callerFiles} importing file${callerFiles !== 1 ? "s" : ""}`);
  }

  if (!covered) {
    points += 1;
    reasons.push("no automated test coverage");
  }

  const score =
    points >= 4 ? "high" : points >= 2 ? "medium" : "low";

  const reasoning =
    reasons.length > 0
      ? reasons.join("; ")
      : "minimal change history, contained blast radius, and test coverage present";

  return { score, reasoning };
}

// ── Evidence compilation ──────────────────────────────────────────────────────

/**
 * Compile all agent results into a unified evidence report.
 *
 * @param {{
 *   filePath:     string,
 *   functionName: string | undefined,
 *   history:      { findings: string[], sources: object[] } | null,
 *   blastRadius:  { findings: string[], sources: object[] } | null,
 *   testAgent:    { findings: string[], sources: object[], suggestedTest: string|null } | null,
 * }} input
 * @returns {{
 *   summary:       string,
 *   riskScore:     "low"|"medium"|"high",
 *   riskReasoning: string,
 *   findings:      Array<{agent:string, text:string, sources:object[]}>,
 *   allSources:    object[]
 * }}
 */
function compile(input) {
  const { filePath, functionName, history, blastRadius, testAgent } = input;

  const historySources  = history?.sources    || [];
  const blastSources    = blastRadius?.sources || [];
  const testSources     = testAgent?.sources   || [];

  // ── Compute risk ──────────────────────────────────────────────────────────
  const riskyCommits = countRiskyCommits(historySources);
  const callerFiles  = countCallerFiles(blastSources);
  const covered      = hasTestCoverage(testSources);

  const { score: riskScore, reasoning: riskReasoning } = computeRisk(
    riskyCommits, callerFiles, covered
  );

  // ── Build per-finding records, each carrying its original source citations ─
  const findings = [];

  // History findings – attach commit sources
  for (const text of (history?.findings || [])) {
    findings.push({
      agent: "history",
      text,
      sources: historySources, // all commit citations preserved
    });
  }

  // Blast radius findings – attach reference sources
  for (const text of (blastRadius?.findings || [])) {
    findings.push({
      agent: "blastRadius",
      text,
      sources: blastSources, // all file:line citations preserved
    });
  }

  // Test agent findings – attach test sources
  for (const text of (testAgent?.findings || [])) {
    findings.push({
      agent: "testAgent",
      text,
      sources: testSources, // all test citations preserved
    });
  }

  // ── Preserve all source citations in one flat list ─────────────────────────
  const allSources = [
    ...historySources,
    ...blastSources,
    ...testSources,
  ];

  // ── Executive summary ─────────────────────────────────────────────────────
  const subject = functionName
    ? `Function "${functionName}" in ${filePath}`
    : `File "${filePath}"`;

  const totalFindings = findings.length;
  const summary =
    `${subject} was analysed by ${[history, blastRadius, testAgent].filter(Boolean).length} agents ` +
    `(${totalFindings} total finding${totalFindings !== 1 ? "s" : ""}). ` +
    `Risk score: ${riskScore.toUpperCase()}. ` +
    `Reasoning: ${riskReasoning}. ` +
    (riskyCommits > 0
      ? `${riskyCommits} commit${riskyCommits !== 1 ? "s" : ""} contain bug-fix keywords. `
      : "No bug-fix commits in recent history. ") +
    (callerFiles > 0
      ? `${callerFiles} file${callerFiles !== 1 ? "s" : ""} import this module. `
      : "No known importers. ") +
    (covered
      ? "Test coverage exists."
      : "No test coverage detected — a suggested test has been generated.");

  return {
    summary,
    riskScore,
    riskReasoning,
    findings,
    allSources,
    // Pass through the suggested test from testAgent if present
    suggestedTest: testAgent?.suggestedTest || null,
  };
}

module.exports = { compile };
