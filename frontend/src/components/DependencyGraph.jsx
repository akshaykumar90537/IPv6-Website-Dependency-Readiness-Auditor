import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import ReactFlow, { Background, Controls, Handle, MarkerType, Position, useReactFlow, ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";

/* ───── colour palette (shared with legend & nodes) ───── */
const COLOR_HEX = {
  green: "#157F3C",
  yellow: "#D97706",
  orange: "#D97706",
  red: "#DC2626",
  gray: "#64748B",
};

const COLOR_BG = {
  green: "#ECFDF5",
  yellow: "#FFFBEB",
  orange: "#FFFBEB",
  red: "#FEF2F2",
  gray: "#F8FAFC",
};

/* ───── utility: truncate a label for display ───── */
function truncateLabel(text, maxLen = 28) {
  if (!text || text.length <= maxLen) return text;
  /* For URLs: show host + start of path + ellipsis */
  try {
    const u = new URL(text);
    const host = u.hostname;
    const rest = u.pathname + u.search;
    if (host.length >= maxLen - 3) return host.slice(0, maxLen - 3) + "…";
    const remaining = maxLen - host.length - 1; /* 1 for the slash */
    if (rest.length <= remaining) return host + rest;
    return host + rest.slice(0, remaining - 1) + "…";
  } catch {
    /* Not a URL – simple truncation */
    return text.slice(0, maxLen - 1) + "…";
  }
}

/** Maps a backend verdict to one of the graph's four colours. Purely presentational. */
function familyColor(verdict) {
  if (!verdict) return "gray";
  if (verdict.endsWith("_REACHABLE")) return "green";
  if (verdict.endsWith("_FAILURE")) return "red";
  return "gray";
}

/* ───── portal-rendered viewport-aware tooltip component ───── */
function NodeTooltip({ text, title, visible, x, top, bottom }) {
  if (!visible || !text || typeof document === "undefined") return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  // Calculate horizontal bounds to ensure tooltip stays inside viewport with at least 16px padding
  const halfWidth = Math.min(200, (vw - 32) / 2);
  const safeX = Math.max(16 + halfWidth, Math.min(vw - 16 - halfWidth, x));

  // If node is close to the top of viewport (< 120px), place tooltip below node
  const showBelow = top < 120;
  const targetY = showBelow ? (bottom ?? top) + 8 : top - 8;

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: safeX,
        top: targetY,
        transform: showBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)",
        zIndex: 9999,
        backgroundColor: "#0f172a",
        color: "#f8fafc",
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        padding: "10px 14px",
        borderRadius: 8,
        width: "max-content",
        minWidth: "min(280px, calc(100vw - 32px))",
        maxWidth: "min(400px, calc(100vw - 32px))",
        boxSizing: "border-box",
        whiteSpace: "normal",
        wordBreak: "normal",
        overflowWrap: "anywhere",
        lineHeight: 1.5,
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 8px 10px -6px rgba(0, 0, 0, 0.35)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        pointerEvents: "none",
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#94a3b8",
            marginBottom: 4,
            fontWeight: 700,
          }}
        >
          {title}
        </div>
      )}
      <div style={{ color: "#f8fafc", fontWeight: 500 }}>
        {text}
      </div>
    </div>,
    document.body
  );
}

