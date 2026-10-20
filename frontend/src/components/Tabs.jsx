const TABS = ["Overview", "Resources", "Dependency Graph", "IPv4 vs IPv6", "Failures", "Measurements", "Reports"];

export default function Tabs({ active, onChange }) {
  return (
    <div className="flex gap-7 border-b border-border overflow-x-auto pb-px scrollbar-none">
      {TABS.map((t) => (
        <button key={t} onClick={() => onChange(t)} className={`tab-underline ${active === t ? "active" : ""}`}>
          {t}
        </button>
      ))}
    </div>
  );
}

export { TABS };
