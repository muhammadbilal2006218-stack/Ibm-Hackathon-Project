import { useState } from "react";
import FilePicker from "./components/FilePicker";
import ReportView from "./components/ReportView";
import "./App.css";

const SAMPLE_FILES = [
  "sample-repo/src/routes/auth.js",
  "sample-repo/src/routes/users.js",
  "sample-repo/src/db/users.js",
  "sample-repo/src/utils/crypto.js",
  "sample-repo/src/utils/validation.js",
  "sample-repo/src/middleware/auth.js",
  "sample-repo/src/index.js",
];

export default function App() {
  const [filePath, setFilePath] = useState(SAMPLE_FILES[0]);
  const [functionName, setFunctionName] = useState("comparePassword");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, functionName: functionName || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setReport(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>Code Investigation Dashboard</h1>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <FilePicker
            files={SAMPLE_FILES}
            filePath={filePath}
            functionName={functionName}
            onFileChange={setFilePath}
            onFunctionChange={setFunctionName}
            onAnalyze={handleAnalyze}
            loading={loading}
          />
        </aside>
        <main className="content">
          {error && <div className="error-banner">⚠ {error}</div>}
          <ReportView report={report} loading={loading} />
        </main>
      </div>
    </div>
  );
}
