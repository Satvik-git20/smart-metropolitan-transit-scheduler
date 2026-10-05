import { useMemo, useState } from "react";
import { useTransit } from "@/state/store";
import { Blink, Btn, Field, LineBadge, Panel, Reveal, Select, Stat, inputClass } from "@/components/ui";
import NetworkMap from "@/components/NetworkMap";
import { formatClock } from "@/engine/types";
import type { VehicleKind } from "@/engine/DispatchEngine";
import { SPARE_POOL } from "@/engine/mockData";
import { cn } from "@/utils/cn";

const KINDS: VehicleKind[] = ["METRO", "EXPRESS", "TRAM", "BUS"];
const KIND_COLOR: Record<VehicleKind, string> = {
  METRO: "#3d8bfd",
  EXPRESS: "#f2a41f",
  TRAM: "#2fbe7c",
  BUS: "#a97bf0",
};
const EVENT_COLOR: Record<string, string> = {
  ENQUEUE: "#a97bf0",
  ARRIVE: "#2fbe7c",
  DEPART: "#3d8bfd",
  TERMINATE: "#7d95a3",
  REPLAN: "#f2a41f",
  HOLD: "#ef4d55",
  TICK: "#5f7887",
};

export default function DispatchTab() {
  const { stations, lines, graph, engine, snap, playing, speed, setPlaying, setSpeed, stepClock, dispatchVehicle, withdrawVehicle, resetFleet, notify } =
    useTransit();

  const [form, setForm] = useState({ kind: "METRO" as VehicleKind, origin: "NGT", destination: "APT", offset: "2", load: "180" });
  const [error, setError] = useState<string | null>(null);
  const [autoId, setAutoId] = useState(900);

  const colorOf = useMemo(() => new Map(lines.map((l) => [l.id, l.color])), [lines]);
  const dots = engine.positions();

  /** Independently re-check the heap invariant — proof, not assertion.
   *  Mirrors the engine comparator exactly: arriveAt first, id as tie-break.
   *  (A composite string key would compare lexicographically and miss real
   *  violations, e.g. parent 100 vs child 99.) */
  const invariantHolds = useMemo(() => {
    const a = snap.heap;
    for (let i = 1; i < a.length; i++) {
      const p = (i - 1) >> 1;
      const parent = a[p];
      const child = a[i];
      if (parent.arriveAt > child.arriveAt) return false;
      if (parent.arriveAt === child.arriveAt && parent.id > child.id) return false;
    }
    return true;
  }, [snap.heap]);

  const heapHeight = snap.heap.length ? Math.floor(Math.log2(snap.heap.length)) + 1 : 0;

  const touched = useMemo(() => {
    const m = new Map<number, { seq: number; kind: string }>();
    snap.recentOps.forEach((o) => {
      m.set(o.index, { seq: o.seq, kind: o.kind });
      if (o.other !== undefined) m.set(o.other, { seq: o.seq, kind: o.kind });
    });
    return m;
  }, [snap.recentOps]);

  const levels = useMemo(() => {
    const out: typeof snap.heap[] = [];
    let start = 0;
    let width = 1;
    while (start < snap.heap.length) {
      out.push(snap.heap.slice(start, start + width));
      start += width;
      width *= 2;
    }
    return out;
  }, [snap.heap]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const id = `${form.kind[0]}-${autoId}`;
      dispatchVehicle({
        id,
        kind: form.kind,
        line: "SYS",
        origin: form.origin,
        destination: form.destination,
        departAt: engine.clock + Math.max(0, Number(form.offset) || 0),
        load: Math.max(0, Number(form.load) || 0),
      });
      setAutoId((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch rejected.");
    }
  };

  const randomDispatch = () => {
    const pick = SPARE_POOL[Math.floor(Math.random() * SPARE_POOL.length)];
    const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
    try {
      dispatchVehicle({
        id: `${kind[0]}-${autoId}`,
        kind,
        line: "SYS",
        origin: pick.origin,
        destination: pick.destination,
        departAt: engine.clock + 1,
        load: Math.floor(Math.random() * 300),
      });
      setAutoId((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch rejected.");
    }
  };

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------ control bar */}
      <Reveal>
        <Panel code="02" title="Live Dispatch Engine · Binary Min-Heap" bodyClass="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-sm border border-white/10 bg-ink-950/70 px-3 py-2">
              <Blink on={playing} />
              <span className="sign text-[10px] text-mist-400">Service clock</span>
              <span className="hud-num text-2xl leading-none font-bold text-signal-400">{formatClock(snap.clock)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Btn variant={playing ? "ghost" : "solid"} size="sm" onClick={() => setPlaying(!playing)}>
                {playing ? "❚❚ Hold" : "▶ Resume"}
              </Btn>
              {[1, 2, 4, 8].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn(
                    "hud-num rounded-[2px] border px-2 py-1 text-[10px] transition-colors",
                    speed === s ? "border-signal-500 bg-signal-500 text-ink-950" : "border-white/10 bg-ink-800 text-mist-400 hover:border-signal-500/50",
                  )}
                >
                  {s}×
                </button>
              ))}
              <Btn size="sm" onClick={() => { setPlaying(false); stepClock(1); }}>
                +1 min
              </Btn>
              <Btn size="sm" onClick={() => { setPlaying(false); stepClock(10); }}>
                +10 min
              </Btn>
              <Btn size="sm" variant="outline" onClick={resetFleet}>
                Reset board
              </Btn>
            </div>
            <div className="ml-auto grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="In queue" value={snap.active} tone={snap.empty ? "bad" : "amber"} />
              <Stat label="Completed" value={snap.completed} tone="good" />
              <Stat label="Heap height" value={heapHeight} unit="levels" />
              <Stat label="Comparisons" value={snap.stats.comparisons} hint={`swaps: ${snap.stats.swaps}`} />
            </div>
          </div>
        </Panel>
      </Reveal>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
        <div className="space-y-4">
          <Reveal delay={40}>
            <Panel
              code="02·a"
              title="Fleet Positions · interpolated from heap keys"
              right={<span className="hud-num text-[10px] text-mist-500">{dots.length} units moving</span>}
              bodyClass="p-3"
            >
              <NetworkMap
                stations={stations}
                routes={graph.routeList()}
                lines={lines}
                vehicles={dots}
                showLegend={false}
                reachable={graph.reachableFrom("CEN")}
              />
            </Panel>
          </Reveal>

          <Reveal delay={70}>
            <Panel
              code="02·b"
              title="Priority Queue Array · data[0…n−1]"
              right={
                <span className={cn("hud-num flex items-center gap-1.5 text-[10px]", invariantHolds ? "text-lgreen" : "text-lred")}>
                  <Blink on={invariantHolds} /> {invariantHolds ? "heap property verified" : "INVARIANT BROKEN"}
                </span>
              }
            >
              {snap.empty ? (
                <div className="rounded-sm border border-dashed border-lred/40 bg-lred/5 px-3 py-6 text-center">
                  <div className="sign text-sm text-lred">Schedule empty</div>
                  <p className="mt-1 font-mono text-[11px] text-mist-400">
                    heap.size() == 0 → pop() returns <span className="text-signal-400">undefined</span>, tick() is a no-op.
                    Dispatch a unit below to resume service.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {snap.heap.map((v, i) => {
                    const op = touched.get(i);
                    return (
                      <div
                        key={`${v.id}-${i}`}
                        className={cn(
                          "group relative w-[104px] rounded-sm border px-2 py-1.5 transition-colors",
                          i === 0 ? "border-signal-500 bg-signal-500/15" : "border-white/10 bg-ink-950/60 hover:border-white/25",
                          op && "flash",
                        )}
                        style={op ? { animationDelay: `${(op.seq % 5) * 20}ms` } : undefined}
                      >
                        <div className="flex items-center justify-between">
                          <span className="hud-num text-[9px] text-mist-500">[{i}]</span>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: KIND_COLOR[v.kind] }} />
                        </div>
                        <div className="hud-num text-[13px] font-semibold text-mist-50">{formatClock(v.arriveAt)}</div>
                        <div className="hud-num truncate text-[9px] text-mist-400">{v.id}</div>
                        <div className="mt-0.5 flex items-center gap-1">
                          <span className="h-[2px] w-3 rounded-full" style={{ backgroundColor: colorOf.get(v.line) ?? "#7d95a3" }} />
                          <span className="hud-num truncate text-[8.5px] text-mist-500">→ {v.path[v.leg]}</span>
                        </div>
                        <div className="pointer-events-none absolute -bottom-1 left-1/2 z-10 hidden w-max -translate-x-1/2 translate-y-full rounded-sm border border-white/15 bg-ink-950 px-2 py-1 font-mono text-[9.5px] text-mist-200 group-hover:block">
                          {v.id} · {v.origin}→{v.destination} · leg {v.leg}/{v.path.length - 1} · key {v.arriveAt} · parent ⌊({i}-1)/2⌋={i === 0 ? "—" : (i - 1) >> 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 border-t border-white/8 pt-2">
                <div className="sign mb-1.5 text-[9.5px] text-mist-500">Implicit binary tree · level order</div>
                <div className="space-y-1">
                  {levels.map((lvl, li) => (
                    <div key={li} className="flex items-center gap-1.5">
                      <span className="hud-num w-14 shrink-0 text-[9px] text-mist-500">depth {li}</span>
                      <div className="flex flex-wrap gap-1">
                        {lvl.map((v) => (
                          <span key={v.id} className="hud-num rounded-[2px] border border-white/10 bg-ink-800 px-1.5 py-0.5 text-[9.5px] text-mist-300">
                            {formatClock(v.arriveAt)} <span className="text-mist-500">{v.id}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-mist-500">
                  parent(i)=⌊(i−1)/2⌋ · left(i)=2i+1 · right(i)=2i+2 — push/pop = O(log n); with tree height h = ⌊log₂ n⌋+1 ={" "}
                  <span className="text-signal-400">{heapHeight}</span>, a push needs ≤ h comparisons and an extract-min ≤ 2h (siftDown
                  tests both children per level) at n={snap.heap.length}.
                </p>
              </div>
            </Panel>
          </Reveal>
        </div>

        <div className="space-y-4">
          <Reveal delay={50}>
            <Panel code="02·c" title="Departure Board · next 8 extract-min results">
              <div className="overflow-hidden rounded-sm border border-white/10 bg-ink-950">
                <div className="hud-num grid grid-cols-[52px_58px_1fr_46px] gap-1 border-b border-white/10 bg-ink-800 px-2 py-1 text-[9px] text-mist-500">
                  <span>ETA</span>
                  <span>UNIT</span>
                  <span>NEXT STOP</span>
                  <span className="text-right">LOAD</span>
                </div>
                <div className="divide-y divide-white/6">
                  {snap.heap
                    .slice()
                    .sort((a, b) => a.arriveAt - b.arriveAt)
                    .slice(0, 8)
                    .map((v, i) => (
                      <div
                        key={v.id}
                        className={cn(
                          "hud-num grid grid-cols-[52px_58px_1fr_46px] items-center gap-1 px-2 py-1.5 text-[11px] transition-colors hover:bg-white/4",
                          i === 0 && "bg-signal-500/10",
                        )}
                      >
                        <span className={cn("font-semibold", i === 0 ? "text-signal-400" : "text-mist-100")}>{formatClock(v.arriveAt)}</span>
                        <span className="flex items-center gap-1 text-mist-300">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: KIND_COLOR[v.kind] }} />
                          {v.id}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5 text-mist-200">
                          <LineBadge id={v.line} color={colorOf.get(v.line) ?? "#7d95a3"} size="sm" />
                          <span className="truncate">{graph.getStation(v.path[v.leg])?.name ?? v.path[v.leg]}</span>
                        </span>
                        <span className="text-right text-mist-400">{Math.round((v.load / v.capacity) * 100)}%</span>
                      </div>
                    ))}
                  {snap.empty && <div className="px-2 py-4 text-center font-mono text-[11px] text-mist-500">— no queued arrivals —</div>}
                </div>
              </div>

              <form onSubmit={submit} className="mt-3 space-y-2 border-t border-white/8 pt-3">
                <div className="sign text-[9.5px] text-signal-400">schedule() · Dijkstra plans the path, heap orders the ETA</div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Rolling stock">
                    <Select value={form.kind} onChange={(v) => setForm({ ...form, kind: v as VehicleKind })}>
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Depart in (min)">
                    <input className={inputClass} value={form.offset} onChange={(e) => setForm({ ...form, offset: e.target.value })} />
                  </Field>
                  <Field label="Origin">
                    <Select value={form.origin} onChange={(v) => setForm({ ...form, origin: v })}>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id} · {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Destination">
                    <Select value={form.destination} onChange={(v) => setForm({ ...form, destination: v })}>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id} · {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="flex gap-2">
                  <Btn type="submit" variant="solid" size="sm">
                    Dispatch unit
                  </Btn>
                  <Btn size="sm" onClick={randomDispatch}>
                    Random job
                  </Btn>
                </div>
                {error && <div className="rounded-sm border border-lred/40 bg-lred/10 px-2 py-1.5 font-mono text-[10.5px] text-lred">✕ {error}</div>}
              </form>
            </Panel>
          </Reveal>

          <Reveal delay={90}>
            <Panel
              code="02·d"
              title="Event Stream"
              right={
                <span className="hud-num text-[10px] text-mist-500">
                  pushes {snap.stats.pushes} · pops {snap.stats.pops}
                </span>
              }
              bodyClass="p-0"
            >
              <div className="max-h-[320px] overflow-y-auto">
                {snap.events.length === 0 && (
                  <div className="px-3 py-6 text-center font-mono text-[11px] text-mist-500">Awaiting first arrival…</div>
                )}
                {snap.events.map((ev, i) => (
                  <div key={`${ev.clock}-${ev.vehicleId}-${i}`} className={cn("flex gap-2 border-b border-white/5 px-3 py-1.5", i === 0 && "rise")}>
                    <span className="hud-num shrink-0 text-[10px] text-mist-500">{formatClock(ev.clock)}</span>
                    <span className="sign shrink-0 text-[9px]" style={{ color: EVENT_COLOR[ev.kind] ?? "#7d95a3" }}>
                      {ev.kind}
                    </span>
                    <span className="font-mono text-[10.5px] leading-snug text-mist-300">{ev.message}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-white/8 p-2">
                {snap.heap.slice(0, 4).map((v) => (
                  <Btn key={v.id} size="sm" variant="danger" onClick={() => withdrawVehicle(v.id)}>
                    withdraw {v.id}
                  </Btn>
                ))}
                <Btn size="sm" variant="outline" onClick={() => notify("ok", `Peak queue depth this session: ${snap.stats.peakSize} vehicles.`)}>
                  peak depth
                </Btn>
              </div>
            </Panel>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
