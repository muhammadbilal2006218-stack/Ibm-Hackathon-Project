/**
 * /api/analyze  –  Route handler
 *
 * GET  /api/analyze   → readiness probe
 * POST /api/analyze   → dispatch to one or more agents
 *
 * Expected POST body (all fields optional except `filePath`):
 * {
 *   "filePath":     "src/auth/handler.js",   // required
 *   "agents":       ["history","blastRadius"], // default: both
 *   "functionName": "validateToken",          // optional scope
 *   "lineStart":    42,                       // optional scope
 *   "lineEnd":      68                        // optional scope
 * }
 */

"use strict";

const { Router } = require("express");
const historyAgent = require("../agents/history");
const blastRadiusAgent = require("../agents/blastRadius");

const router = Router();

// Agent registry – add new agents here as they are implemented.
const AGENTS = {
  history: historyAgent,
  blastRadius: blastRadiusAgent,
};

// ── GET /api/analyze ──────────────────────────────────────────────────────────
router.get("/analyze", (_req, res) => {
  res.json({ message: "Analyze endpoint ready for agent integration" });
});

// ── POST /api/analyze ─────────────────────────────────────────────────────────
router.post("/analyze", async (req, res, next) => {
  try {
    const { filePath, agents, functionName, lineStart, lineEnd } = req.body;

    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "`filePath` (string) is required." });
    }

    // Determine which agents to run (default: all registered agents).
    const requestedAgents =
      Array.isArray(agents) && agents.length > 0
        ? agents
        : Object.keys(AGENTS);

    const unknownAgents = requestedAgents.filter((a) => !AGENTS[a]);
    if (unknownAgents.length > 0) {
      return res.status(400).json({
        error: `Unknown agent(s): ${unknownAgents.join(", ")}. Valid agents: ${Object.keys(AGENTS).join(", ")}`,
      });
    }

    const options = {
      ...(functionName != null && { functionName }),
      ...(lineStart != null && { lineStart: Number(lineStart) }),
      ...(lineEnd != null && { lineEnd: Number(lineEnd) }),
    };

    // Run all requested agents concurrently.
    const results = await Promise.all(
      requestedAgents.map(async (agentName) => {
        const result = await AGENTS[agentName].analyze(filePath, options);
        return { agent: agentName, ...result };
      })
    );

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
