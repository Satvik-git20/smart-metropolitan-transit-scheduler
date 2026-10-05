import { useEffect, useMemo, useState } from "react";
import { TransitProvider, useTransit } from "@/state/store";
import { Blink, LineBadge, Stat } from "@/components/ui";
import NetworkTab from "@/components/NetworkTab";
import DispatchTab from "@/components/DispatchTab";
import PlannerTab from "@/components/PlannerTab";
import TransferTab from "@/components/TransferTab";
import TerminalTab from "@/components/TerminalTab";
import SourceTab from "@/components/SourceTab";
import { formatClock } from "@/engine/types";
import { cn } from "@/utils/cn";

type TabId = "network" | "dispatch" | "planner" | "transfer" | "console" | "source";

const TABS: { id: TabId; n: string; label: string; color: string; hint: string }[] = [
  { id: "network", n: "01", label: "Network Topology", color: "#ef4d55", hint: "graph · adjacency list" },
  { id: "dispatch", n: "02", label: "Dispatch Engine", color: "#3d8bfd", hint: "min-heap · priority queue" },
  { id: "planner", n: "03", label: "Journey Planner", color: "#2fbe7c", hint: "Dijkstra's algorithm" },
  { id: "transfer", n: "04", label: "Transfer Optimiser", color: "#f2a41f", hint: "dynamic programming" },
  { id: "console", n: "05", label: "CLI Console", color: "#a97bf0", hint: "interactive menu" },
  { id: "source", n: "06", label: "Source & Proofs", color: "#7d95a3", hint: "modules · complexity" },
];

