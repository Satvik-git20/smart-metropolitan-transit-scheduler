import { useEffect, useMemo, useState } from "react";
import { useTransit } from "@/state/store";
import { Btn, Field, LineBadge, Panel, PaperCard, Reveal, Select, Stat, Td, Th } from "@/components/ui";
import NetworkMap from "@/components/NetworkMap";
import { toSegments } from "@/engine/Dijkstra";
import { formatDuration } from "@/engine/types";
import type { StationId } from "@/engine/types";
import { cn } from "@/utils/cn";

const TRACE_COLOR: Record<string, string> = {
  pop: "#0a1015",
  relax: "#1c6b45",
  reject: "#8a5a12",
  stale: "#7d95a3",
  done: "#9c2b31",
};

export default function PlannerTab() {
  const { stations, routes, lines, graph, source, target, setSource, setTarget, plan, planError, notify } = useTransit();
  const [pickStage, setPickStage] = useState<0 | 1>(0);
  const [revealed, setRevealed] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [runId, setRunId] = useState(0);

  const colorOf = useMemo(() => new Map(lines.map((l) => [l.id, l.color])), [lines]);
  const reachable = useMemo(() => graph.reachableFrom(source), [graph, source]);
  const segments = useMemo(() => (plan ? toSegments(plan) : []), [plan]);
  const traceLen = plan?.trace.length ?? 0;

  useEffect(() => {
    setRevealed(0);
    setReplaying(true);
    setRunId((n) => n + 1);
  }, [source, target, routes, graph]);

  useEffect(() => {
    if (!replaying) return;
    if (revealed >= traceLen) {
      setReplaying(false);
      return;
    }
    const h = window.setTimeout(() => setRevealed((r) => Math.min(traceLen, r + 1)), traceLen > 40 ? 26 : 55);
    return () => window.clearTimeout(h);
  }, [replaying, revealed, traceLen]);

  const onPick = (id: StationId) => {
    if (pickStage === 0) {
      setSource(id);
      setPickStage(1);
    } else {
      setTarget(id);
      setPickStage(0);
    }
  };

  const swap = () => {
    setSource(target);
    setTarget(source);
  };

  return (
    <div className="space-y-4">
      <Reveal>
        <Panel code="03" title="Journey Planner · Dijkstra on the adjacency list" bodyClass="p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-52">
              <Field label="Origin">
                <Select value={source} onChange={setSource}>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} · {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Btn size="sm" variant="outline" onClick={swap} title="Swap origin and destination">
              ⇄ swap
            </Btn>
            <div className="w-52">
              <Field label="Destination">
                <Select value={target} onChange={setTarget}>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} · {s.name}
                      {!reachable.has(s.id) ? "  (UNREACHABLE)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <Btn size="sm" variant={pickStage === 0 ? "solid" : "ghost"} onClick={() => setPickStage(0)}>
                {pickStage === 0 ? "● click map → origin" : "set origin from map"}
              </Btn>
              <Btn size="sm" variant={pickStage === 1 ? "solid" : "ghost"} onClick={() => setPickStage(1)}>
                {pickStage === 1 ? "● click map → destination" : "set destination"}
              </Btn>
            </div>
            <div className="ml-auto grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Journey time" value={plan?.found ? formatDuration(plan.totalMinutes) : "—"} tone={plan?.found ? "amber" : "bad"} />
              <Stat label="Distance" value={plan?.found ? plan.totalKm.toFixed(1) : "0"} unit="km" />
              <Stat label="Interchanges" value={plan?.transfers ?? 0} tone={plan && plan.transfers > 2 ? "bad" : "good"} />
              <Stat label="Delay absorbed" value={plan?.found ? `+${plan.totalDelay.toFixed(0)}` : "+0"} unit="min" tone={plan && plan.totalDelay > 0 ? "bad" : "default"} />
            </div>
          </div>

          {plan && plan.found && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
              {segments.map((seg, i) => (
                <div key={i} className="group flex items-center gap-2 rounded-sm border border-white/10 bg-ink-950/60 px-2.5 py-1.5 transition-colors hover:border-signal-500/50">
                  <LineBadge id={seg.line} color={colorOf.get(seg.line) ?? "#7d95a3"} />
                  <div className="leading-tight">
                    <div className="hud-num text-[11px] text-mist-100">
                      {graph.getStation(seg.from)?.name} → {graph.getStation(seg.to)?.name}
                    </div>
                    <div className="hud-num text-[9px] text-mist-500">
                      {seg.stops.length - 1} stop{seg.stops.length - 1 === 1 ? "" : "s"} · {seg.minutes.toFixed(1)} min · {seg.distanceKm.toFixed(1)} km
                    </div>
                  </div>
                </div>
              ))}
              <div className="sign ml-auto text-[10px] text-mist-500">
                {plan.pops} extractions · {plan.relaxations} relaxations · {plan.rejections} rejected
              </div>
            </div>
          )}

          {plan && !plan.found && !planError && (
            <div className="mt-3 rounded-sm border border-lred/40 bg-lred/10 px-3 py-2.5">
              <div className="sign text-[12px] text-lred">No service · destination unreachable</div>
              <p className="mt-1 font-mono text-[11px] leading-relaxed text-mist-300">
                Dijkstra settled {plan.reachable.length} node(s) reachable from <span className="text-signal-400">{source}</span> and exhausted the queue
                with dist[{target}] = ∞. <span className="text-mist-100">{target}</span> sits in a different connected component — the correct answer is
                an explicit failure, not an infinite loop.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {plan.reachable.map((id) => (
                  <span key={id} className="hud-num rounded-[2px] bg-ink-700 px-1 text-[9.5px] text-mist-300">
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}
          {planError && <div className="mt-3 rounded-sm border border-lred/40 bg-lred/10 px-3 py-2 font-mono text-[11px] text-lred">✕ {planError}</div>}
        </Panel>
      </Reveal>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(380px,1fr)]">
        <Reveal delay={40}>
          <Panel
            code="03·a"
            title="Route overlay"
            right={
              <span className="hud-num text-[10px] text-mist-500">
                dimmed = outside component of {source}
              </span>
            }
            bodyClass="p-3"
          >
            <NetworkMap
              stations={stations}
              routes={routes}
              lines={lines}
              sourceId={source}
              targetId={target}
              path={plan?.found ? plan.path : undefined}
              legs={plan?.found ? plan.legs : undefined}
              reachable={reachable}
              onStationClick={onPick}
              drawKey={runId}
              showLegend={false}
            />
            <div className="mt-2 flex items-center justify-between border-t border-white/8 pt-2">
              <span className="font-mono text-[10.5px] text-mist-500">
                Click any station to re-target the planner. Path segments animate in relaxation order.
              </span>
              <Btn
                size="sm"
                onClick={() => {
                  setRevealed(traceLen);
                  setReplaying(false);
                  notify("ok", `Trace complete: ${traceLen} events · O((V+E) log V).`);
                }}
              >
                show full trace
              </Btn>
            </div>
          </Panel>
        </Reveal>

        <div className="space-y-4">
          <Reveal delay={70}>
            <PaperCard>
              <div className="flex items-center justify-between border-b border-black/15 px-3 py-2">
                <h3 className="sign text-[12px] text-ink-800">Relaxation trace</h3>
                <span className="hud-num text-[10px] text-ink-600">
                  {revealed}/{traceLen} events
                </span>
              </div>
              <div className="max-h-[290px] overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0">
                    <tr>
                      <Th className="w-8">#</Th>
                      <Th className="w-16">op</Th>
                      <Th>event</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan?.trace.slice(0, revealed).map((t) => (
                      <tr key={t.step} className="rise">
                        <Td className="text-ink-500">{t.step}</Td>
                        <Td>
                          <span className="sign rounded-[2px] px-1 py-0.5 text-[8.5px] text-white" style={{ backgroundColor: TRACE_COLOR[t.kind] ?? "#333" }}>
                            {t.kind}
                          </span>
                        </Td>
                        <Td className="text-[10.5px]">{t.message}</Td>
                      </tr>
                    ))}
                    {traceLen === 0 && (
                      <tr>
                        <Td className="py-4 text-center text-ink-500">no events</Td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </PaperCard>
          </Reveal>

          <Reveal delay={100}>
            <PaperCard>
              <div className="flex items-center justify-between border-b border-black/15 px-3 py-2">
                <h3 className="sign text-[12px] text-ink-800">dist[] / prev[] table</h3>
                <span className="hud-num text-[10px] text-ink-600">source {source}</span>
              </div>
              <div className="max-h-[260px] overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0">
                    <tr>
                      <Th>Station</Th>
                      <Th className="w-20">dist (min)</Th>
                      <Th className="w-16">prev</Th>
                      <Th className="w-16">settled</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan?.table.map((row) => {
                      const onPath = plan.path.includes(row.id);
                      return (
                        <tr key={row.id} className={cn(onPath && "bg-signal-400/25")}>
                          <Td className={cn("font-semibold", onPath && "text-ink-950")}>
                            {row.id} <span className="font-normal text-ink-600">{row.name}</span>
                          </Td>
                          <Td>{row.dist === Infinity ? "∞" : row.dist.toFixed(1)}</Td>
                          <Td>{row.prev ?? "—"}</Td>
                          <Td>{row.settled ? "✓" : "·"}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-3 gap-px border-t border-black/15 bg-black/10 text-center">
                {[
                  ["heap comparisons", plan?.heapComparisons ?? 0],
                  ["heap swaps", plan?.heapSwaps ?? 0],
                  ["queue extractions", plan?.pops ?? 0],
                ].map(([k, v]) => (
                  <div key={String(k)} className="bg-paper px-2 py-1.5">
                    <div className="sign text-[8.5px] text-ink-600">{k}</div>
                    <div className="hud-num text-[13px] font-semibold text-ink-900">{v}</div>
                  </div>
                ))}
              </div>
            </PaperCard>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
