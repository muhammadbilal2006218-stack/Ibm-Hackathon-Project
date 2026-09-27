import { useState } from "react";
import HistoryTab from "./tabs/HistoryTab";
import BlastRadiusTab from "./tabs/BlastRadiusTab";
import TestsTab from "./tabs/TestsTab";
import EvidenceTab from "./tabs/EvidenceTab";

const TABS = ["History", "Blast Radius", "Tests", "Evidence"];

export default function ReportView({ report, loading }) {
  const [activeTab, setActiveTab] = useState("History");

  if (loading) {
    return (
      <div className="spinner">
        <div className="spinner-ring" />
        Running agents…
      </div>
    );
  }

  if (!report) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No analysis yet</div>
        <div className="empty-state-sub">
          Select a file and click Analyze to inspect it.
        </div>
      </div>
    );
  }

  const { filePath, options, results } = report;

  // Extract per-agent result by agent name
  const byAgent = {};
  for (const r of results || []) {
    byAgent[r.agent] = r;
  }

  const historyResult    = byAgent.history     || null;
  const blastResult      = byAgent.blastRadius  || null;
  const testResult       = byAgent.testAgent    || null;
  const evidenceResult   = byAgent.evidence     || null;

  return (
    <div>
      <div className="report-meta">
        Analyzing <strong>{filePath}</strong>
        {options?.functionName && (
          <> → function <strong>{options.functionName}</strong></>
        )}
      </div>

      <div className="tabs-bar">
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab-btn${activeTab === t ? " active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "History"      && <HistoryTab result={historyResult} />}
      {activeTab === "Blast Radius" && <BlastRadiusTab result={blastResult} />}
      {activeTab === "Tests"        && <TestsTab result={testResult} />}
      {activeTab === "Evidence"     && <EvidenceTab result={evidenceResult} />}
    </div>
  );
}