/* ───── Host node (custom ReactFlow node) ───── */
function HostNode({ data }) {
  const node = data.raw;
  const v4 = familyColor(node.ipv4_verdict);
  const v6 = familyColor(node.ipv6_verdict);
  const isSelected = data.isSelected;

  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, top: 0, bottom: 0 });
  const timerRef = useRef(null);

  const handleMouseEnter = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: rect.left + rect.width / 2,
      top: rect.top,
      bottom: rect.bottom,
    });
    timerRef.current = setTimeout(() => setTooltipVisible(true), 500);
  }, []);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(timerRef.current);
    setTooltipVisible(false);
  }, []);

  const handleFocus = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: rect.left + rect.width / 2,
      top: rect.top,
      bottom: rect.bottom,
    });
    setTooltipVisible(true);
  }, []);

  const handleBlur = useCallback(() => {
    clearTimeout(timerRef.current);
    setTooltipVisible(false);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const chip = (fam, color) => (
    <span
      title={`IPv${fam}: ${node[`ipv${fam}_verdict`] || "NOT_TESTED"}`}
      style={{
        background: COLOR_HEX[color] || COLOR_HEX.gray,
        color: "#fff",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 7px",
        fontFamily: "ui-monospace, monospace",
      }}
    >
      {fam}
    </span>
  );

  return (
    <>
      <div
        tabIndex={0}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{
          background: COLOR_BG[node.color] || "#fff",
          border: `2px solid ${COLOR_HEX[node.color] || "#CBD5E1"}`,
          borderRadius: 8,
          padding: "10px 14px",
          width: 200,
          fontFamily: "ui-monospace, monospace",
          color: "#0f172a",
          cursor: "pointer",
          boxShadow: isSelected
            ? `0 0 0 3px ${COLOR_HEX[node.color] || "#2563EB"}44, 0 4px 12px rgba(0,0,0,0.12)`
            : "0 1px 4px rgba(0,0,0,0.06)",
          transition: "box-shadow 0.15s ease, transform 0.15s ease",
          outline: "none",
        }}
      >
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            marginBottom: 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={node.label}
        >
          {truncateLabel(node.label, 24)}
        </div>
        <div style={{ display: "flex", gap: 6 }}>{chip(4, v4)}{chip(6, v6)}</div>
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </div>
      <NodeTooltip
        title="Host"
        text={node.label}
        visible={tooltipVisible}
        x={tooltipPos.x}
        top={tooltipPos.top}
        bottom={tooltipPos.bottom}
      />
    </>
  );
}

