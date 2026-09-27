/**
 * History Agent
 *
 * Uses `simple-git` to inspect the git log for a given file and produces:
 *   - The last 5 commits that touched the file (hash, author, date, message)
 *   - A risk flag when any commit message mentions "fix", "bug", or "revert"
 *   - A plain-language summary of why this file has changed over time
 *
 * Output shape:
 * {
 *   findings: string[],
 *   sources:  Array<{ type: "commit", hash: string, message: string }>
 * }
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const simpleGit = require("simple-git");

/**
 * Walk up the directory tree from `startDir` until a directory containing
 * a `.git` entry is found.  Returns the absolute path to that directory, or
 * null if the filesystem root is reached without finding one.
 *
 * @param {string} startDir  – absolute path to start the search from
 * @returns {string|null}
 */
function findGitRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
}

// ── Risk keywords that flag a commit as potentially dangerous ─────────────────
const RISK_KEYWORDS = ["fix", "bug", "revert", "hotfix", "patch", "regression"];
const RISK_RE = new RegExp(RISK_KEYWORDS.join("|"), "i");

/**
 * Return true when the commit message contains a risk keyword.
 * @param {string} message
 * @returns {boolean}
 */
function isRiskyCommit(message) {
  return RISK_RE.test(message);
}

/**
 * Build a plain-language summary from the commit list.
 *
 * @param {string} filePath
 * @param {Array<{hash:string,author:string,date:string,message:string,risky:boolean}>} commits
 * @returns {string[]}   Array of finding strings
 */
function buildFindings(filePath, commits) {
  const findings = [];
  const total = commits.length;

  if (total === 0) {
    findings.push(
      `No git history found for "${filePath}". The file may be untracked or the path is incorrect.`
    );
    return findings;
  }

  // ── Overall churn summary ──────────────────────────────────────────────────
  const newest = commits[0];
  const oldest = commits[total - 1];
  findings.push(
    `"${filePath}" has ${total} recorded commit${total !== 1 ? "s" : ""} in the last 5. ` +
      `Most recent change: "${newest.message}" by ${newest.author} on ${newest.date}. ` +
      `Earliest in window: "${oldest.message}" on ${oldest.date}.`
  );

  // ── Risky-commit summary ───────────────────────────────────────────────────
  const riskyCommits = commits.filter((c) => c.risky);
  if (riskyCommits.length === 0) {
    findings.push(
      `None of the last ${total} commit messages contain risk keywords (fix / bug / revert). ` +
        `The file appears to have evolved through feature work rather than defect remediation.`
    );
  } else {
    const labels = riskyCommits.map((c) => `"${c.message}" (${c.hash.slice(0, 7)})`).join(", ");
    findings.push(
      `${riskyCommits.length} of the last ${total} commit${total !== 1 ? "s" : ""} contain ` +
        `risk keywords (fix / bug / revert), indicating the file has needed defect remediation: ${labels}.`
    );
  }

  // ── Change-type narrative ──────────────────────────────────────────────────
  const messageBlob = commits.map((c) => c.message.toLowerCase()).join(" ");
  const themes = [];
  if (/\b(feat|add|implement|introduc)\b/.test(messageBlob)) themes.push("feature additions");
  if (/\b(fix|bug|null|crash|error|revert)\b/.test(messageBlob)) themes.push("bug fixes");
  if (/\b(refactor|clean|restructur|reorgan)\b/.test(messageBlob)) themes.push("refactoring");
  if (/\b(test|spec|coverage)\b/.test(messageBlob)) themes.push("test coverage improvements");
  if (/\b(docs|changelog|readme|comment)\b/.test(messageBlob)) themes.push("documentation");
  if (/\b(chore|bump|update|upgrade|dependen)\b/.test(messageBlob))
    themes.push("dependency / maintenance changes");
  if (/\b(security|auth|token|jwt|password|crypt)\b/.test(messageBlob))
    themes.push("authentication / security work");

  if (themes.length > 0) {
    findings.push(
      `Commit message analysis suggests the file has undergone: ${themes.join(", ")}. ` +
        `This mix indicates ${
          themes.length > 3
            ? "the file is a high-activity module that spans multiple concerns."
            : "focused, targeted development."
        }`
    );
  }

  // ── Unique-author note ────────────────────────────────────────────────────
  const authors = [...new Set(commits.map((c) => c.author))];
  if (authors.length > 1) {
    findings.push(
      `${authors.length} distinct contributors have touched this file (${authors.join(", ")}), ` +
        `which may increase the risk of conflicting assumptions in the code.`
    );
  } else {
    findings.push(
      `All ${total} commits were made by the same contributor (${authors[0]}), ` +
        `suggesting concentrated ownership.`
    );
  }

  return findings;
}

