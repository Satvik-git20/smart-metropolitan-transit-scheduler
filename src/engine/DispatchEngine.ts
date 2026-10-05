/**
 * DispatchEngine.ts — FEATURE 2: Live Multi-Vehicle Dispatch.
 *
 * The departure board is a priority queue keyed on *absolute arrival time*
 * (minutes since midnight). At any instant the dispatcher only cares about one
 * question — "which vehicle arrives first?" — which is exactly extract-min.
 *
 *   schedule(v)   push                 O(log n)
 *   tick(Δ)       pop while due        O(k log n) for k arrivals
 *   replan()      drain + rebuild      O(n log n)   (after an incident)
 *
 * Because each vehicle's path is produced by FEATURE 3 (Dijkstra), the engine
 * demonstrates the two structures cooperating: the graph answers "which way?",
 * the heap answers "who's next?".
 *
 * Edge cases: empty schedule (tick is a no-op, pop returns undefined),
 * unreachable destination (schedule throws BEFORE mutating state), a route
 * deleted mid-journey (the vehicle is re-planned from its current position),
 * and duplicate arrival timestamps (tie-broken by vehicle id → deterministic).
 */

import { MinHeap } from "./MinHeap";
import { dijkstra } from "./Dijkstra";
import { GraphError, type TransitGraph } from "./Graph";
import { edgeMinutes, formatClock } from "./types";
import type { LineId, RouteId, StationId } from "./types";

export type VehicleKind = "METRO" | "EXPRESS" | "TRAM" | "BUS";
export type VehicleStatus = "EN ROUTE" | "BOARDING" | "TERMINATED" | "REPLAN";

export interface Vehicle {
  id: string;
  kind: VehicleKind;
  line: LineId;
  origin: StationId;
  destination: StationId;
  path: StationId[];
  /** index in `path` of the station the vehicle is currently heading toward */
  leg: number;
  departedAt: number;
  arriveAt: number;
  load: number;
  capacity: number;
  dwellMinutes: number;
  status: VehicleStatus;
  delaysAbsorbed: number;
}

export type EventKind = "ENQUEUE" | "ARRIVE" | "DEPART" | "TERMINATE" | "REPLAN" | "HOLD" | "TICK";

export interface DispatchEvent {
  clock: number;
  kind: EventKind;
  vehicleId: string;
  line: LineId;
  station?: StationId;
  message: string;
}

export interface ScheduleRequest {
  id: string;
  kind: VehicleKind;
  line: LineId;
  origin: StationId;
  destination: StationId;
  departAt: number;
  load?: number;
  capacity?: number;
}

export interface DispatchSnapshot {
  clock: number;
  heap: Vehicle[];
  next: Vehicle | undefined;
  events: DispatchEvent[];
  stats: { comparisons: number; swaps: number; pushes: number; pops: number; peakSize: number };
  recentOps: { index: number; kind: string; seq: number; other?: number }[];
  completed: number;
  active: number;
  terminated: Vehicle[];
  empty: boolean;
}

const DWELL: Record<VehicleKind, number> = { METRO: 1, EXPRESS: 1, TRAM: 2, BUS: 3 };

export class DispatchEngine {
  private readonly heap: MinHeap<Vehicle>;
  private vehicles = new Map<string, Vehicle>();
  private events: DispatchEvent[] = [];
  private done: Vehicle[] = [];
  private _clock: number;

