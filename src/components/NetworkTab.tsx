import { useMemo, useState } from "react";
import { useTransit } from "@/state/store";
import { Btn, Field, LineBadge, Panel, Reveal, Select, Stat, inputClass } from "@/components/ui";
import NetworkMap from "@/components/NetworkMap";
import { INCIDENT_PRESETS } from "@/engine/mockData";
import type { StationId } from "@/engine/types";
import { cn } from "@/utils/cn";

const MODE_SPEED_KMH: Record<string, number> = { METRO: 42, EXPRESS: 55, TRAM: 24, BUS: 19 };

export default function NetworkTab() {
  const {
    lines, stations, routes, graph, addStation, addRoute, removeRoute, setDelay, clearDelays, resetNetwork, replanFleet, notify, setSource, setTarget,
  } = useTransit();
  const [selectedRoute, setSelectedRoute] = useState<string>("R3");
  const [focus, setFocus] = useState<StationId | null>("CEN");
  const [error, setError] = useState<string | null>(null);

  const [stForm, setStForm] = useState({ id: "FRD", name: "Foundry Wharf", x: "620", y: "520", zone: "3" });
  const [rtForm, setRtForm] = useState({ from: "STH", to: "FRD", line: "GREEN", distanceKm: "3.4" });

  const audit = useMemo(() => {
    const comps = graph.components();
    const isolated = graph.isolatedStations();
    const degrees = stations.map((s) => graph.degree(s.id));
    const density = stations.length > 1 ? (2 * routes.length) / (stations.length * (stations.length - 1)) : 0;
    return {
      comps,
      isolated,
      avgDeg: degrees.length ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0,
      density,
      delayed: routes.filter((r) => r.incidentDelay > 0),
      totalDelay: routes.reduce((s, r) => s + r.incidentDelay, 0),
    };
  }, [graph, stations, routes]);

  const lineMode = (id: string) => lines.find((l) => l.id === id)?.mode ?? "METRO";
  const suggestedMinutes = (lineId: string, km: number) => {
    if (!Number.isFinite(km) || km <= 0) return 1;
    const speed = MODE_SPEED_KMH[lineMode(lineId)] ?? 40;
    return Math.max(1, Math.round((km / speed) * 60 * 10) / 10);
  };

  const nextRouteId = (lineId: string) => {
    const prefix = lineId[0];
    let n = 1;
    while (routes.some((r) => r.id === `${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  };

  const submitStation = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      addStation({
        id: stForm.id.trim().toUpperCase(),
        name: stForm.name.trim(),
        x: Math.min(940, Math.max(20, Number(stForm.x) || 0)),
        y: Math.min(540, Math.max(20, Number(stForm.y) || 0)),
        zone: Math.max(1, Math.min(5, Number(stForm.zone) || 1)),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejected.");
    }
  };

  const submitRoute = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const km = Number(rtForm.distanceKm);
    try {
      addRoute({
        id: nextRouteId(rtForm.line),
        from: rtForm.from,
        to: rtForm.to,
        line: rtForm.line,
        distanceKm: km,
        baseMinutes: suggestedMinutes(rtForm.line, km),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejected.");
    }
  };

  const chaosDrill = () => {
    const pool = routes.filter((r) => r.incidentDelay === 0).slice(0, 4);
    pool.forEach((r, i) => setDelay(r.id, 4 + i * 3));
    const moved = replanFleet();
    notify("warn", `Chaos drill: ${pool.length} segments degraded · ${moved} vehicle(s) re-routed.`);
  };

  const sel = routes.find((r) => r.id === selectedRoute);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
      <div className="space-y-4">
        <Reveal>
          <Panel
            code="01"
            title="Network Topology · Adjacency List"
            right={
              <div className="flex items-center gap-2">
                <span className="hud-num text-[10px] text-mist-500">
                  |V|={stations.length} |E|={routes.length} · O(V+E) memory
                </span>
                <Btn size="sm" variant="outline" onClick={resetNetwork}>
                  Reset fixture
                </Btn>
              </div>
            }
            bodyClass="p-3"
          >
            <NetworkMap
              stations={stations}
              routes={routes}
              lines={lines}
              selectedRoute={selectedRoute}
              onRouteClick={(id) => {
                setSelectedRoute(id);
                setError(null);
              }}
              onStationClick={(id) => setFocus(id)}
            />

            <div className="mt-2 border-t border-white/8 pt-2">
              {focus && graph.hasStation(focus) ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="hud-num text-[11px] text-signal-400">adjacency[{focus}]</span>
                    <span className="hud-num text-[10px] text-mist-500">
                      {graph.getStation(focus)?.name} · degree {graph.degree(focus)} · zone {graph.getStation(focus)?.zone}
                      {graph.getStation(focus)?.hub ? " · interchange" : ""}
                    </span>
                    <div className="ml-auto flex gap-1.5">
                      <Btn
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSource(focus);
                          notify("ok", `Planner origin := ${focus} · ${graph.getStation(focus)?.name}`);
                          window.dispatchEvent(new CustomEvent("transit:tab", { detail: "planner" }));
                        }}
                      >
                        plan from here
                      </Btn>
                      <Btn
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTarget(focus);
                          notify("ok", `Planner destination := ${focus} · ${graph.getStation(focus)?.name}`);
                          window.dispatchEvent(new CustomEvent("transit:tab", { detail: "planner" }));
                        }}
                      >
                        plan to here
                      </Btn>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {graph.neighbors(focus).length === 0 && (
                      <span className="font-mono text-[10.5px] text-lred">
                        [ ] — isolated node: empty bucket, so every query to/from {focus} returns found = false.
                      </span>
                    )}
                    {graph.neighbors(focus).map((e) => (
                      <button
                        key={e.routeId}
                        onClick={() => setSelectedRoute(e.routeId)}
                        className="group flex items-center gap-1.5 rounded-[2px] border border-white/10 bg-ink-950/70 px-1.5 py-1 transition-all hover:-translate-y-px hover:border-signal-500/60"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lines.find((l) => l.id === e.line)?.color ?? "#7d95a3" }} />
                        <span className="hud-num text-[10.5px] text-mist-100">{e.to}</span>
                        <span className="hud-num text-[9px] text-mist-500">{e.routeId}</span>
                        <span className={cn("hud-num text-[9.5px]", e.delay > 0 ? "text-signal-400" : "text-mist-400")}>
                          w={e.baseMinutes + e.delay}m
                        </span>
                        <span className="hud-num text-[9px] text-mist-500">{e.distanceKm}km</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <span className="font-mono text-[10.5px] text-mist-500">
                  Click a station to dump its adjacency bucket — the literal contents of Map&lt;StationId, Edge[]&gt;. Click a segment to load it into the
                  weight controller.
                </span>
              )}
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={60}>
          <Panel code="01·b" title="Connectivity Audit" right={<span className="hud-num text-[10px] text-mist-500">BFS · O(V+E)</span>}>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Connected components" value={audit.comps.length} tone={audit.comps.length > 1 ? "bad" : "good"} />
              <Stat label="Isolated stations" value={audit.isolated.length} tone={audit.isolated.length ? "bad" : "good"} />
              <Stat label="Mean degree" value={audit.avgDeg.toFixed(2)} unit="edges/node" />
              <Stat label="Graph density" value={(audit.density * 100).toFixed(1)} unit="%" />
            </div>
            <div className="mt-3 space-y-1.5">
              {audit.comps.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-sm border border-white/8 bg-ink-950/50 px-2 py-1.5">
                  <span className="sign text-[9.5px] text-mist-500">Component {i + 1}</span>
                  <span className="hud-num text-[10px] text-signal-400">[{c.length} nodes]</span>
                  {c.map((id) => (
                    <span key={id} className={cn("hud-num rounded-[2px] px-1 text-[10px]", c.length === 1 ? "bg-lred/20 text-lred" : "bg-ink-700 text-mist-300")}>
                      {id}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-mist-500">
              Any Dijkstra query crossing components returns <span className="text-lred">found = false</span> together with the reachable set —
              that is how the planner reports “no service” instead of looping forever.
            </p>
          </Panel>
        </Reveal>
      </div>

      <div className="space-y-4">
        <Reveal delay={40}>
          <Panel code="01·c" title="Dynamic Weight Controller">
            <p className="mb-3 font-mono text-[10.5px] leading-relaxed text-mist-400">
              w(e) = baseMinutes + incidentDelay — mutate a segment and every subsequent shortest-path query sees the new cost.
            </p>
            <Field label="Selected segment">
              <Select value={selectedRoute} onChange={setSelectedRoute}>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} · {r.from}–{r.to} · {r.line} · {r.baseMinutes}m{r.incidentDelay ? ` (+${r.incidentDelay})` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            {sel && (
              <div className="mt-3 rounded-sm border border-white/8 bg-ink-950/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LineBadge id={sel.line} color={lines.find((l) => l.id === sel.line)?.color ?? "#7d95a3"} />
                    <span className="hud-num text-[11px] text-mist-200">
                      {sel.from} ⇄ {sel.to}
                    </span>
                  </div>
                  <Btn size="sm" variant="danger" onClick={() => removeRoute(sel.id)}>
                    Close segment
                  </Btn>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={25}
                    step={1}
                    value={sel.incidentDelay}
                    onChange={(e) => setDelay(sel.id, Number(e.target.value))}
                    className="h-1.5 flex-1 cursor-pointer rounded-full bg-ink-600 accent-signal-500"
                  />
                  <span className={cn("hud-num w-20 text-right text-lg font-semibold", sel.incidentDelay > 0 ? "text-signal-400" : "text-mist-400")}>
                    +{sel.incidentDelay} min
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {INCIDENT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setDelay(sel.id, p.minutes)}
                      className="sign rounded-[2px] border border-white/10 bg-ink-800 px-1.5 py-1 text-[9px] text-mist-400 transition-colors hover:border-signal-500/60 hover:text-signal-400"
                    >
                      {p.label} · {p.minutes}m
                    </button>
                  ))}
                </div>
                <div className="hud-num mt-2 border-t border-white/8 pt-2 text-[10px] text-mist-500">
                  effective weight = {sel.baseMinutes} + {sel.incidentDelay} = <span className="text-signal-400">{sel.baseMinutes + sel.incidentDelay} min</span> · {sel.distanceKm} km
                  {sel.note && <span className="ml-2 text-lred">⚠ {sel.note}</span>}
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Btn variant="solid" size="sm" onClick={chaosDrill}>
                Run chaos drill
              </Btn>
              <Btn size="sm" onClick={() => clearDelays()}>
                Clear all incidents
              </Btn>
              <Btn size="sm" variant="outline" onClick={() => notify("ok", `${replanFleet()} vehicle(s) re-routed against current weights.`)}>
                Re-plan fleet
              </Btn>
            </div>

            <div className="mt-3 border-t border-white/8 pt-2">
              <div className="sign mb-1.5 text-[9.5px] text-mist-500">Active incidents · {audit.delayed.length} · {audit.totalDelay} min injected</div>
              <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                {audit.delayed.length === 0 && <div className="font-mono text-[10.5px] text-mist-500">Network running at free-flow weights.</div>}
                {audit.delayed.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRoute(r.id)}
                    className="flex w-full items-center gap-2 rounded-[2px] border border-signal-500/20 bg-signal-500/5 px-2 py-1 text-left transition-colors hover:bg-signal-500/15"
                  >
                    <span className="hud-num text-[10px] text-signal-400">+{r.incidentDelay}m</span>
                    <span className="hud-num truncate text-[10px] text-mist-300">
                      {r.id} {r.from}–{r.to}
                    </span>
                    <span className="hud-num ml-auto shrink-0 text-[9px] text-mist-500">{r.note ?? "congestion"}</span>
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={90}>
          <Panel code="01·d" title="Extend the Network">
            <form onSubmit={submitStation} className="space-y-2">
              <div className="sign text-[9.5px] text-signal-400">addStation()</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Code">
                  <input className={inputClass} value={stForm.id} maxLength={5} onChange={(e) => setStForm({ ...stForm, id: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Zone">
                  <input className={inputClass} value={stForm.zone} onChange={(e) => setStForm({ ...stForm, zone: e.target.value })} />
                </Field>
              </div>
              <Field label="Name">
                <input className={inputClass} value={stForm.name} onChange={(e) => setStForm({ ...stForm, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Canvas X (20–940)">
                  <input className={inputClass} value={stForm.x} onChange={(e) => setStForm({ ...stForm, x: e.target.value })} />
                </Field>
                <Field label="Canvas Y (20–540)">
                  <input className={inputClass} value={stForm.y} onChange={(e) => setStForm({ ...stForm, y: e.target.value })} />
                </Field>
              </div>
              <Btn type="submit" variant="solid" size="sm">
                Insert station
              </Btn>
            </form>

            <form onSubmit={submitRoute} className="mt-4 space-y-2 border-t border-white/8 pt-3">
              <div className="sign text-[9.5px] text-signal-400">addRoute()</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="From">
                  <Select value={rtForm.from} onChange={(v) => setRtForm({ ...rtForm, from: v })}>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} · {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="To">
                  <Select value={rtForm.to} onChange={(v) => setRtForm({ ...rtForm, to: v })}>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} · {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Line">
                  <Select value={rtForm.line} onChange={(v) => setRtForm({ ...rtForm, line: v })}>
                    {lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.id} · {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Distance (km)" hint={`auto weight ≈ ${suggestedMinutes(rtForm.line, Number(rtForm.distanceKm) || 1)} min`}>
                  <input className={inputClass} value={rtForm.distanceKm} onChange={(e) => setRtForm({ ...rtForm, distanceKm: e.target.value })} />
                </Field>
              </div>
              <Btn type="submit" variant="solid" size="sm">
                Open segment
              </Btn>
            </form>

            {error && (
              <div className="mt-3 rounded-sm border border-lred/40 bg-lred/10 px-2 py-1.5 font-mono text-[10.5px] text-lred">
                ✕ {error}
              </div>
            )}
          </Panel>
        </Reveal>
      </div>
    </div>
  );
}
