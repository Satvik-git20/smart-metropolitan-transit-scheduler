import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTransit } from "@/state/store";
import { dijkstra, toSegments } from "@/engine/Dijkstra";
import { bruteForceAssembly, solveAssemblyLine } from "@/engine/AssemblyLine";
import { formatClock, formatDuration } from "@/engine/types";
import type { VehicleKind } from "@/engine/DispatchEngine";
import { Btn, KeyCap, Panel, Reveal } from "@/components/ui";
import { cn } from "@/utils/cn";

type Kind = "in" | "out" | "dim" | "ok" | "err" | "head" | "rule" | "amber";
interface Line {
  id: number;
  kind: Kind;
  text: string;
}

const HELP: [string, string, string][] = [
  ["menu", "", "print the main project menu (or press 1–5)"],
  ["stations", "[CODE]", "list the topology, or dump one node's adjacency list"],
  ["routes", "[LINE]", "list segments with base weight + live incident delay"],
  ["neighbors", "CODE", "print the adjacency bucket for a station"],
  ["components", "", "BFS connected components + isolated stations"],
  ["add-station", "CODE NAME X Y ZONE", "insert a node (degree 0 until wired up)"],
  ["add-route", "ID FROM TO LINE KM MIN [DELAY]", "insert an undirected weighted edge"],
  ["delay", "ROUTEID MIN", "mutate a dynamic weight, then re-plan the fleet"],
  ["plan", "FROM TO", "FEATURE 3 · Dijkstra fastest itinerary"],
  ["trace", "FROM TO [N]", "first N relaxation events of that search"],
  ["heap", "", "FEATURE 2 · dump the priority queue array + tree + stats"],
  ["board", "[N]", "next N arrivals (repeated extract-min preview)"],
  ["dispatch", "FROM TO [KIND] [OFFSET]", "plan a path and enqueue a vehicle"],
  ["tick", "[MIN]", "advance the service clock and process due arrivals"],
  ["fleet", "", "every queued vehicle with its current leg"],
  ["withdraw", "ID", "remove a unit from service"],
  ["replan", "", "re-run Dijkstra for all queued vehicles"],
  ["transfer", "", "FEATURE 4 · assembly-line DP over the express corridor"],
  ["brute", "", "verify the DP against 2^n exhaustive enumeration"],
  ["clock", "", "current service time"],
  ["demo", "", "scripted walk-through of all four features"],
  ["clear", "", "wipe the screen"],
];

