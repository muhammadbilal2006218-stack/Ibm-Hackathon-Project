const RISK_CLASS = {
  low:    "badge-risk-low",
  medium: "badge-risk-medium",
  high:   "badge-risk-high",
};

export default function EvidenceTab({ result }) {
  if (!result) return <p className="no-data">No evidence report available.</p>;

  const { summary, riskScore, riskReasoning, findings, allSources } = result;

  const riskClass = RISK_CLASS[riskScore?.toLowerCase()] || "badge-ref";

  return (
    <div>
      {riskScore && (
        <div className="risk-block">
          <span className="risk-label">Risk Score</span>
          <span className={`badge ${riskClass}`} style={{ fontSize: 13, padding: "4px 12px" }}>
            {riskScore.toUpperCase()}
          </span>
          {riskReasoning && (
            <span style={{ fontSize: 12, color: "#57606a" }}>{riskReasoning}</span>
          )}
        </div>
      )}

      {summary && (
        <>
          <div className="section-header">Summary</div>
          <div className="finding-card" style={{ marginBottom: 16 }}>
            <div className="finding-text">{summary}</div>
          </div>
        </>
      )}

      {(findings || []).length > 0 && (
        <>
          <div className="section-header">All Findings</div>
          <div className="finding-list">
            {findings.map((f, i) => (
              <div key={i} className="finding-card">
                <div className="finding-text">{f.text}</div>
                {f.sources && f.sources.length > 0 && (
                  <div className="source-badges">
                    {f.sources.map((s, j) => {
                      if (s.type === "commit") {
                        return (
                          <span key={j} className={`badge badge-commit${s.risky ? " badge-risk-high" : ""}`}>
                            {s.risky ? "⚠ " : ""}
                            {s.hash?.slice(0, 7)}
                          </span>
                        );
                      }
                      if (s.type === "reference") {
                        return (
                          <span key={j} className={`badge ${s.isTest ? "badge-test" : "badge-ref"}`}>
                            {s.file}:{s.line}
                          </span>
                        );
                      }
                      if (s.type === "test") {
                        return (
                          <span key={j} className="badge badge-test">
                            {s.file}{s.line ? `:${s.line}` : ""}
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {(allSources || []).length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 20 }}>
            All Citations ({allSources.length})
          </div>
          <div className="finding-list">
            {allSources.map((s, i) => {
              if (s.type === "commit") {
                return (
                  <div key={i} className="finding-card">
                    <div className="source-badges" style={{ marginBottom: 4 }}>
                      <span className={`badge badge-commit${s.risky ? " badge-risk-high" : ""}`}>
                        {s.hash?.slice(0, 7)}
                      </span>
                    </div>
                    <div className="finding-text" style={{ fontSize: 12 }}>
                      {s.message} · {s.author} · {s.date}
                    </div>
                  </div>
                );
              }
              if (s.type === "reference") {
                return (
                  <div key={i} className="finding-card">
                    <div className="source-badges">
                      <span className={`badge ${s.isTest ? "badge-test" : "badge-ref"}`}>
                        {s.file}:{s.line}
                      </span>
                      <span className="badge badge-ref">{s.kind}</span>
                    </div>
                  </div>
                );
              }
              if (s.type === "test") {
                return (
                  <div key={i} className="finding-card">
                    <div className="source-badges">
                      <span className="badge badge-test">
                        {s.file}{s.line ? `:${s.line}` : ""}
                      </span>
                    </div>
                    {s.testName && (
                      <div className="finding-text" style={{ fontSize: 12, marginTop: 4 }}>
                        {s.testName}
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        </>
      )}
    </div>
  );
}