/**
 * Analyse the commit history of a file inside a git repository.
 *
 * @param {string} filePath
 *   Absolute path to the file OR a path relative to `options.repoRoot`.
 * @param {{
 *   repoRoot?: string,   // defaults to the directory containing the file
 *   maxCommits?: number  // defaults to 5
 * }} options
 * @returns {Promise<{ findings: string[], sources: Array<{type:"commit", hash:string, message:string}> }>}
 */
async function analyze(filePath, options = {}) {
  // ── Resolve the absolute path of the file under investigation ─────────────
  // filePath may be:
  //   • absolute                          → use as-is
  //   • relative to cwd                   → resolve against cwd
  //   • relative to an explicit repoRoot  → resolve against repoRoot
  const absoluteFilePath = path.isAbsolute(filePath)
    ? filePath
    : options.repoRoot
      ? path.resolve(options.repoRoot, filePath)
      : path.resolve(process.cwd(), filePath);

  // ── Locate the git repository root ────────────────────────────────────────
  // Prefer an explicit repoRoot option; otherwise walk up the tree from the
  // file's own directory until we find a .git folder.
  let repoRoot;
  if (options.repoRoot) {
    repoRoot = path.resolve(options.repoRoot);
  } else {
    repoRoot = findGitRoot(path.dirname(absoluteFilePath));
    if (!repoRoot) {
      throw new Error(
        `Could not locate a git repository root for "${absoluteFilePath}". ` +
          `Pass options.repoRoot explicitly if the .git directory is not an ancestor.`
      );
    }
  }

  // ── Derive the path git expects: relative to the repo root ────────────────
  const relativeFilePath = path.relative(repoRoot, absoluteFilePath).replace(/\\/g, "/");

  const maxCommits = options.maxCommits || 5;

  // ── Run git log ───────────────────────────────────────────────────────────
  const git = simpleGit(repoRoot);

  let logResult;
  try {
    logResult = await git.log({
      file: relativeFilePath,
      maxCount: maxCommits,
      // Custom format: each field separated by a non-printable unit separator
      format: {
        hash: "%H",
        abbrevHash: "%h",
        author: "%an",
        date: "%as", // YYYY-MM-DD
        message: "%s",
      },
    });
  } catch (err) {
    throw new Error(
      `git log failed for "${relativeFilePath}" in "${repoRoot}": ${err.message}`
    );
  }

  // ── Shape the raw log entries ─────────────────────────────────────────────
  const commits = (logResult.all || []).map((entry) => ({
    hash: entry.hash,
    abbrevHash: entry.abbrevHash,
    author: entry.author,
    date: entry.date,
    message: entry.message,
    risky: isRiskyCommit(entry.message),
  }));

  // ── Build output ──────────────────────────────────────────────────────────
  const findings = buildFindings(relativeFilePath, commits);

  const sources = commits.map((c) => ({
    type: "commit",
    hash: c.hash,
    message: c.message,
    author: c.author,
    date: c.date,
    risky: c.risky,
  }));

  return { findings, sources };
}

module.exports = { analyze };
