function CommitBadge({ hash, risky }) {
  return (
    <span className={`badge badge-commit${risky ? " badge-risk-high" : ""}`}>
      {risky ? "⚠ " : ""}
      {hash.slice(0, 7)}
    </span>
  );
}

export default function HistoryTab({ result }) {
  if (!result) return <p className="no-data">No history data.</p>;

  const { findings, sources } = result;

  return (
    <div>
      <div className="section-header">Commit History Findings</div>
      <div className="finding-list">
        {(findings || []).map((text, i) => {
          // Associate each finding card with matching commit sources
          const relatedSources = (sources || []).slice(0, 3);
          return (
            <div key={i} className="finding-card">
              <div className="finding-text">{text}</div>
              {relatedSources.length > 0 && (
                <div className="source-badges">
                  {relatedSources.map((s) => (
                    <CommitBadge key={s.hash} hash={s.hash} risky={s.risky} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sources && sources.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 20 }}>
            All Commits ({sources.length})
          </div>
          <div className="finding-list">
            {sources.map((s) => (
              <div key={s.hash} className="finding-card">
                <div className="source-badges" style={{ marginBottom: 6 }}>
                  <CommitBadge hash={s.hash} risky={s.risky} />
                  {s.risky && (
                    <span className="badge badge-risk-high">bug-fix</span>
                  )}
                </div>
                <div className="finding-text">
                  <strong>{s.message}</strong>
                  <br />
                  <span style={{ color: "#57606a", fontSize: 12 }}>
                    {s.author} · {s.date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