/* ───── Resource node (custom ReactFlow node) ───── */
function ResourceNode({ data }) {
  const node = data.raw;
  const isSelected = data.isSelected;

  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, top: 0, bottom: 0 });
  const timerRef = useRef(null);

  const handleMouseEnter = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: rect.left + rect.width / 2,
      top: rect.top,
      bottom: rect.bottom,
    });
    timerRef.current = setTimeout(() => setTooltipVisible(true), 500);
  }, []);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(timerRef.current);
    setTooltipVisible(false);
  }, []);

  const handleFocus = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: rect.left + rect.width / 2,
      top: rect.top,
      bottom: rect.bottom,
    });
    setTooltipVisible(true);
  }, []);

  const handleBlur = useCallback(() => {
    clearTimeout(timerRef.current);
    setTooltipVisible(false);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const typeLabel = node.resource_type || "";
  const typeShort = typeLabel.length > 7 ? typeLabel.slice(0, 6) + "…" : typeLabel;

  return (
    <>
      <div
        tabIndex={0}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{
          background: COLOR_BG[node.color] || "#fff",
          border: `2px solid ${COLOR_HEX[node.color] || "#CBD5E1"}`,
          borderRadius: 8,
          padding: "8px 10px",
          width: 160,
          fontFamily: "ui-monospace, monospace",
          color: "#0f172a",
          cursor: "pointer",
          fontSize: 11.5,
          boxShadow: isSelected
            ? `0 0 0 3px ${COLOR_HEX[node.color] || "#2563EB"}44, 0 4px 12px rgba(0,0,0,0.12)`
            : "0 1px 3px rgba(0,0,0,0.06)",
          transition: "box-shadow 0.15s ease, transform 0.15s ease",
          outline: "none",
        }}
      >
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <div
          style={{
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: typeShort ? 4 : 0,
          }}
          title={node.url || node.label}
        >
          {truncateLabel(node.label, 20)}
        </div>
        {typeShort && (
          <div
            style={{
              fontSize: 10,
              color: "#64748B",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {typeShort}
          </div>
        )}
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </div>
      <NodeTooltip
        title={node.resource_type ? `${node.resource_type} Resource` : "Resource"}
        text={node.url || node.label}
        visible={tooltipVisible}
        x={tooltipPos.x}
        top={tooltipPos.top}
        bottom={tooltipPos.bottom}
      />
    </>
  );
}

const NODE_TYPES = { host: HostNode, resource: ResourceNode };

/* ───── layout engine ───── */
function layout(nodes) {
  const hosts = nodes.filter((n) => n.kind === "host");
  const byHost = {};
  for (const n of nodes) if (n.kind === "resource") (byHost[n.hostname] ||= []).push(n);

  const positioned = [];
  let hx = 0;
  const HOST_W = 200;
  const RES_W = 160;
  const RES_GAP = 20;
  const HOST_GAP = 80;
  const TIER_Y = 180;

  for (const h of hosts) {
    const kids = byHost[h.label] || [];
    const kidsWidth = kids.length > 0
      ? kids.length * RES_W + (kids.length - 1) * RES_GAP
      : 0;
    const hostCenter = hx + Math.max(kidsWidth, HOST_W) / 2 - HOST_W / 2;

    positioned.push({ id: h.id, x: hostCenter, y: 0, node: h });

    kids.forEach((k, i) => {
      const kx = hx + i * (RES_W + RES_GAP);
      positioned.push({ id: k.id, x: kx, y: TIER_Y, node: k });
    });

    hx += Math.max(kidsWidth, HOST_W) + HOST_GAP;
  }
  return positioned;
}

function toFlowNode({ id, x, y, node }, selectedId) {
  const isSelected = id === selectedId;
  return {
    id,
    position: { x, y },
    type: node.kind === "host" ? "host" : "resource",
    sourcePosition: "bottom",
    targetPosition: "top",
    data: { label: node.label, raw: node, isSelected },
  };
}

/* ───── high-contrast compact legend (above graph) ───── */
function GraphLegend({ legend }) {
  const items = useMemo(() => {
    // If backend provided legend dictionary, preserve its labels
    return [
      { key: "green", color: COLOR_HEX.green, label: legend?.green || "IPv6 reachable" },
      { key: "yellow", color: COLOR_HEX.yellow, label: legend?.yellow || "IPv6 partially available / uncertain" },
      { key: "red", color: COLOR_HEX.red, label: legend?.red || "IPv6 failure" },
      { key: "gray", color: COLOR_HEX.gray, label: legend?.gray || "Not tested / unavailable" },
    ];
  }, [legend]);

  return (
    <div
      style={{
        backgroundColor: "#f8fafc",
        borderBottom: "1px solid #e2e8f0",
        padding: "10px 16px",
      }}
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 text-xs sm:text-sm select-none"
    >
      {/* Left: Status Indicators */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span
          style={{ letterSpacing: "0.06em" }}
          className="font-bold text-slate-500 uppercase text-[11px]"
        >
          Legend
        </span>
        {items.map((item) => (
          <div key={item.key} className="inline-flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-full inline-block shrink-0 shadow-xs"
              style={{
                backgroundColor: item.color,
                border: "1.5px solid rgba(0, 0, 0, 0.12)",
              }}
              aria-hidden="true"
            />
            <span className="text-slate-800 font-medium whitespace-nowrap">
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Right: Dual-Protocol Node Chip Guide */}
      <div
        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 shadow-2xs text-xs"
        title="Host nodes display dual protocol chips: 4 = IPv4 reachability, 6 = IPv6 reachability. Green = reachable, Red = failure."
      >
        <span className="font-semibold text-slate-600">Node Chips:</span>
        <div className="inline-flex items-center gap-1 font-mono text-[11px] font-bold">
          <span
            className="px-1.5 py-0.5 rounded text-white"
            style={{ backgroundColor: COLOR_HEX.green }}
          >
            4
          </span>
          <span className="text-slate-500 font-sans font-normal text-xs">IPv4</span>
          <span
            className="px-1.5 py-0.5 rounded text-white ml-1"
            style={{ backgroundColor: COLOR_HEX.green }}
          >
            6
          </span>
          <span className="text-slate-500 font-sans font-normal text-xs">IPv6</span>
        </div>
        <span
          className="text-slate-400 text-xs ml-0.5 cursor-help"
          title="Green chip = reachable, Red chip = failure, Gray chip = not tested"
        >
          ⓘ
        </span>
      </div>
    </div>
  );
}

/* ───── Canvas Full Screen Toggle Button (placed inside graph canvas) ───── */
function CanvasFullscreenButton({ isFullscreen, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={isFullscreen ? "Exit full screen (Esc)" : "Open dependency graph in full screen"}
      aria-label={isFullscreen ? "Exit full screen" : "Open dependency graph in full screen"}
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 20,
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-300 shadow-sm transition-all duration-150 backdrop-blur-xs font-sans text-xs font-semibold cursor-pointer select-none group focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {isFullscreen ? (
        <>
          <svg
            className="w-4 h-4 text-slate-600 group-hover:text-slate-900 transition-colors"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          <span>Exit Full Screen</span>
        </>
      ) : (
        <>
          <svg
            className="w-4 h-4 text-slate-600 group-hover:text-slate-900 transition-colors"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          <span>Full Screen</span>
        </>
      )}
    </button>
  );
}

/* ───── inner graph (needs ReactFlowProvider above it) ───── */
function GraphInner({
  flowNodes,
  flowEdges,
  selectedId,
  setSelectedId,
  onSelect,
  graphHeight,
  isFullscreen,
  onToggleFullscreen,
}) {
  const { fitView } = useReactFlow();

  /* Refit when nodes change, fullscreen toggles, or height changes */
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.15, duration: 250 }), 60);
    return () => clearTimeout(timer);
  }, [flowNodes, graphHeight, isFullscreen, fitView]);

  /* Also refit on window resize */
  useEffect(() => {
    const handleResize = () => fitView({ padding: 0.15, duration: 150 });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fitView]);

  return (
    <div
      style={{
        position: "relative",
        height: graphHeight,
        width: "100%",
        overflow: "hidden",
      }}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        onNodeClick={(_, n) => {
          setSelectedId(n.id);
          onSelect(n.data.raw);
        }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="#E2E8F0" size={1} />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>

      {/* Full Screen button overlaid directly inside the top-right corner of the canvas */}
      <CanvasFullscreenButton
        isFullscreen={isFullscreen}
        onClick={onToggleFullscreen}
      />
    </div>
  );
}

/* ───── fullscreen modal overlay ───── */
function FullscreenOverlay({ children, onClose }) {
  /* Prevent background scroll */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* Escape key to close */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        padding: "16px",
      }}
    >
      <div
        style={{
          flex: 1,
          width: "100%",
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid #cbd5e1",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ───── main export ───── */
export default function DependencyGraph({ graph, onSelect }) {
  const [selectedId, setSelectedId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graph) return { flowNodes: [], flowEdges: [] };
    const positions = layout(graph.nodes);
    const flowNodes = positions.map((p) => toFlowNode(p, selectedId));
    const flowEdges = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      animated: false,
      style: {
        stroke: e.kind === "hosts" ? "#CBD5E1" : "#94A3B8",
        strokeWidth: e.kind === "hosts" ? 1.5 : 1,
        strokeDasharray: e.inferred ? "5 3" : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: e.kind === "hosts" ? "#CBD5E1" : "#94A3B8",
        width: 16,
        height: 16,
      },
    }));
    return { flowNodes, flowEdges };
  }, [graph, selectedId]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((f) => !f);
  }, []);

  if (!graph) return <div className="text-base text-muted p-6">Run a scan to see the dependency graph.</div>;
  if (graph.nodes.length === 0) return <div className="text-base text-muted p-6">No resources were discovered to graph.</div>;

  /* Graph content: Legend directly followed by the canvas (no separate toolbar row) */
  const renderGraph = (height, fullscreen) => (
    <ReactFlowProvider>
      <GraphLegend legend={graph.legend} />
      <GraphInner
        flowNodes={flowNodes}
        flowEdges={flowEdges}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        onSelect={onSelect}
        graphHeight={height}
        isFullscreen={fullscreen}
        onToggleFullscreen={handleToggleFullscreen}
      />
    </ReactFlowProvider>
  );

  if (isFullscreen) {
    return (
      <>
        {/* Inline placeholder so page layout remains stable while overlay is active */}
        <div
          className="border border-slate-200 rounded-xl bg-surface shadow-xs overflow-hidden"
          style={{ height: 520 }}
        >
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Dependency graph is open in full-screen mode
          </div>
        </div>
        <FullscreenOverlay onClose={handleToggleFullscreen}>
          {renderGraph("100%", true)}
        </FullscreenOverlay>
      </>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-xs overflow-hidden flex flex-col">
      {renderGraph(520, false)}
    </div>
  );
}
