import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Btn, Panel, PaperCard, Reveal, Td, Th } from "@/components/ui";
import { cn } from "@/utils/cn";

import typesSrc from "../engine/types.ts?raw";
import graphSrc from "../engine/Graph.ts?raw";
import heapSrc from "../engine/MinHeap.ts?raw";
import dijkstraSrc from "../engine/Dijkstra.ts?raw";
import assemblySrc from "../engine/AssemblyLine.ts?raw";
import dispatchSrc from "../engine/DispatchEngine.ts?raw";
import mockSrc from "../engine/mockData.ts?raw";

interface FileEntry {
  name: string;
  path: string;
  feature: string;
  src: string;
  blurb: string;
}

const FILES: FileEntry[] = [
  { name: "types.ts", path: "src/engine/types.ts", feature: "domain", src: typesSrc, blurb: "Station / Route / Edge records, effective-weight helpers, clock formatting." },
  { name: "Graph.ts", path: "src/engine/Graph.ts", feature: "01 topology", src: graphSrc, blurb: "Adjacency-list multigraph: validated inserts, dynamic weights, BFS components." },
  { name: "MinHeap.ts", path: "src/engine/MinHeap.ts", feature: "02 heap", src: heapSrc, blurb: "From-scratch binary min-heap with siftUp/siftDown, Floyd build-heap and self-instrumentation." },
  { name: "DispatchEngine.ts", path: "src/engine/DispatchEngine.ts", feature: "02 dispatch", src: dispatchSrc, blurb: "Vehicle lifecycle driven by extract-min on arrival timestamps." },
  { name: "Dijkstra.ts", path: "src/engine/Dijkstra.ts", feature: "03 planner", src: dijkstraSrc, blurb: "SSSP with lazy deletion, full relaxation trace and unreachable-target reporting." },
  { name: "AssemblyLine.ts", path: "src/engine/AssemblyLine.ts", feature: "04 transfer", src: assemblySrc, blurb: "Two-line dynamic program, traceback, plus a 2^n brute-force oracle." },
  { name: "mockData.ts", path: "src/engine/mockData.ts", feature: "fixture", src: mockSrc, blurb: "14 stations, 21 segments, seeded fleet and the express-corridor matrices." },
];

const KEYWORDS =
  /^(export|import|from|const|let|var|function|return|if|else|for|while|do|break|continue|class|extends|implements|new|this|typeof|instanceof|interface|type|enum|public|private|protected|readonly|static|async|await|try|catch|finally|throw|switch|case|default|as|in|of|is|void|null|undefined|true|false|declare|namespace|keyof|infer)$/;

const TOKEN_RE = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|[A-Z][A-Za-z0-9_]*|[{}()[\];,.:?]|=>|[+\-*/%<>=!&|]+)/g;

