export default function TestsTab({ result }) {
  if (!result) return <p className="no-data">No test analysis data.</p>;

  const { findings, sources, suggestedTest } = result;

  return (
    <div>
      <div className="section-header">Test Coverage Findings</div>
      <div className="finding-list">
        {(findings || []).map((text, i) => (
          <div key={i} className="finding-card">
            <div className="finding-text">{text}</div>
          </div>
        ))}
      </div>

      {(sources || []).length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 20 }}>
            Test References
          </div>
          <div className="finding-list">
            {sources.map((s, i) => (
              <div key={i} className="finding-card">
                <div className="source-badges" style={{ marginBottom: 6 }}>
                  <span className="badge badge-test">test</span>
                </div>
                <div className="finding-text">
                  <span style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 12 }}>
                    {s.file}
                    {s.line ? `:${s.line}` : ""}
                  </span>
                  {s.testName && (
                    <>
                      <br />
                      <span style={{ color: "#57606a", fontSize: 12 }}>{s.testName}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {suggestedTest && (
        <>
          <div className="section-header" style={{ marginTop: 20 }}>
            Suggested Test Case
          </div>
          <div className="suggested-test">
            <pre>{suggestedTest}</pre>
          </div>
        </>
      )}
    </div>
  );
}
