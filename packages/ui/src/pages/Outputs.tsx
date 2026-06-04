import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { FileText, ChevronDown, ChevronRight, Clock } from "lucide-react";
import CustomSelect from "../components/CustomSelect";

const DIRECTIONS = ["analysis", "implementation", "decision", "review", "question"];
const SOURCE_LIST = ["claude-code", "openclaw", "codex", "doubao", "yuanbao", "workbuddy", "manual"];

const DIRECTION_LABELS: Record<string, string> = {
  analysis: "分析",
  implementation: "实现",
  decision: "决策",
  review: "审查",
  question: "提问",
};

const SOURCE_OPTIONS = [
  { value: "", label: "全部来源" },
  ...SOURCE_LIST.map((source) => ({ value: source, label: source })),
];
const DIRECTION_OPTIONS = [
  { value: "", label: "全部类型" },
  ...DIRECTIONS.map((direction) => ({ value: direction, label: DIRECTION_LABELS[direction] || direction })),
];

export default function Outputs() {
  const [outputs, setOutputs] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");

  const load = () => {
    const filter: any = { limit: 100 };
    if (sourceFilter) filter.source = sourceFilter;
    if (directionFilter) filter.direction = directionFilter;
    api.listOutputs(filter).then(setOutputs);
  };

  useEffect(() => { load(); }, [sourceFilter, directionFilter]);

  return (
    <div className="outputs-scroll">

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <CustomSelect
          value={sourceFilter}
          onChange={setSourceFilter}
          options={SOURCE_OPTIONS}
          style={{ width: 140 }}
        />
        <CustomSelect
          value={directionFilter}
          onChange={setDirectionFilter}
          options={DIRECTION_OPTIONS}
          style={{ width: 130 }}
        />
      </div>

      {/* Timeline */}
      {outputs.length === 0 ? (
        <div className="empty-state">
          <FileText size={32} style={{ color: "var(--muted)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>暂无输出</p>
            <p className="text-xs mt-1">Agent 的输出会自动归集到这里</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {outputs.map((o) => {
            const isOpen = expanded === o.id;
            return (
              <div key={o.id} className="content-card overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : o.id)}
                  className="w-full flex items-center gap-3 px-4 text-left transition-colors"
                  style={{ minHeight: "42px" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-raised)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  {isOpen ? <ChevronDown size={14} style={{ color: "var(--muted)" }} /> : <ChevronRight size={14} style={{ color: "var(--muted)" }} />}
                  <span className={`text-xs font-semibold w-20 text-left source-${o.source}`}>{o.source}</span>
                  <span className={`type-badge type-${o.direction}`}>
                    {DIRECTION_LABELS[o.direction] || o.direction}
                  </span>
                  <span className="text-[13px] flex-1 truncate" style={{ color: "var(--text)" }}>{o.title}</span>
                  <span className="text-[11px] mono shrink-0 flex items-center gap-1" style={{ color: "var(--muted)" }}>
                    <Clock size={10} />
                    {new Date(o.created_at).toLocaleString("zh-CN")}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: "var(--line)" }}>
                    <pre
                      className="text-xs whitespace-pre-wrap break-words p-3 rounded-md mono"
                      style={{ background: "var(--paper)", color: "var(--text-secondary)", border: "1px solid var(--line)" }}
                    >
                      {o.content}
                    </pre>
                    {o.tags?.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {o.tags.map((t: string) => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.5 rounded-md"
                            style={{ color: "var(--muted)", background: "var(--paper-raised)", border: "1px solid var(--line)" }}
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
