/**
 * /api/analyze  –  Route handler
 *
 * GET  /api/analyze   → readiness probe
 * POST /api/analyze   → runs history, blastRadius, testAgent, then evidenceAgent
 *
 * Expected POST body:
 * {
 *   "filePath":     "sample-repo/src/routes/auth.js",  // required
 *   "functionName": "comparePassword"                   // optional
 * }
 */

"use strict";

const path = require("path");
const { Router } = require("express");

const historyAgent     = require("../agents/history");
const blastRadiusAgent = require("../agents/blastRadius");
const testAgent        = require("../agents/testAgent");
const evidenceAgent    = require("../agents/evidenceAgent");

const router = Router();

// ── GET /api/analyze ──────────────────────────────────────────────────────────
router.get("/analyze", (_req, res) => {
  res.json({ message: "Analyze endpoint ready" });
});

// ── POST /api/analyze ─────────────────────────────────────────────────────────
router.post("/analyze", async (req, res, next) => {
  try {
    const { filePath, functionName } = req.body;

    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "`filePath` (string) is required." });
    }

    // ── Resolve the file to an absolute path ──────────────────────────────────
    // filePath may be absolute or relative to the backend working directory.
    const absoluteTarget = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    const options = {
      ...(functionName ? { functionName } : {}),
    };

    // ── Run history, blastRadius, testAgent concurrently ──────────────────────
    const [historyResult, blastResult, testResult] = await Promise.all([
      historyAgent.analyze(absoluteTarget, options),
      blastRadiusAgent.analyze(absoluteTarget, options),
      testAgent.analyze(absoluteTarget, options),
    ]);

    // ── Compile evidence report ───────────────────────────────────────────────
    const evidenceReport = evidenceAgent.compile({
      filePath,
      functionName,
      history:     historyResult,
      blastRadius: blastResult,
      testAgent:   testResult,
    });

    // ── Shape the response ────────────────────────────────────────────────────
    const results = [
      { agent: "history",     ...historyResult },
      { agent: "blastRadius", ...blastResult   },
      { agent: "testAgent",   ...testResult    },
      { agent: "evidence",    ...evidenceReport },
    ];

    return res.json({
      filePath,
      options,
      results,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
