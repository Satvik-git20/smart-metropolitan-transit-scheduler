/**
 * Dijkstra.ts — FEATURE 3: Journey Planner.
 *
 * Single-source shortest path on a graph with non-negative weights, using the
 * custom MinHeap from ./MinHeap as the priority queue of frontier nodes.
 *
 *     dist[src] = 0 ; dist[v] = ∞ ∀ v ≠ src
 *     while Q ≠ ∅:
 *         u ← extract-min(Q)          // O(log V)
 *         if u settled: continue       // stale-queue guard (lazy deletion)
 *         settle(u)
 *         for each (u,v,w) ∈ E(u):     // O(deg u)
 *             if dist[u] + w < dist[v]:
 *                 dist[v] ← dist[u] + w ; prev[v] ← u ; push(Q, (dist[v], v))
 *
 * Complexity: O((V + E) log V) with a binary heap. Every relaxation pushes a
 * fresh entry rather than performing decrease-key, which keeps the heap
 * implementation textbook-simple; duplicates are discarded by the `settled`
 * set — the standard "lazy deletion" trick.
 *
 * Edge cases handled explicitly:
 *   • unknown source/target      → DijkstraError
 *   • target unreachable         → { found:false, reachable:[...] } so the UI
 *                                   can report the disconnected component
 *   • source === target          → zero-cost trivial path, no iterations
 *   • zero-weight edges          → fine (weights are clamped ≥ 0 in the graph)
 *   • parallel edges             → both are relaxed; cheapest naturally wins
 */

import { MinHeap } from "./MinHeap";
import { GraphError, type TransitGraph } from "./Graph";
import { edgeMinutes } from "./types";
import type { Edge, LineId, StationId } from "./types";

export class DijkstraError extends GraphError {}

export type TraceKind = "pop" | "relax" | "reject" | "stale" | "done";

/** One row of the algorithm trace, replayable in the UI or printed by the CLI. */
export interface TraceEvent {
  kind: TraceKind;
  step: number;
  node: StationId;
  from?: StationId;
  line?: LineId;
  edgeWeight?: number;
  candidate?: number;
  previousBest?: number;
  settledDist?: number;
  message: string;
}

export interface DistRow {
  id: StationId;
  name: string;
  dist: number;
  prev: StationId | null;
  settled: boolean;
}

export interface PathLeg {
  from: StationId;
  to: StationId;
  line: LineId;
  minutes: number;
  distanceKm: number;
  delay: number;
}

export interface DijkstraResult {
  source: StationId;
  target: StationId | null;
  found: boolean;
  /** ∞ when unreachable */
  totalMinutes: number;
  totalKm: number;
  totalDelay: number;
  path: StationId[];
  legs: PathLeg[];
  transfers: number;
  /**
   * Nodes settled with finite distance. When the target is unreachable
   * this is the complete reachable component; with an early exit it is
   * only the set settled *before* the target (a subset of the component).
   */
  reachable: StationId[];
  dist: Map<StationId, number>;
  prev: Map<StationId, StationId | null>;
  table: DistRow[];
  trace: TraceEvent[];
  pops: number;
  relaxations: number;
  rejections: number;
  heapComparisons: number;
  heapSwaps: number;
}

const INF = Infinity;

