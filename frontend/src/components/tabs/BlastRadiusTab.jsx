export default function BlastRadiusTab({ result }) {
  if (!result) return <p className="no-data">No blast radius data.</p>;

  const { findings, sources } = result;

  // Group sources by file
  const byFile = {};
  for (const s of sources || []) {
    if (!byFile[s.file]) byFile[s.file] = [];
    byFile[s.file].push(s);
  }

  return (
    <div>
      <div className="section-header">Blast Radius Findings</div>
      <div className="finding-list">
        {(findings || []).map((text, i) => (
          <div key={i} className="finding-card">
            <div className="finding-text">{text}</div>
          </div>
        ))}
      </div>

      {Object.keys(byFile).length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 20 }}>
            Reference Sites ({(sources || []).length})
          </div>
          <div className="finding-list">
            {Object.entries(byFile).map(([file, refs]) => (
              <div key={file} className="finding-card">
                <div className="finding-text">
                  <strong style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 12 }}>
                    {file}
                  </strong>
                </div>
                <div className="source-badges">
                  {refs.map((r, idx) => (
                    <span
                      key={idx}
                      className={`badge ${r.isTest ? "badge-test" : "badge-ref"}`}
                    >
                      {r.isTest ? "test" : r.kind} :{r.line}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