  constructor(
    private graph: TransitGraph,
    startClock = 6 * 60,
  ) {
    this._clock = startClock;
    // Priority = arrival timestamp; deterministic tie-break on vehicle id.
    this.heap = new MinHeap<Vehicle>((a, b) =>
      a.arriveAt !== b.arriveAt ? a.arriveAt - b.arriveAt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
  }

  get clock(): number {
    return this._clock;
  }

  get graphRef(): TransitGraph {
    return this.graph;
  }

  /** Rebind to a rebuilt graph (the UI keeps graph data immutable). */
  attachGraph(graph: TransitGraph): void {
    this.graph = graph;
  }

  /**
   * Clear the board and restart the service clock. Mutates this instance in
   * place so engine identity — and every closure holding it — stays stable.
   */
  reset(startClock = 6 * 60): void {
    this.heap.clear();
    this.vehicles.clear();
    this.events = [];
    this.done = [];
    this._clock = startClock;
    const s = this.heap.stats;
    s.comparisons = 0;
    s.swaps = 0;
    s.pushes = 0;
    s.pops = 0;
    s.peakSize = 0;
  }

  /**
   * Rewind the service clock across midnight. Every queued vehicle's absolute
   * timestamps shift by the same amount, so heap keys stay consistent with
   * the clock (all queued arrivals remain in the future, none negative).
   */
  rewind(minutes: number): void {
    const shift = Math.min(Math.max(0, minutes), this._clock);
    if (shift <= 0) return;
    this._clock -= shift;
    const queued = this.heap.toArray();
    this.heap.clear();
    for (const v of queued) {
      v.arriveAt -= shift;
      v.departedAt -= shift;
      this.heap.push(v);
    }
  }

  /**
   * Plan and enqueue a vehicle. Throws *before* any state change if the
   * destination is unreachable, so a failed dispatch never corrupts the board.
   */
  schedule(req: ScheduleRequest): Vehicle {
    if (!this.graph.hasStation(req.origin)) throw new GraphError("UNKNOWN_STATION", `Origin "${req.origin}" unknown.`);
    if (!this.graph.hasStation(req.destination)) throw new GraphError("UNKNOWN_STATION", `Destination "${req.destination}" unknown.`);
    if (req.origin === req.destination)
      throw new GraphError("SELF_LOOP", `Cannot dispatch "${req.id}": origin and destination are both "${req.origin}".`);
    if (this.vehicles.has(req.id)) throw new GraphError("DUPLICATE_VEHICLE", `Vehicle "${req.id}" is already on the board.`);
    if (!Number.isFinite(req.departAt))
      throw new GraphError("BAD_NUMBER", `departAt must be a finite number (got ${req.departAt}).`);

    const plan = dijkstra(this.graph, req.origin, req.destination);
    if (!plan.found) {
      throw new GraphError(
        "UNREACHABLE",
        `No path ${req.origin} → ${req.destination}: destination lies in a different connected component.`,
      );
    }

    const dwell = DWELL[req.kind] ?? 1;
    const departAt = Math.max(req.departAt, this._clock);
    const firstLeg = plan.legs[0];

    const v: Vehicle = {
      id: req.id,
      kind: req.kind,
      line: firstLeg?.line ?? req.line,
      origin: req.origin,
      destination: req.destination,
      path: plan.path,
      leg: 1,
      departedAt: departAt,
      arriveAt: departAt + dwell + (firstLeg ? firstLeg.minutes : 0),
      load: req.load ?? 0,
      capacity: req.capacity ?? (req.kind === "BUS" ? 68 : 420),
      dwellMinutes: dwell,
      status: "EN ROUTE",
      delaysAbsorbed: 0,
    };

    this.vehicles.set(v.id, v);
    this.heap.push(v);
    this.log("ENQUEUE", v, `${v.id} queued · ${nameOf(this.graph, v.origin)} → ${nameOf(this.graph, v.destination)} · ETA ${formatClock(v.arriveAt)}`);
    return v;
  }

  /**
   * Advance the world clock and process every arrival that falls due.
   * Returns the events produced (empty array when the schedule is idle).
   */
  tick(deltaMinutes: number): DispatchEvent[] {
    // A negative delta rewinds the service clock (midnight wrap) without
    // processing any arrival; zero is a no-op. Non-finite input is rejected
    // so the clock can never be corrupted into NaN.
    if (!Number.isFinite(deltaMinutes)) return [];
    this._clock = Math.max(0, this._clock + deltaMinutes);
    if (deltaMinutes <= 0) return [];
    const produced: DispatchEvent[] = [];

    // Guard: a corrupt/absent schedule must not spin forever.
    let guard = 0;
    while (!this.heap.isEmpty() && this.heap.peek()!.arriveAt <= this._clock) {
      if (guard++ > 5000) break;
      const v = this.heap.pop()!;
      produced.push(...this.processArrival(v));
    }
    this.events.push(...produced);
    return produced;
  }

  private processArrival(v: Vehicle): DispatchEvent[] {
    const out: DispatchEvent[] = [];
    const here = v.path[v.leg];
    v.status = "BOARDING";
    out.push(this.log("ARRIVE", v, `${v.id} arrived ${nameOf(this.graph, here)} @ ${formatClock(this._clock)} · load ${v.load}/${v.capacity}`, here));

    if (v.leg >= v.path.length - 1) {
      v.status = "TERMINATED";
      this.vehicles.delete(v.id);
      this.done.push({ ...v });
      out.push(this.log("TERMINATE", v, `${v.id} terminated at ${nameOf(this.graph, here)} — run complete`, here));
      return out;
    }

    // Advance to the next leg. The edge may have vanished (incident removed a
    // route) or become wildly slower — re-plan from the current platform.
    v.leg += 1;
    const from = v.path[v.leg - 1];
    const to = v.path[v.leg];
    const edge = this.graph.bestEdge(from, to);

    if (!edge) {
      // The route vanished *or a station on the path was decommissioned* —
      // dijkstra() would throw on an unknown endpoint, so terminate politely.
      if (!this.graph.hasStation(from) || !this.graph.hasStation(v.destination)) {
        v.status = "TERMINATED";
        this.vehicles.delete(v.id);
        this.done.push({ ...v });
        out.push(this.log("HOLD", v, `${v.id} held at ${nameOf(this.graph, from)} — a stop on its route was removed from the network`, from));
        return out;
      }
      const plan = dijkstra(this.graph, from, v.destination);
      if (!plan.found) {
        v.status = "TERMINATED";
        this.vehicles.delete(v.id);
        this.done.push({ ...v });
        out.push(this.log("HOLD", v, `${v.id} held at ${nameOf(this.graph, from)} — destination became unreachable`, from));
        return out;
      }
      v.path = plan.path;
      v.leg = 1;
      out.push(this.log("REPLAN", v, `${v.id} re-planned from ${nameOf(this.graph, from)} via ${plan.path.length - 1} legs`, from));
    }

    const legEdge = this.graph.bestEdge(v.path[v.leg - 1], v.path[v.leg])!;
    const legMinutes = edgeMinutes(legEdge);
    v.delaysAbsorbed += legEdge.delay;
    v.line = legEdge.line;
    v.departedAt = this._clock + v.dwellMinutes;
    v.arriveAt = v.departedAt + legMinutes;
    v.status = "EN ROUTE";
    this.heap.push(v);
    out.push(
      this.log(
        "DEPART",
        v,
        `${v.id} departing ${nameOf(this.graph, v.path[v.leg - 1])} → ${nameOf(this.graph, v.path[v.leg])} · ${legMinutes.toFixed(1)} min${legEdge.delay > 0 ? ` (incl. ${legEdge.delay} min delay)` : ""} · ETA ${formatClock(v.arriveAt)}`,
        v.path[v.leg - 1],
      ),
    );
    return out;
  }

  /**
   * Re-plan every queued vehicle against the current (possibly congested)
   * weights. Drains the heap and rebuilds it — O(n log n) — which is what a
   * control room does the moment an incident is declared.
   */
  replanAll(): number {
    const queued = this.heap.toArray();
    this.heap.clear();
    let touched = 0;
    for (const v of queued) {
      const at = v.path[Math.max(0, v.leg - 1)];
      const stranded = !this.graph.hasStation(at) || !this.graph.hasStation(v.destination);
      if (at === v.destination || stranded) {
        v.status = "TERMINATED";
        this.vehicles.delete(v.id);
        this.done.push({ ...v });
        this.log(
          "HOLD",
          v,
          stranded
            ? `${v.id} withdrawn — ${nameOf(this.graph, at)} or ${nameOf(this.graph, v.destination)} no longer exists in the topology`
            : `${v.id} withdrawn — already at ${nameOf(this.graph, at)}`,
          at,
        );
        continue;
      }
      const plan = dijkstra(this.graph, at, v.destination);
      if (!plan.found) {
        v.status = "TERMINATED";
        this.vehicles.delete(v.id);
        this.done.push({ ...v });
        this.log("HOLD", v, `${v.id} withdrawn — ${nameOf(this.graph, v.destination)} unreachable`, at);
        continue;
      }
      if (plan.path.join() !== v.path.slice(v.leg - 1).join()) touched++;
      v.path = plan.path;
      v.leg = 1;
      const firstLeg = plan.legs[0];
      v.departedAt = Math.max(this._clock, v.departedAt);
      v.arriveAt = v.departedAt + v.dwellMinutes + (firstLeg ? firstLeg.minutes : 0);
      v.line = firstLeg?.line ?? v.line;
      this.heap.push(v);
    }
    if (touched) this.log("REPLAN", queued[0] ?? ({} as Vehicle), `${touched} vehicle(s) re-routed after weight change`);
    return touched;
  }

  withdraw(id: string): boolean {
    const v = this.vehicles.get(id);
    if (!v) return false;
    this.heap.removeWhere((x) => x.id === id);
    this.vehicles.delete(id);
    v.status = "TERMINATED";
    this.done.push({ ...v });
    this.log("HOLD", v, `${id} withdrawn from service by dispatcher`);
    return true;
  }

  /** Interpolated position of each active vehicle, for the map overlay. */
  positions(): { id: string; x: number; y: number; line: LineId; progress: number }[] {
    const out: { id: string; x: number; y: number; line: LineId; progress: number }[] = [];
    for (const v of this.heap.toArray()) {
      const a = this.graph.getStation(v.path[Math.max(0, v.leg - 1)]);
      const b = this.graph.getStation(v.path[v.leg]);
      if (!a || !b) continue;
      const span = Math.max(0.0001, v.arriveAt - v.departedAt);
      const p = Math.min(1, Math.max(0, (this._clock - v.departedAt) / span));
      out.push({ id: v.id, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, line: v.line, progress: p });
    }
    return out;
  }

  private log(kind: EventKind, v: Partial<Vehicle>, message: string, station?: StationId): DispatchEvent {
    return { clock: this._clock, kind, vehicleId: v.id ?? "—", line: v.line ?? "SYS", station, message };
  }

  snapshot(eventLimit = 60): DispatchSnapshot {
    const heap = this.heap.toArray();
    return {
      clock: this._clock,
      heap,
      next: this.heap.peek(),
      events: this.events.slice(-eventLimit).reverse(),
      stats: { ...this.heap.stats },
      recentOps: this.heap.recentOps.map((o) => ({ index: o.index, kind: o.kind, seq: o.seq, other: o.other })),
      completed: this.done.length,
      active: heap.length,
      terminated: [...this.done].reverse(),
      empty: heap.length === 0,
    };
  }

  get allVehicles(): Vehicle[] {
    return [...this.heap.toArray()].sort((a, b) => a.arriveAt - b.arriveAt);
  }

  /** Used by the CLI `heap` command to render the tree level by level. */
  levels(): Vehicle[][] {
    const arr = this.heap.toArray();
    const out: Vehicle[][] = [];
    let start = 0;
    let width = 1;
    while (start < arr.length) {
      out.push(arr.slice(start, start + width));
      start += width;
      width *= 2;
    }
    return out;
  }

  applyIncident(routeId: RouteId, minutes: number): void {
    this.graph.setDelay(routeId, minutes);
  }
}

function nameOf(graph: TransitGraph, id?: StationId): string {
  if (!id) return "?";
  return graph.getStation(id)?.name ?? id;
}