function highlightLine(line: string, keyBase: number): ReactNode[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("//")) {
    return [
      <span key={`${keyBase}-c`} className="text-[#5c7f8f] italic">
        {line}
      </span>,
    ];
  }
  const commentAt = line.indexOf("//");
  const code = commentAt >= 0 ? line.slice(0, commentAt) : line;
  const comment = commentAt >= 0 ? line.slice(commentAt) : "";

  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  let k = 0;
  while ((m = TOKEN_RE.exec(code)) !== null) {
    if (m.index > last) out.push(<span key={`${keyBase}-w${k}`}>{code.slice(last, m.index)}</span>);
    const tok = m[0];
    let cls = "text-mist-200";
    if (/^["'`]/.test(tok)) cls = "text-[#9fd6a8]";
    else if (/^\d/.test(tok)) cls = "text-[#ffc24b]";
    else if (KEYWORDS.test(tok)) cls = "text-[#f2869b] font-medium";
    else if (/^[A-Z]/.test(tok)) cls = "text-[#7fc4ff]";
    else if (/^(=>|[+\-*/%<>=!&|]+|[{}()[\];,.:?])$/.test(tok)) cls = "text-[#8ba3b1]";
    else cls = "text-[#d6e4ec]";
    out.push(
      <span key={`${keyBase}-t${k++}`} className={cls}>
        {tok}
      </span>,
    );
    last = m.index + tok.length;
  }
  if (last < code.length) out.push(<span key={`${keyBase}-tail`}>{code.slice(last)}</span>);
  if (comment)
    out.push(
      <span key={`${keyBase}-cmt`} className="text-[#5c7f8f] italic">
        {comment}
      </span>,
    );
  return out;
}

const COMPLEXITY: [string, string, string, string][] = [
  ["Adjacency list — insert node", "O(1)", "O(V + E)", "Hash bucket per station; edges appended to two buckets (undirected)."],
  ["Adjacency list — neighbours", "O(deg v)", "O(V + E)", "Sparse metro nets keep deg ≈ 3, so scans are near-constant."],
  ["Set dynamic weight", "O(V + E)", "—", "Rewrites both half-edges so the next query sees congestion."],
  ["BFS components / reachability", "O(V + E)", "O(V)", "Explains *why* a plan failed instead of returning ∞ silently."],
  ["MinHeap — push", "O(log n)", "O(n)", "siftUp compares against ⌊(i−1)/2⌋ until the invariant holds."],
  ["MinHeap — pop (extract-min)", "O(log n)", "O(n)", "Root replaced by the last leaf, then siftDown."],
  ["MinHeap — peek / size", "O(1)", "O(n)", "The minimum always lives at index 0."],
  ["Floyd build-heap", "O(n)", "O(n)", "Used after a linear removal — *not* n × log n."],
  ["Dijkstra (binary heap)", "O((V+E) log V)", "O(V)", "Lazy deletion avoids decrease-key; stale entries are skipped."],
  ["Assembly-line DP", "O(n)", "O(n)", "Two rows of n cells, one pass, versus 2^n assignments."],
];

const EDGE_CASES: [string, string, string][] = [
  ["Duplicate station / route", "Graph.addStation · addRoute", "typed GraphError with a code, surfaced inline and in the console"],
  ["Unknown endpoint on a new route", "Graph.addRoute", "rejected before any mutation — topology stays consistent"],
  ["Negative or zero weight", "Graph.addRoute · setDelay", "rejected; effective weight is additionally clamped ≥ 0 at read time"],
  ["Self-loop", "Graph.addRoute", "rejected as unroutable"],
  ["Isolated station (OLD)", "fixture + Graph.isolatedStations", "degree-0 bucket, dashed ring on the map, listed by `components`"],
  ["Unreachable destination", "Dijkstra", "found=false plus the settled set, so the UI prints the component"],
  ["Source === target", "Dijkstra", "zero-cost trivial path, no iterations, no heap churn"],
  ["Parallel edges (MKT–CEN twice)", "adjacency list multigraph", "both relaxed; the cheaper one wins naturally"],
  ["Empty dispatch schedule", "MinHeap.pop · DispatchEngine.tick", "pop() returns undefined, tick() is a no-op — never throws"],
  ["Tied arrival timestamps", "heap comparator", "tie-broken on vehicle id → deterministic, reproducible output"],
  ["Route deleted mid-journey", "DispatchEngine.processArrival", "missing edge triggers a re-plan from the current platform"],
  ["Destination cut off mid-journey", "DispatchEngine.replanAll", "vehicle is withdrawn with a HOLD event instead of vanishing"],
  ["Empty corridor / ragged matrix", "solveAssemblyLine", "AssemblyError before any allocation"],
  ["DP correctness", "bruteForceAssembly", "2^n oracle compared against the DP result in the UI and CLI"],
];

export default function SourceTab() {
  const [active, setActive] = useState(2);
  const [query, setQuery] = useState("");
  const file = FILES[active];
  const srcLines = useMemo(() => file.src.replace(/\t/g, "  ").split("\n"), [file.src]);

  const matches = useMemo(() => {
    if (!query.trim()) return new Set<number>();
    const q = query.trim().toLowerCase();
    const set = new Set<number>();
    srcLines.forEach((l, i) => {
      if (l.toLowerCase().includes(q)) set.add(i);
    });
    return set;
  }, [query, srcLines]);

  const copy = () => {
    void navigator.clipboard?.writeText(file.src);
  };
  const download = () => {
    const blob = new Blob([file.src], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Reveal>
        <Panel code="SRC" title="Engine source · seven modules, zero runtime dependencies" bodyClass="p-3">
          <div className="grid gap-3 lg:grid-cols-[210px_minmax(0,1fr)]">
            <div className="space-y-1">
              {FILES.map((f, i) => (
                <button
                  key={f.path}
                  onClick={() => setActive(i)}
                  className={cn(
                    "group block w-full rounded-[3px] border px-2 py-1.5 text-left transition-all",
                    i === active ? "border-signal-500/70 bg-signal-500/12" : "border-white/8 bg-ink-950/50 hover:border-white/25",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("font-mono text-[11.5px]", i === active ? "text-signal-300" : "text-mist-200")}>{f.name}</span>
                    <span className="hud-num text-[9px] text-mist-500">{f.src.split("\n").length}L</span>
                  </div>
                  <span className="sign mt-0.5 block text-[8.5px] text-mist-500 group-hover:text-mist-400">{f.feature}</span>
                </button>
              ))}
            </div>

            <div className="min-w-0 overflow-hidden rounded-sm border border-white/10 bg-ink-950">
              <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-ink-800/80 px-3 py-2">
                <span className="font-mono text-[11px] text-mist-300">{file.path}</span>
                <span className="sign rounded-[2px] bg-signal-500/15 px-1.5 py-0.5 text-[8.5px] text-signal-400">{file.feature}</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="filter lines…"
                  className="ml-auto w-36 rounded-[2px] border border-white/12 bg-ink-950 px-2 py-1 font-mono text-[10.5px] text-mist-100 outline-none focus:border-signal-500"
                />
                <Btn size="sm" variant="outline" onClick={copy}>
                  copy
                </Btn>
                <Btn size="sm" variant="outline" onClick={download}>
                  download
                </Btn>
              </div>
              <p className="border-b border-white/8 bg-ink-900/60 px-3 py-1.5 font-mono text-[10.5px] text-mist-400">{file.blurb}</p>
              <div className="max-h-[560px] overflow-auto">
                <pre className="min-w-full py-2 font-mono text-[11.5px] leading-[1.55]">
                  {srcLines.map((l, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-3 px-3 hover:bg-white/4",
                        matches.size > 0 && !matches.has(i) && "opacity-25",
                        matches.has(i) && "bg-signal-500/10",
                      )}
                    >
                      <span className="w-8 shrink-0 select-none text-right text-[10px] text-ink-500">{i + 1}</span>
                      <code className="whitespace-pre">{highlightLine(l, i)}</code>
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          </div>
        </Panel>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal delay={50}>
          <PaperCard>
            <div className="border-b border-black/15 px-3 py-2">
              <h3 className="sign text-[12px] text-ink-800">Complexity ledger</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Operation</Th>
                    <Th className="w-24">Time</Th>
                    <Th className="w-20">Space</Th>
                    <Th>Why</Th>
                  </tr>
                </thead>
                <tbody>
                  {COMPLEXITY.map(([op, t, s, why]) => (
                    <tr key={op}>
                      <Td className="font-semibold">{op}</Td>
                      <Td className="text-signal-600">{t}</Td>
                      <Td>{s}</Td>
                      <Td className="text-[10px] text-ink-600">{why}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PaperCard>
        </Reveal>

        <Reveal delay={80}>
          <PaperCard>
            <div className="border-b border-black/15 px-3 py-2">
              <h3 className="sign text-[12px] text-ink-800">Edge-case register</h3>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0">
                  <tr>
                    <Th>Case</Th>
                    <Th className="w-40">Where</Th>
                    <Th>Behaviour</Th>
                  </tr>
                </thead>
                <tbody>
                  {EDGE_CASES.map(([c, w, b]) => (
                    <tr key={c}>
                      <Td className="font-semibold">{c}</Td>
                      <Td className="text-[10px]">{w}</Td>
                      <Td className="text-[10px] text-ink-600">{b}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PaperCard>
        </Reveal>
      </div>
    </div>
  );
}