export function dijkstra(
  graph: TransitGraph,
  source: StationId,
  target: StationId | null = null,
): DijkstraResult {
  if (!graph.hasStation(source)) throw new DijkstraError("UNKNOWN_STATION", `Origin "${source}" is not in the network.`);
  if (target !== null && !graph.hasStation(target))
    throw new DijkstraError("UNKNOWN_STATION", `Destination "${target}" is not in the network.`);

  const dist = new Map<StationId, number>();
  const prev = new Map<StationId, StationId | null>();
  const settled = new Set<StationId>();
  const trace: TraceEvent[] = [];
  const edgeTaken = new Map<StationId, Edge>();

  for (const id of graph.stationIds()) {
    dist.set(id, INF);
    prev.set(id, null);
  }
  dist.set(source, 0);

  // Priority queue of (cost, node) — ties broken by station id for determinism.
  const pq = new MinHeap<{ d: number; id: StationId }>(
    (a, b) => (a.d !== b.d ? a.d - b.d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  pq.push({ d: 0, id: source });

  let step = 0;
  let relaxations = 0;
  let rejections = 0;
  let pops = 0;
  let earlyExit = false;

  while (!pq.isEmpty()) {
    const { d, id: u } = pq.pop()!;
    pops++;

    if (settled.has(u)) {
      trace.push({ kind: "stale", step: step++, node: u, settledDist: d, message: `skip stale entry ${u} (already settled at ${dist.get(u)})` });
      continue;
    }

    settled.add(u);
    trace.push({ kind: "pop", step: step++, node: u, settledDist: d, message: `settle ${u} @ ${d === INF ? "∞" : d.toFixed(1)} min` });

    if (target !== null && u === target) {
      earlyExit = true;
      trace.push({ kind: "done", step: step++, node: u, settledDist: d, message: `destination ${u} settled — early exit after ${pops} extractions` });
      break;
    }

    for (const e of graph.neighbors(u)) {
      if (settled.has(e.to)) continue; // optimal already, no relaxation can improve it
      const w = edgeMinutes(e);
      const candidate = (dist.get(u) ?? INF) + w;
      const previousBest = dist.get(e.to) ?? INF;

      if (candidate < previousBest - 1e-9) {
        dist.set(e.to, candidate);
        prev.set(e.to, u);
        edgeTaken.set(e.to, e);
        relaxations++;
        pq.push({ d: candidate, id: e.to });
        trace.push({
          kind: "relax",
          step: step++,
          node: e.to,
          from: u,
          line: e.line,
          edgeWeight: w,
          candidate,
          previousBest,
          message: `relax ${u}→${e.to} (${w.toFixed(1)}m): ${fmt(previousBest)} → ${candidate.toFixed(1)}`,
        });
      } else {
        rejections++;
        trace.push({
          kind: "reject",
          step: step++,
          node: e.to,
          from: u,
          line: e.line,
          edgeWeight: w,
          candidate,
          previousBest,
          message: `no gain ${u}→${e.to}: ${candidate.toFixed(1)} ≥ ${fmt(previousBest)}`,
        });
      }
    }
  }

  const reachable = [...settled].filter((id) => dist.get(id)! < INF);
  const limit = target ?? null;
  const found = limit === null ? true : settled.has(limit) && (dist.get(limit) ?? INF) < INF;

  const path: StationId[] = [];
  const legs: PathLeg[] = [];

  if (limit === null) {
    // full SSSP: no single path, but the table is complete
  } else if (found) {
    let cur: StationId | null = limit;
    while (cur !== null) {
      path.unshift(cur);
      cur = prev.get(cur) ?? null;
    }
    for (let i = 0; i + 1 < path.length; i++) {
      const e = edgeTaken.get(path[i + 1]);
      if (!e) continue;
      legs.push({
        from: path[i],
        to: path[i + 1],
        line: e.line,
        minutes: edgeMinutes(e),
        distanceKm: e.distanceKm,
        delay: e.delay,
      });
    }
  }

  const transfers = legs.reduce((n, l, i) => (i > 0 && l.line !== legs[i - 1].line ? n + 1 : n), 0);
  const table: DistRow[] = graph.stationList().map((s) => ({
    id: s.id,
    name: s.name,
    dist: dist.get(s.id) ?? INF,
    prev: prev.get(s.id) ?? null,
    settled: settled.has(s.id),
  }));

  return {
    source,
    target: limit,
    found,
    totalMinutes: limit && found ? (dist.get(limit) ?? INF) : limit ? INF : 0,
    totalKm: legs.reduce((s, l) => s + l.distanceKm, 0),
    totalDelay: legs.reduce((s, l) => s + l.delay, 0),
    path,
    legs,
    transfers,
    reachable: earlyExit ? [...settled] : reachable,
    dist,
    prev,
    table,
    trace,
    pops,
    relaxations,
    rejections,
    heapComparisons: pq.stats.comparisons,
    heapSwaps: pq.stats.swaps,
  };
}

function fmt(v: number): string {
  return v === INF ? "∞" : v.toFixed(1);
}

/**
 * Multi-leg itinerary rendering helper: groups consecutive legs on the same
 * line into "ride" segments — exactly what a passenger-facing planner shows.
 */
export interface Segment {
  line: LineId;
  from: StationId;
  to: StationId;
  stops: StationId[];
  minutes: number;
  distanceKm: number;
}

export function toSegments(result: DijkstraResult): Segment[] {
  const out: Segment[] = [];
  for (const leg of result.legs) {
    const last = out[out.length - 1];
    if (last && last.line === leg.line && last.to === leg.from) {
      last.to = leg.to;
      last.stops.push(leg.to);
      last.minutes += leg.minutes;
      last.distanceKm += leg.distanceKm;
    } else {
      out.push({
        line: leg.line,
        from: leg.from,
        to: leg.to,
        stops: [leg.from, leg.to],
        minutes: leg.minutes,
        distanceKm: leg.distanceKm,
      });
    }
  }
  return out;
}