const QUICK = [
  "menu",
  "stations CEN",
  "components",
  "plan NGT APT",
  "trace INB HQY 12",
  "heap",
  "board 6",
  "dispatch CIV PRT EXPRESS 2",
  "tick 6",
  "delay R3 18",
  "transfer",
  "brute",
  "demo",
];

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export default function TerminalTab() {
  const { graph, stations, routes, engine, corridor, setDelay, dispatchVehicle, replanFleet, addStation, addRoute, refresh } = useTransit();

  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const historyRef = useRef<string[]>([]);
  const hIdxRef = useRef(-1);
  const idRef = useRef(1);
  const seqRef = useRef(900);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const push = useCallback((text: string, kind: Kind = "out") => {
    setLines((prev) => [...prev.slice(-600), { id: idRef.current++, kind, text }]);
  }, []);

  const pushMany = useCallback(
    (rows: [string, Kind?][], prefix = "") => {
      setLines((prev) => [...prev.slice(-600), ...rows.map(([t, k]) => ({ id: idRef.current++, kind: k ?? "out", text: prefix + t }))]);
    },
    [],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const banner = useCallback(() => {
    pushMany([
      ["SMART METROPOLITAN TRANSIT SCHEDULER · console build 4.2.1", "head"],
      ["engine: TransitGraph(adjacency list) · MinHeap(from scratch) · Dijkstra · Assembly-Line DP", "dim"],
      [`topology loaded: ${stations.length} stations, ${routes.length} bidirectional segments, 4 lines`, "dim"],
      [`service clock ${formatClock(engine.clock)} · ${engine.snapshot().active} vehicles queued`, "dim"],
      ["type 'menu' for the project menu, 'help' for every command, 'demo' for a guided run", "amber"],
      ["", "dim"],
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushMany]);

  const bannerRan = useRef(false);
  useEffect(() => {
    if (bannerRan.current) return; // StrictMode double-invokes effects in dev
    bannerRan.current = true;
    banner();
  }, [banner]);

  // ------------------------------------------------------------- commands
  const exec = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      push(`transit> ${trimmed}`, "in");
      if (!trimmed) return;
      historyRef.current.push(trimmed);
      hIdxRef.current = -1;

      const [cmdRaw, ...args] = trimmed.split(/\s+/);
      const cmd = cmdRaw.toLowerCase();
      const snap = () => engine.snapshot();

      try {
        switch (cmd) {
          case "help":
          case "?":
          case "0": {
            push("COMMAND REFERENCE", "head");
            push("─".repeat(74), "rule");
            HELP.forEach(([c, u, d]) => pushMany([[`${c.padEnd(13)} ${u.padEnd(30)} ${d}`, "dim"]]));
            break;
          }

          case "menu":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5": {
            if (cmd === "menu") {
              pushMany([
                ["╔════════════════════════════════════════════════════════════════╗", "amber"],
                ["║   SMART METROPOLITAN TRANSIT SCHEDULER  ·  MAIN MENU           ║", "head"],
                ["╠════════════════════════════════════════════════════════════════╣", "amber"],
                ["║  1 · Network Topology          graph as adjacency list         ║", "out"],
                ["║  2 · Live Dispatch Engine      custom min-heap priority queue  ║", "out"],
                ["║  3 · Journey Planner           Dijkstra shortest path          ║", "out"],
                ["║  4 · Transfer Optimiser        dynamic programming (2 lines)   ║", "out"],
                ["║  5 · Run the full demonstration                                ║", "out"],
                ["║  0 · Command reference                                         ║", "dim"],
                ["╚════════════════════════════════════════════════════════════════╝", "amber"],
                ["Enter a choice (1-5):", "dim"],
              ]);
              break;
            }
            if (cmd === "1") return exec("stations");
            if (cmd === "2") {
              push("FEATURE 2 · LIVE DISPATCH ENGINE (MinHeap priority queue)", "head");
              return exec("heap");
            }
            if (cmd === "3") return exec("plan NGT APT");
            if (cmd === "4") return exec("transfer");
            return exec("demo");
          }

          case "stations": {
            const code = args[0]?.toUpperCase();
            if (code) {
              const s = graph.getStation(code);
              if (!s) throw new Error(`unknown station "${code}"`);
              push(`STATION ${s.id} · ${s.name}`, "head");
              push(`zone ${s.zone} · coords (${s.x}, ${s.y}) · ${s.hub ? "interchange" : "halt"} · lines [${s.lines.join(", ") || "none"}]`, "dim");
              push(`adjacency[${s.id}] → degree ${graph.degree(s.id)}`, "amber");
              if (graph.degree(s.id) === 0) push("  (empty bucket — isolated node, unreachable from the rest of the network)", "err");
              graph.neighbors(s.id).forEach((e) =>
                push(`  → ${e.to.padEnd(4)} line ${e.line.padEnd(6)} ${e.distanceKm.toFixed(1)} km  base ${e.baseMinutes}m  delay +${e.delay}m  w=${e.baseMinutes + e.delay}m`, "out"),
              );
              break;
            }
            push(`TOPOLOGY · ${graph.order} nodes · ${graph.size} undirected segments · adjacency list`, "head");
            push("─".repeat(74), "rule");
            stations.forEach((s) => {
              const deg = graph.degree(s.id);
              push(`${s.id.padEnd(4)} ${s.name.padEnd(22)} z${s.zone}  deg ${String(deg).padStart(2)}  [${s.lines.join("/") || "—"}]${deg === 0 ? "   ⚠ ISOLATED" : ""}`, deg === 0 ? "err" : "out");
            });
            break;
          }

          case "routes": {
            const line = args[0]?.toUpperCase();
            const list = line ? routes.filter((r) => r.line === line) : routes;
            push(`SEGMENTS${line ? ` · line ${line}` : ""} · w(e) = baseMinutes + incidentDelay`, "head");
            push("─".repeat(74), "rule");
            if (!list.length) push("no segments match that filter", "err");
            list.forEach((r) =>
              push(
                `${r.id.padEnd(4)} ${r.from}–${r.to}  ${r.line.padEnd(6)} ${r.distanceKm.toFixed(1).padStart(4)} km  base ${String(r.baseMinutes).padStart(2)}m  delay +${String(r.incidentDelay).padStart(2)}m  w=${String(r.baseMinutes + r.incidentDelay).padStart(2)}m${r.note ? `  ⚠ ${r.note}` : ""}`,
                r.incidentDelay > 0 ? "amber" : "out",
              ),
            );
            break;
          }

          case "neighbors": {
            const code = args[0]?.toUpperCase();
            if (!code) throw new Error("usage: neighbors CODE");
            if (!graph.hasStation(code)) throw new Error(`unknown station "${code}"`);
            push(`adjacency[${code}] =`, "head");
            const ns = graph.neighbors(code);
            if (!ns.length) push("  [] — no incident edges", "err");
            ns.forEach((e) => push(`  { to: ${e.to}, line: ${e.line}, route: ${e.routeId}, w: ${e.baseMinutes + e.delay} }`, "out"));
            break;
          }

          case "components": {
            const comps = graph.components();
            push(`CONNECTIVITY · ${comps.length} component(s) via BFS`, "head");
            comps.forEach((c, i) => push(`  C${i + 1} [${c.length}]: ${c.join(", ")}`, c.length === 1 ? "err" : "out"));
            const iso = graph.isolatedStations();
            push(iso.length ? `isolated: ${iso.join(", ")} — any plan to/from these returns found=false` : "no isolated nodes", iso.length ? "err" : "ok");
            break;
          }

          case "add-station": {
            if (args.length < 5) throw new Error("usage: add-station CODE NAME X Y ZONE");
            const [code, name, x, y, zone] = args;
            addStation({ id: code.toUpperCase(), name, x: Number(x), y: Number(y), zone: Number(zone) });
            push(`station ${code.toUpperCase()} inserted · adjacency bucket created with degree 0`, "ok");
            break;
          }

          case "add-route": {
            if (args.length < 6) throw new Error("usage: add-route ID FROM TO LINE KM MINUTES [DELAY]");
            const [id, from, to, line, km, min, delay] = args;
            addRoute({
              id: id.toUpperCase(),
              from: from.toUpperCase(),
              to: to.toUpperCase(),
              line: line.toUpperCase(),
              distanceKm: Number(km),
              baseMinutes: Number(min),
              incidentDelay: delay ? Number(delay) : 0,
            });
            push(`route ${id.toUpperCase()} opened · ${from.toUpperCase()}–${to.toUpperCase()} on ${line.toUpperCase()} · w=${Number(min) + (delay ? Number(delay) : 0)}m`, "ok");
            break;
          }

          case "delay": {
            if (args.length < 2) throw new Error("usage: delay ROUTEID MINUTES");
            const [id, mins] = args;
            setDelay(id.toUpperCase(), Number(mins));
            const moved = replanFleet();
            push(`weight[${id.toUpperCase()}] := base + ${Number(mins)} min · ${moved} queued vehicle(s) re-routed`, "ok");
            break;
          }

          case "plan": {
            const [a, b] = args.map((x) => x.toUpperCase());
            if (!a || !b) throw new Error("usage: plan FROM TO");
            const t0 = performance.now();
            const r = dijkstra(graph, a, b);
            const ms = performance.now() - t0;
            push(`DIJKSTRA ${a} → ${b}`, "head");
            if (!r.found) {
              push(`✕ NO PATH · dist[${b}] = ∞ after settling ${r.reachable.length} node(s)`, "err");
              push(`  reachable component from ${a}: ${r.reachable.join(", ")}`, "dim");
              push(`  ${b} lies in a different component (or is isolated) — reported as failure, never an infinite loop`, "dim");
              break;
            }
            push(`  path    : ${r.path.join(" → ")}`, "out");
            toSegments(r).forEach((s, i) =>
              push(`  ride ${i + 1}  : [${s.line}] ${s.from} → ${s.to}  (${s.stops.length - 1} stop(s), ${s.minutes.toFixed(1)} min, ${s.distanceKm.toFixed(1)} km)`, "out"),
            );
            push(`  total   : ${formatDuration(r.totalMinutes)} · ${r.totalKm.toFixed(1)} km · ${r.transfers} interchange(s) · +${r.totalDelay.toFixed(0)} min of incident delay absorbed`, "amber");
            push(`  cost    : ${r.pops} extract-min · ${r.relaxations} relaxations · ${r.rejections} rejected · ${r.heapComparisons} heap comparisons · ${ms.toFixed(2)} ms`, "dim");
            push(`  bound   : O((V+E) log V) with a binary heap  =  O(${(graph.order + graph.size) * Math.ceil(Math.log2(graph.order + 1))} ) here`, "dim");
            break;
          }

          case "trace": {
            const [a, b, nRaw] = args.map((x) => x.toUpperCase());
            if (!a || !b) throw new Error("usage: trace FROM TO [N]");
            const n = Number(nRaw ?? 14);
            const r = dijkstra(graph, a, b);
            push(`RELAXATION TRACE ${a} → ${b} · first ${Math.min(n, r.trace.length)} of ${r.trace.length} events`, "head");
            r.trace.slice(0, n).forEach((t) =>
              push(`  ${String(t.step).padStart(3)}. [${t.kind.padEnd(6)}] ${t.message}`, t.kind === "relax" ? "ok" : t.kind === "reject" ? "amber" : "dim"),
            );
            break;
          }

          case "heap": {
            const s = snap();
            push(`MIN-HEAP STATE · size ${s.heap.length} · keyed on arriveAt (tie-break id)`, "head");
            if (s.empty) {
              push("  ⚠ schedule is EMPTY — peek()/pop() return undefined, tick() is a no-op", "err");
              push("  enqueue work with: dispatch FROM TO KIND OFFSET", "dim");
              break;
            }
            push(`  array : [${s.heap.map((v) => `${formatClock(v.arriveAt)}/${v.id}`).join(", ")}]`, "out");
            push("  tree  :", "dim");
            let start = 0;
            let width = 1;
            let depth = 0;
            while (start < s.heap.length) {
              const lvl = s.heap.slice(start, start + width);
              push(`    ${"  ".repeat(depth)}depth ${depth}: ${lvl.map((v) => v.id).join("  ")}`, "out");
              start += width;
              width *= 2;
              depth++;
            }
            const valid = s.heap.every((v, i) => i === 0 || s.heap[(i - 1) >> 1].arriveAt <= v.arriveAt);
            push(
              `  root  : ${s.next ? `${s.next.id} arrives ${formatClock(s.next.arriveAt)} at ${graph.getStation(s.next.path[s.next.leg])?.name ?? "?"} — next extract-min` : "queue empty"}`,
              "amber",
            );
            push(`  stats : pushes ${s.stats.pushes} · pops ${s.stats.pops} · comparisons ${s.stats.comparisons} · swaps ${s.stats.swaps} · peak ${s.stats.peakSize}`, "dim");
            push(`  invariant parent(i) ≤ child(i) : ${valid ? "HOLDS ✓" : "VIOLATED ✗"}`, valid ? "ok" : "err");
            break;
          }

          case "board": {
            const n = Number(args[0] ?? 8);
            const s = snap();
            push(`DEPARTURE BOARD · ${formatClock(s.clock)} · next ${Math.min(n, s.heap.length)} of ${s.heap.length}`, "head");
            if (s.empty) {
              push("  — no vehicles queued —", "err");
              break;
            }
            s.heap
              .slice()
              .sort((a, b) => a.arriveAt - b.arriveAt)
              .slice(0, n)
              .forEach((v, i) =>
                push(
                  `  ${String(i + 1).padStart(2)}. ${formatClock(v.arriveAt)}  ${v.id.padEnd(6)} ${v.kind.padEnd(8)} → ${String(graph.getStation(v.path[v.leg])?.name ?? v.path[v.leg]).padEnd(22)} leg ${v.leg}/${v.path.length - 1}  load ${v.load}/${v.capacity}`,
                  i === 0 ? "amber" : "out",
                ),
              );
            break;
          }

          case "dispatch": {
            const [from, to, kind, offset] = args;
            if (!from || !to) throw new Error("usage: dispatch FROM TO [METRO|EXPRESS|TRAM|BUS] [OFFSET_MIN]");
            const v = dispatchVehicle({
              id: `${(kind ?? "M").toUpperCase()[0]}-${seqRef.current++}`,
              kind: ((kind ?? "METRO").toUpperCase() as VehicleKind) ?? "METRO",
              line: "SYS",
              origin: from.toUpperCase(),
              destination: to.toUpperCase(),
              departAt: engine.clock + Math.max(0, Number(offset ?? 1)),
              load: 120,
            });
            push(`enqueued ${v.id} · path ${v.path.join("→")} · ETA ${formatClock(v.arriveAt)} · heap size ${snap().heap.length}`, "ok");
            break;
          }

          case "tick": {
            const raw = Number(args[0] ?? 5);
            if (!Number.isFinite(raw) || raw < 0)
              throw new Error("usage: tick [MIN] — MIN must be a non-negative number");
            const mins = Math.floor(raw);
            const ev = engine.tick(mins);
            refresh();
            push(`clock += ${mins} min → ${formatClock(engine.clock)} · ${ev.length} event(s)`, "head");
            if (!ev.length) push("  no arrivals fell due (heap minimum is still in the future)", "dim");
            ev.forEach((e) => push(`  ${formatClock(e.clock)} [${e.kind.padEnd(9)}] ${e.message}`, e.kind === "TERMINATE" ? "dim" : e.kind === "HOLD" ? "err" : "out"));
            break;
          }

          case "fleet": {
            const s = snap();
            push(`ACTIVE FLEET · ${s.active} unit(s) · ${s.completed} completed run(s)`, "head");
            if (s.empty) push("  ⚠ empty schedule", "err");
            s.heap.forEach((v) =>
              push(`  ${v.id.padEnd(6)} ${v.kind.padEnd(8)} ${v.origin}→${v.destination} · at ${v.path[Math.max(0, v.leg - 1)]} heading ${v.path[v.leg]} · ETA ${formatClock(v.arriveAt)} · absorbed ${v.delaysAbsorbed.toFixed(0)}m delay`, "out"),
            );
            break;
          }

          case "withdraw": {
            const id = args[0]?.toUpperCase();
            if (!id) throw new Error("usage: withdraw ID");
            const ok = engine.withdraw(id);
            refresh();
            push(ok ? `${id} withdrawn · heap rebuilt via O(n) Floyd heapify` : `${id} is not on the board`, ok ? "ok" : "err");
            break;
          }

          case "replan": {
            const moved = replanFleet();
            push(`re-planned the fleet against current weights · ${moved} vehicle(s) took a different path`, "ok");
            break;
          }

          case "transfer": {
            const r = solveAssemblyLine(corridor);
            push(`ASSEMBLY-LINE SCHEDULING · ${corridor.stops.length} corridor stops · 2 parallel express lines`, "head");
            push("─".repeat(74), "rule");
            corridor.stops.forEach((s, j) => push(`  stop ${j}: ${s.id.padEnd(4)} ${s.name.padEnd(20)} a[${r.route[j].line}][${j}]=${corridor.ride[r.route[j].line][j]}m`, "dim"));
            push("─".repeat(74), "rule");
            push(`  f[0] = [${r.f[0].join(", ")}]  +exit ${corridor.exit[0]} = ${r.f[0][r.n - 1] + corridor.exit[0]}`, "out");
            push(`  f[1] = [${r.f[1].join(", ")}]  +exit ${corridor.exit[1]} = ${r.f[1][r.n - 1] + corridor.exit[1]}`, "out");
            push(`  l[]  = [${r.l[0].join(", ")}] / [${r.l[1].join(", ")}]   (traceback pointers)`, "dim");
            push(`  OPTIMAL: ${formatDuration(r.total)} · board ${corridor.lines[r.entryLine].id}, alight ${corridor.lines[r.exitLine].id}, ${r.transfers} transfer(s)`, "amber");
            push(`  itinerary: ${r.route.map((x) => `${x.stop.id}[${corridor.lines[x.line].id}]`).join(" → ")}`, "out");
            r.transferStops.forEach((t) => push(`  transfer after ${t.afterStop.id}: ${corridor.lines[t.from].id} → ${corridor.lines[t.to].id} penalty ${t.penalty} min`, "ok"));
            push(`  never transferring would cost ${Math.min(...r.naiveStayCost)} min → DP saves ${Math.max(0, r.saving)} min`, "dim");
            push(`  complexity: O(n) = ${r.n * 2} cell fills, versus 2^${r.n} = ${Math.pow(2, r.n)} patterns by brute force`, "dim");
            break;
          }

          case "brute": {
            const r = solveAssemblyLine(corridor);
            const b = bruteForceAssembly(corridor);
            push(`EXHAUSTIVE VERIFICATION · enumerated ${b.patterns} line-assignment patterns`, "head");
            push(`  brute force optimum : ${b.total} min`, "out");
            push(`  dynamic programming : ${r.total} min`, "out");
            push(b.total === r.total ? "  ✓ identical — the DP recurrence is correct" : "  ✗ MISMATCH — inspect the recurrence", b.total === r.total ? "ok" : "err");
            break;
          }

          case "clock":
            push(`service clock ${formatClock(engine.clock)} (${engine.clock} minutes since midnight)`, "amber");
            break;

          case "demo":
            await runDemo();
            break;

          case "clear":
          case "cls":
            setLines([]);
            break;

          case "about":
            pushMany([
              ["SMART METROPOLAN TRANSIT SCHEDULER", "head"],
              ["coursework reference implementation — four data structures, one domain:", "dim"],
              ["  1 adjacency-list multigraph with dynamic edge weights", "out"],
              ["  2 from-scratch binary min-heap driving the dispatch board", "out"],
              ["  3 Dijkstra SSSP with lazy deletion + full relaxation trace", "out"],
              ["  4 assembly-line dynamic programming for two parallel express lines", "out"],
            ]);
            break;

          case "exit":
          case "quit":
            push("the console is in-process — it has nowhere to exit to. try 'clear'.", "dim");
            break;

          default:
            push(`unknown command "${cmdRaw}" — type 'help' for the reference`, "err");
        }
      } catch (err) {
        push(`✕ ${err instanceof Error ? err.message : String(err)}`, "err");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, stations, routes, engine, corridor, push, pushMany, addStation, addRoute, setDelay, replanFleet, dispatchVehicle, refresh],
  );

  // --------------------------------------------------------- scripted demo
  const runDemo = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const act = async (rows: [string, Kind?][], pause = 260) => {
      pushMany(rows);
      await sleep(pause);
    };
    await act([["", "dim"], ["═══ GUIDED DEMONSTRATION · all four features ═══", "head"]], 400);

    await act([["[1/4] NETWORK TOPOLOGY — adjacency list with dynamic weights", "amber"]], 320);
    await act([
      [`  ${graph.order} nodes, ${graph.size} undirected segments; memory O(V+E) instead of O(V²)=${graph.order * graph.order}`, "out"],
      [`  adjacency[CEN] has degree ${graph.degree("CEN")} — the busiest interchange in the fixture`, "out"],
      [`  isolated node(s): ${graph.isolatedStations().join(", ") || "none"} → deliberately unreachable`, "err"],
      [`  live weight of R3 (CIV–CEN): base 6 + delay ${graph.getRoute("R3")?.incidentDelay ?? 0} = ${6 + (graph.getRoute("R3")?.incidentDelay ?? 0)} min`, "out"],
    ], 520);

    await act([["[2/4] DISPATCH ENGINE — custom binary min-heap", "amber"]], 320);
    const s1 = engine.snapshot();
    await act([
      [`  queue depth ${s1.heap.length}; root = ${s1.next?.id ?? "—"} arriving ${s1.next ? formatClock(s1.next.arriveAt) : "—"}`, "out"],
      [`  array: [${s1.heap.slice(0, 6).map((v) => formatClock(v.arriveAt)).join(", ")}${s1.heap.length > 6 ? ", …" : ""}]`, "dim"],
      [`  cumulative cost: ${s1.stats.comparisons} comparisons, ${s1.stats.swaps} swaps, ${s1.stats.pushes} pushes, ${s1.stats.pops} pops`, "dim"],
      [`  advancing the clock 6 minutes…`, "out"],
    ], 420);
    const ev = engine.tick(6);
    refresh();
    await act(
      ev.length
        ? ev.slice(0, 6).map((e) => [`  ${formatClock(e.clock)} [${e.kind}] ${e.message}`, "out"] as [string, Kind])
        : [["  no arrival fell due — the heap minimum is still in the future", "dim"]],
      480,
    );

    await act([["[3/4] JOURNEY PLANNER — Dijkstra", "amber"]], 320);
    const r = dijkstra(graph, "INB", "APT");
    await act(
      r.found
        ? [
            [`  query INB → APT`, "out"],
            [`  path: ${r.path.join(" → ")}`, "out"],
            [`  ${formatDuration(r.totalMinutes)} · ${r.totalKm.toFixed(1)} km · ${r.transfers} interchange(s) · ${r.relaxations} relaxations in ${r.pops} extractions`, "amber"],
          ]
        : [["  query INB → APT returned NO PATH (components are disjoint)", "err"]],
      480,
    );
    const bad = dijkstra(graph, "CEN", "OLD");
    await act([[`  edge case CEN → OLD: found=${bad.found}, dist=∞, reachable=${bad.reachable.length} node(s) — reported cleanly, no infinite loop`, "err"]], 480);

    await act([["[4/4] TRANSFER OPTIMISER — assembly-line dynamic programming", "amber"]], 320);
    const dp = solveAssemblyLine(corridor);
    await act([
      [`  corridor: ${corridor.stops.map((s) => s.id).join(" → ")}`, "out"],
      [`  f[AMBER] = [${dp.f[0].join(", ")}]`, "dim"],
      [`  f[BLUE ] = [${dp.f[1].join(", ")}]`, "dim"],
      [`  optimum ${dp.total} min with ${dp.transfers} transfer(s); staying on one line costs ≥ ${Math.min(...dp.naiveStayCost)} min → saves ${Math.max(0, dp.saving)} min`, "amber"],
      [`  verified against ${Math.pow(2, dp.n)} brute-force patterns: ${bruteForceAssembly(corridor).total === dp.total ? "MATCH ✓" : "MISMATCH ✗"}`, "ok"],
    ], 560);

    await act([["═══ end of demonstration · try 'delay R3 18' then 'plan CIV CEN' to watch the path change ═══", "head"]], 200);
    busyRef.current = false;
    setBusy(false);
  }, [engine, graph, corridor, pushMany, refresh]);

  // --------------------------------------------------------------- input
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = input;
    setInput("");
    void exec(value);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const h = historyRef.current;
      if (!h.length) return;
      hIdxRef.current = hIdxRef.current < 0 ? h.length - 1 : Math.max(0, hIdxRef.current - 1);
      setInput(h[hIdxRef.current] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const h = historyRef.current;
      if (hIdxRef.current < 0) return;
      hIdxRef.current = Math.min(h.length, hIdxRef.current + 1);
      setInput(hIdxRef.current >= h.length ? "" : (h[hIdxRef.current] ?? ""));
    } else if (e.key === "Tab") {
      e.preventDefault();
      const names = HELP.map((h) => h[0]);
      const hit = names.find((n) => n.startsWith(input.trim().toLowerCase()));
      if (hit) setInput(hit);
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  const toneClass = useMemo<Record<Kind, string>>(
    () => ({
      in: "text-signal-400",
      out: "text-mist-200",
      dim: "text-mist-500",
      ok: "text-lgreen",
      err: "text-lred",
      head: "text-mist-50 font-semibold",
      rule: "text-ink-500",
      amber: "text-signal-300",
    }),
    [],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      <Reveal>
        <Panel
          code="CLI"
          title="Interactive Console · same engine, no UI layer"
          right={
            <div className="flex items-center gap-2">
              <span className={cn("hud-num text-[10px]", busy ? "text-signal-400" : "text-mist-500")}>{busy ? "running demo…" : "ready"}</span>
              <Btn size="sm" variant="outline" onClick={() => setLines([])}>
                clear
              </Btn>
            </div>
          }
          bodyClass="p-0"
        >
          <div
            ref={boxRef}
            onClick={() => inputRef.current?.focus()}
            className="relative cursor-text bg-ink-950/80 bg-hairline"
          >
            <div ref={scrollRef} className="h-[560px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.55]">
              {lines.map((l) => (
                <div key={l.id} className={cn("whitespace-pre-wrap break-words", toneClass[l.kind])}>
                  {l.text || "\u00A0"}
                </div>
              ))}
              <form onSubmit={onSubmit} className="flex items-center gap-2">
                <span className="text-signal-500">transit&gt;</span>
                <input
                  ref={inputRef}
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 bg-transparent text-mist-50 caret-signal-400 outline-none"
                  aria-label="console input"
                />
                <span className="caret -ml-2 inline-block h-3.5 w-1.5 bg-signal-400" />
              </form>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-ink-950 to-transparent" />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/8 px-3 py-2">
            <span className="sign text-[9px] text-mist-500">keys</span>
            <span className="flex items-center gap-1 text-[10px] text-mist-400">
              <KeyCap>↑</KeyCap>
              <KeyCap>↓</KeyCap> history
            </span>
            <span className="flex items-center gap-1 text-[10px] text-mist-400">
              <KeyCap>Tab</KeyCap> complete
            </span>
            <span className="flex items-center gap-1 text-[10px] text-mist-400">
              <KeyCap>Ctrl</KeyCap>
              <KeyCap>L</KeyCap> clear
            </span>
            <span className="hud-num ml-auto text-[10px] text-mist-500">{lines.length} lines buffered</span>
          </div>
        </Panel>
      </Reveal>

      <Reveal delay={60}>
        <Panel code="CLI·b" title="Quick commands">
          <div className="flex flex-col gap-1.5">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => void exec(q)}
                className="group flex items-center gap-2 rounded-[3px] border border-white/8 bg-ink-950/60 px-2 py-1.5 text-left font-mono text-[10.5px] text-mist-300 transition-all hover:border-signal-500/60 hover:bg-signal-500/10 hover:text-signal-300"
              >
                <span className="text-mist-500 transition-colors group-hover:text-signal-500">▸</span>
                {q}
              </button>
            ))}
          </div>
          <p className="mt-3 border-t border-white/8 pt-2 font-mono text-[10px] leading-relaxed text-mist-500">
            Every command calls the same engine modules the panels use — <span className="text-mist-300">TransitGraph</span>,{" "}
            <span className="text-mist-300">MinHeap</span>, <span className="text-mist-300">dijkstra()</span>,{" "}
            <span className="text-mist-300">solveAssemblyLine()</span>. Nothing is mocked at the presentation layer.
          </p>
        </Panel>
      </Reveal>
    </div>
  );
}
