import { useState } from "react";
import { useScanPolling } from "../hooks/useScanPolling";
import { useBatchPolling } from "../hooks/useBatchPolling";
import Tabs from "../components/Tabs";
import MetricStrip from "../components/MetricStrip";
import ResourceTable from "../components/ResourceTable";
import DependencyGraph from "../components/DependencyGraph";
import NodeDetailPanel from "../components/NodeDetailPanel";
import FailuresView from "../components/FailuresView";
import IPv4Vs6View from "../components/IPv4Vs6View";
import MeasurementsView from "../components/MeasurementsView";
import ReportsView from "../components/ReportsView";
import BatchView from "../components/BatchView";
import Ipv6BrokenHighlight from "../components/Ipv6BrokenHighlight";
import Footer from "../components/Footer";
import { api } from "../api/client";

const STATUS_LABEL = {
  QUEUED: "Queued", RUNNING: "Scanning…", COMPLETED: "Completed",
  PARTIAL: "Completed with warnings", BLOCKED: "Blocked", SCAN_FAILED: "Scan failed",
};

export default function Dashboard({ onNavigate }) {
  const [mode, setMode] = useState("single"); // "single" | "batch"
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState("Overview");
  const [selectedNode, setSelectedNode] = useState(null);
  const [context, setContext] = useState(null);
  const scanState = useScanPolling();
  const batchState = useBatchPolling();
  const { scan, resources, probes, graph, error } = scanState;

  async function onAnalyze(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setSelectedNode(null); setContext(null);
    await scanState.start(url.trim());
  }

  async function onViewBatchSite(scanId) {
    setMode("single"); setTab("Overview"); setSelectedNode(null); setContext(null);
    await scanState.loadExisting(scanId);
  }

  async function openMeasurements() {
    setTab("Measurements");
    if (scan?.scan_id) {
      try { setContext(await api.getContext(scan.scan_id)); }
      catch { /* handled by MeasurementsView's empty state */ }
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-between w-full">
      <main className="max-w-7xl w-full mx-auto px-6 pt-8 pb-8 flex-1 flex flex-col gap-6">
        <header className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-primary">IPv6 Website &amp; Dependency Readiness Auditor</h1>
        <p className="text-sm md:text-base text-muted max-w-4xl leading-relaxed">
          Loads pages in a real browser, tests every dependency over IPv4 and IPv6 separately, and shows exactly
          where connectivity breaks. An AAAA record is never treated as proof of IPv6 readiness.
        </p>
      </header>

      <div className="flex gap-6 border-b border-border">
        <button onClick={() => setMode("single")}
          className={`text-base pb-3 border-b-2 font-medium transition-colors ${mode === "single" ? "border-primary text-primary font-semibold" : "border-transparent text-muted hover:text-ink"}`}>
          Scan a URL
        </button>
        <button onClick={() => setMode("batch")}
          className={`text-base pb-3 border-b-2 font-medium transition-colors ${mode === "batch" ? "border-primary text-primary font-semibold" : "border-transparent text-muted hover:text-ink"}`}>
          30-Site Batch
        </button>
      </div>

      {mode === "batch" ? (
        <BatchView {...batchState} onStart={batchState.start} onViewSite={onViewBatchSite} />
      ) : (
        <>
          <form onSubmit={onAnalyze} className="flex gap-3 items-stretch">
            <input
              value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com"
              className="flex-1 border-2 border-border/80 rounded-lg px-4 py-3 text-base bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 font-mono shadow-sm transition-all"
            />
            <button type="submit" className="bg-primary hover:bg-primary-hover active:scale-[0.98] text-white text-base font-semibold px-6 py-3 rounded-lg shadow-sm transition-all whitespace-nowrap">
              Analyze
            </button>
          </form>

          {error && <div className="text-base text-status-red bg-status-red-bg border border-status-red/30 rounded-lg px-4 py-3 shadow-xs">{error}</div>}

          {scan && (
            <div className="flex items-center gap-3 text-base font-medium">
              <span className="text-muted">Scan {scan.scan_id}</span>
              <span className="font-semibold">{STATUS_LABEL[scan.status] || scan.status}</span>
              {scan.error && <span className="text-status-amber text-sm font-normal">({scan.error})</span>}
            </div>
          )}

          <MetricStrip summary={scan?.summary} />

          <Tabs active={tab} onChange={(t) => (t === "Measurements" ? openMeasurements() : setTab(t))} />

          <div>
            {tab === "Overview" && (
              scan ? (
                <div className="flex flex-col gap-5">
                  <Ipv6BrokenHighlight probes={probes} resources={resources} />
                  <div className="text-base text-muted border border-border rounded-xl bg-surface p-5 shadow-xs leading-relaxed">
                    Use the tabs above to inspect discovered resources, the dependency graph, IPv4 vs IPv6
                    results, and failures for this scan.
                  </div>
                </div>
              ) : (
                <div className="text-base text-muted border border-border rounded-xl bg-surface p-6 shadow-xs leading-relaxed">
                  Enter a URL above and click Analyze to start a scan.
                </div>
              )
            )}
            {tab === "Resources" && <ResourceTable resources={resources} probes={probes} />}
            {tab === "Dependency Graph" && (
              <div className="flex flex-col gap-5">
                <DependencyGraph graph={graph} onSelect={setSelectedNode} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <NodeDetailPanel node={selectedNode} probes={probes} />
                  <div />
                </div>
              </div>
            )}
            {tab === "IPv4 vs IPv6" && <IPv4Vs6View probes={probes} resources={resources} />}
            {tab === "Failures" && <FailuresView probes={probes} />}
            {tab === "Measurements" && <MeasurementsView context={context} />}
            {tab === "Reports" && <ReportsView scanId={scan?.scan_id} />}
          </div>
        </>
      )}
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
