export default function FilePicker({
  files,
  filePath,
  functionName,
  onFileChange,
  onFunctionChange,
  onAnalyze,
  loading,
}) {
  return (
    <div className="picker-section">
      <div>
        <label htmlFor="file-select">File</label>
        <select
          id="file-select"
          value={filePath}
          onChange={(e) => onFileChange(e.target.value)}
        >
          {files.map((f) => (
            <option key={f} value={f}>
              {f.replace("sample-repo/", "")}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="fn-input">Function name (optional)</label>
        <input
          id="fn-input"
          type="text"
          placeholder="e.g. comparePassword"
          value={functionName}
          onChange={(e) => onFunctionChange(e.target.value)}
        />
      </div>

      <button
        className="btn-analyze"
        onClick={onAnalyze}
        disabled={loading}
      >
        {loading ? "Analyzing…" : "Analyze"}
      </button>
    </div>
  );
}