function Console() {
  const [tab, setTab] = useState<TabId>("network");
  const { graph, stations, routes, snap, engine, toasts, lines, playing } = useTransit();

  // Cross-panel hand-off: "plan from here" on the topology map jumps to tab 03.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<TabId>).detail;
      if (TABS.some((t) => t.id === detail)) setTab(detail);
    };
    window.addEventListener("transit:tab", handler);
    return () => window.removeEventListener("transit:tab", handler);
  }, []);

  const incidents = useMemo(() => routes.filter((r) => r.incidentDelay > 0), [routes]);
  const components = useMemo(() => graph.components().length, [graph]);

  const ticker = useMemo(() => {
    const arrivals = snap.heap
      .slice()
      .sort((a, b) => a.arriveAt - b.arriveAt)
      .slice(0, 7)
      .map((v) => `ETA ${formatClock(v.arriveAt)} · ${v.id} · ${v.kind} → ${graph.getStation(v.path[v.leg])?.name ?? v.path[v.leg]}`);
    const alerts = incidents.map((r) => `⚠ ${r.id} ${r.from}–${r.to} +${r.incidentDelay} min · ${r.note ?? "congestion"}`);
    const items = [...arrivals, ...alerts, `service clock ${formatClock(snap.clock)} · ${snap.active} units queued · ${snap.completed} runs completed`];
    return items.length ? items : ["schedule empty — dispatch a unit from the console"];
  }, [snap, incidents, graph]);

  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="relative min-h-screen bg-ink-950">
      {/* ambient layers */}
      <div className="pointer-events-none fixed inset-0 bg-blueprint opacity-70" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(120%_100%_at_18%_0%,rgba(61,139,253,0.16),transparent_58%),radial-gradient(90%_80%_at_82%_0%,rgba(242,164,31,0.14),transparent_60%)]" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-64 bg-[radial-gradient(80%_100%_at_50%_100%,rgba(47,190,124,0.1),transparent_70%)]" />

      <div className="relative">
        {/* ---------------------------------------------------- masthead */}
        <header className="border-b border-white/10 bg-ink-950/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
            <div className="flex items-center gap-2.5">
              <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
                <circle cx="13" cy="13" r="12" fill="none" stroke="#f2a41f" strokeWidth="1.6" />
                <path d="M5 17 L11 7 L15 14 L21 9" fill="none" stroke="#e3ecf1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="11" cy="7" r="2.1" fill="#ef4d55" />
                <circle cx="21" cy="9" r="2.1" fill="#3d8bfd" />
              </svg>
              <div className="leading-none">
                <div className="sign text-[11px] text-mist-100">Metropolitan Transit Authority</div>
                <div className="hud-num text-[9px] text-mist-500">operations console · build 4.2.1 · coursework reference</div>
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-1.5">
                <Blink on={playing} />
                <span className="sign text-[9px] text-mist-500">{playing ? "simulating" : "held"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Blink on={incidents.length === 0} />
                <span className="sign text-[9px] text-mist-500">{incidents.length ? `${incidents.length} incidents` : "all clear"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Blink on={components === 1} />
                <span className="sign text-[9px] text-mist-500">{components} components</span>
              </div>
              <div className="flex items-baseline gap-2 rounded-sm border border-signal-500/40 bg-signal-500/10 px-2.5 py-1">
                <span className="sign text-[9px] text-signal-400">service</span>
                <span className="hud-num text-lg leading-none font-bold text-signal-300">{formatClock(snap.clock)}</span>
              </div>
            </div>
          </div>

          {/* ticker */}
          <div className="overflow-hidden border-t border-white/8 bg-ink-900/70">
            <div className="ticker-track py-1">
              {[0, 1].map((dup) => (
                <span key={dup} className="flex items-center">
                  {ticker.map((t, i) => (
                    <span key={`${dup}-${i}`} className="hud-num flex items-center gap-2 px-5 text-[10.5px] text-mist-400">
                      <span className={cn("h-1 w-1 rounded-full", t.startsWith("⚠") ? "bg-lred" : "bg-lgreen")} />
                      {t}
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* ------------------------------------------------------- title */}
        <div className="mx-auto max-w-[1500px] px-4 pt-8 pb-5 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <span className="h-px w-10 bg-signal-500" />
                <span className="sign text-[10px] text-signal-400">four structures · one live network</span>
              </div>
              <h1 className="font-display text-[clamp(2.4rem,6.4vw,5.2rem)] leading-[0.86] font-semibold tracking-tight text-mist-50 uppercase">
                Smart Metropolitan
                <br />
                <span className="text-signal-400">Transit Scheduler</span>
              </h1>
              <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-mist-300">
                A working transit control room built entirely on data structures: the network is an{" "}
                <span className="text-mist-50">adjacency-list multigraph</span> with mutable weights, the departure board is a{" "}
                <span className="text-mist-50">binary min-heap written from scratch</span>, journeys are solved with{" "}
                <span className="text-mist-50">Dijkstra</span>, and parallel-line transfers with an{" "}
                <span className="text-mist-50">assembly-line dynamic program</span>. Every panel and every console command calls the same seven
                dependency-free modules — nothing here is faked at the presentation layer.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className="group flex items-center gap-2 rounded-[3px] border border-white/10 bg-ink-900/70 px-2.5 py-1.5 transition-all hover:-translate-y-px hover:border-white/30"
                  >
                    <span className="h-3.5 w-1 rounded-full transition-all group-hover:h-4" style={{ backgroundColor: t.color }} />
                    <span className="hud-num text-[10px] text-mist-400">{t.n}</span>
                    <span className="sign text-[10px] text-mist-200">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[430px] lg:grid-cols-2">
              <Stat label="Stations |V|" value={stations.length} />
              <Stat label="Segments |E|" value={routes.length} />
              <Stat label="Units queued" value={snap.active} tone={snap.empty ? "bad" : "amber"} />
              <Stat label="Heap comparisons" value={snap.stats.comparisons} tone="good" />
              <Stat label="Incident delay" value={`+${incidents.reduce((s, r) => s + r.incidentDelay, 0)}`} unit="min" tone={incidents.length ? "bad" : "good"} />
              <Stat label="Runs completed" value={snap.completed} />
            </div>
          </div>
        </div>

        {/* --------------------------------------------------------- nav */}
        <nav className="sticky top-0 z-30 border-y border-white/10 bg-ink-950/92 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1500px] items-stretch gap-px overflow-x-auto px-2 sm:px-4">
            {TABS.map((t) => {
              const on = t.id === tab;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "group relative flex shrink-0 items-center gap-2.5 px-3.5 py-2.5 transition-colors sm:px-4",
                    on ? "bg-ink-800" : "hover:bg-ink-900",
                  )}
                >
                  <span
                    className="sign flex h-6 min-w-6 items-center justify-center rounded-[3px] px-1.5 text-[10px] font-bold text-ink-950 transition-transform group-hover:scale-105"
                    style={{ backgroundColor: t.color }}
                  >
                    {t.n}
                  </span>
                  <span className="text-left leading-tight">
                    <span className={cn("sign block text-[11px]", on ? "text-mist-50" : "text-mist-300")}>{t.label}</span>
                    <span className="hud-num hidden text-[9px] text-mist-500 sm:block">{t.hint}</span>
                  </span>
                  {on && <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ backgroundColor: t.color }} />}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ----------------------------------------------------- content */}
        <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
          <div key={tab} className="rise">
            {tab === "network" && <NetworkTab />}
            {tab === "dispatch" && <DispatchTab />}
            {tab === "planner" && <PlannerTab />}
            {tab === "transfer" && <TransferTab />}
            {tab === "console" && <TerminalTab />}
            {tab === "source" && <SourceTab />}
          </div>

          {/* section footer: what the current tab proves */}
          <section className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              {
                k: "structure",
                t: active.hint,
                d: {
                  network: "Map<StationId, Edge[]> — sparse, O(V+E) memory, validated mutation, parallel edges preserved.",
                  dispatch: "Array-backed complete binary tree; siftUp/siftDown only, instrumented with comparison and swap counters.",
                  planner: "Frontier priority queue + dist[]/prev[] maps, lazy deletion, early exit once the target settles.",
                  transfer: "Two n-cell rows filled left-to-right with an l[] traceback array — no recursion, no memo map.",
                  console: "A text shell over the same modules: every command is a real engine call with typed error handling.",
                  source: "Seven modules with header comments explaining the choice of structure and its asymptotics.",
                }[tab],
              },
              {
                k: "live state",
                t: `${snap.active} queued · ${stations.length} nodes · ${routes.length} edges`,
                d: `Heap root ${snap.next ? `${snap.next.id} at ${formatClock(snap.next.arriveAt)}` : "— (schedule empty)"} · ${components} connected component(s) · ${graph.isolatedStations().length} isolated node(s).`,
              },
              {
                k: "lines",
                t: lines.map((l) => l.id).join(" · "),
                d: lines.map((l) => `${l.id}: ${l.name} (${l.mode})`).join(" — ") + ".",
              },
            ].map((c) => (
              <div key={c.k} className="rounded-sm border border-white/8 bg-ink-900/60 p-3 transition-colors hover:border-signal-500/40">
                <div className="sign text-[9px] text-mist-500">{c.k}</div>
                <div className="sign mt-0.5 text-[12px] text-mist-100">{c.t}</div>
                <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-mist-400">{c.d}</p>
              </div>
            ))}
          </section>
        </main>

        <footer className="mt-6 border-t border-white/10 bg-ink-950/80">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-5 sm:px-6">
            <div className="flex items-center gap-2">
              {lines.map((l) => (
                <LineBadge key={l.id} id={l.id} color={l.color} size="sm" />
              ))}
            </div>
            <p className="font-mono text-[10.5px] leading-relaxed text-mist-500">
              Algorithms implemented from first principles — no pathfinding, heap or graph library is imported. Engine: TypeScript (ES2020), portable
              line-for-line to Python / Java / C++.
            </p>
            <div className="hud-num ml-auto flex gap-4 text-[10px] text-mist-500">
              <span>V={stations.length}</span>
              <span>E={routes.length}</span>
              <span>dijkstra O((V+E) log V)</span>
              <span>heap O(log n)</span>
              <span>dp O(n)</span>
              <span className="text-signal-500">{engine.clock >= 0 ? formatClock(engine.clock) : "—"}</span>
            </div>
          </div>
        </footer>
      </div>

      {/* ------------------------------------------------------- toasts */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rise pointer-events-auto rounded-sm border-l-2 bg-ink-900/95 px-3 py-2 font-mono text-[11px] leading-snug shadow-[0_18px_40px_-20px_rgba(0,0,0,.95)] backdrop-blur",
              t.tone === "ok" && "border-l-lgreen text-mist-200",
              t.tone === "warn" && "border-l-signal-500 text-mist-200",
              t.tone === "err" && "border-l-lred text-mist-200",
            )}
          >
            <span className={cn("sign mr-2 text-[9px]", t.tone === "ok" ? "text-lgreen" : t.tone === "warn" ? "text-signal-400" : "text-lred")}>
              {t.tone === "ok" ? "ack" : t.tone === "warn" ? "notice" : "fault"}
            </span>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <TransitProvider>
      <Console />
    </TransitProvider>
  );
}
