/**
 * Graph.ts — FEATURE 1: Network Topology.
 *
 * A weighted, undirected *multigraph* stored as an adjacency list:
 *
 *     Map<StationId, Edge[]>        // O(1) node lookup, O(deg) neighbour scan
 *
 * An adjacency list is chosen over an adjacency matrix because a metro
 * network is sparse: |E| ≈ 2·|V|. A matrix would cost O(V²) memory (≈ 196
 * cells for 14 stations, 10⁶ for a 1000-station city) while the list costs
 * O(V + E). Parallel edges are legal — two lines may share the same pair of
 * stations (e.g. the Green arc and the Amber express both serve Market Cross
 * → Central Terminal) and each keeps its own weight.
 *
 * All mutation goes through validation, so the CLI can surface typed errors
 * instead of crashing.
 */

import { edgeMinutes } from "./types";
import type { Edge, LineId, Route, RouteId, Station, StationId, TransitLine } from "./types";

export type GraphErrorCode =
  | "DUPLICATE_STATION"
  | "DUPLICATE_ID"
  | "DUPLICATE_VEHICLE"
  | "UNKNOWN_STATION"
  | "UNKNOWN_ROUTE"
  | "SELF_LOOP"
  | "DUPLICATE_ROUTE"
  | "UNREACHABLE"
  | "NEGATIVE_WEIGHT"
  | "BAD_NUMBER"
  | "BAD_COORDS";

export class GraphError extends Error {
  constructor(
    public readonly code: GraphErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

export class TransitGraph {
  /** THE adjacency list. station -> directed half-edges. */
  private readonly adjacency = new Map<StationId, Edge[]>();
  private readonly stations = new Map<StationId, Station>();
  private readonly routes = new Map<RouteId, Route>();
  readonly lines: TransitLine[];

  constructor(lines: TransitLine[] = [], stations: Station[] = [], routes: Route[] = []) {
    this.lines = lines;
    stations.forEach((s) => this.addStation(s));
    routes.forEach((r) => this.addRoute(r));
  }

  // ---------------------------------------------------------------- nodes

  addStation(s: Station): void {
    if (this.stations.has(s.id)) {
      throw new GraphError("DUPLICATE_STATION", `Station "${s.id}" already exists in the topology.`);
    }
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || s.x < 0 || s.y < 0) {
      throw new GraphError("BAD_COORDS", `Station "${s.id}" has invalid canvas coordinates.`);
    }
    this.stations.set(s.id, { ...s });
    this.adjacency.set(s.id, []); // isolated stations still get an (empty) bucket
  }

  removeStation(id: StationId): void {
    if (!this.stations.has(id)) throw new GraphError("UNKNOWN_STATION", `No station "${id}".`);
    for (const e of [...this.adjacency.get(id)!]) this.removeRoute(e.routeId);
    this.adjacency.delete(id);
    this.stations.delete(id);
  }

  hasStation(id: StationId): boolean {
    return this.stations.has(id);
  }

  getStation(id: StationId): Station | undefined {
    return this.stations.get(id);
  }

  stationList(): Station[] {
    return [...this.stations.values()];
  }

  stationIds(): StationId[] {
    return [...this.stations.keys()];
  }

  get order(): number {
    return this.stations.size;
  }

  /** Stations with no incident edges — the classic disconnected edge case. */
  isolatedStations(): StationId[] {
    return this.stationIds().filter((id) => this.adjacency.get(id)!.length === 0);
  }

  // --------------------------------------------------------------- edges

  addRoute(r: Route): void {
    if (!this.stations.has(r.from)) throw new GraphError("UNKNOWN_STATION", `Unknown origin "${r.from}".`);
    if (!this.stations.has(r.to)) throw new GraphError("UNKNOWN_STATION", `Unknown destination "${r.to}".`);
    if (r.from === r.to) throw new GraphError("SELF_LOOP", `Self-loop at "${r.from}" is not routable.`);
    if (this.routes.has(r.id)) throw new GraphError("DUPLICATE_ID", `Route id "${r.id}" is already in use.`);
    // Relational guards alone (x <= 0) are false for NaN, so every numeric
    // field is checked for finiteness first — a NaN weight would otherwise
    // silently poison every later shortest-path query.
    if (!Number.isFinite(r.baseMinutes) || r.baseMinutes <= 0)
      throw new GraphError("BAD_NUMBER", `baseMinutes must be a finite number > 0 (got ${r.baseMinutes}).`);
    if (!Number.isFinite(r.distanceKm) || r.distanceKm <= 0)
      throw new GraphError("BAD_NUMBER", `distanceKm must be a finite number > 0 (got ${r.distanceKm} km).`);
    if (!Number.isFinite(r.incidentDelay) || r.incidentDelay < 0)
      throw new GraphError("BAD_NUMBER", `incidentDelay must be a finite number ≥ 0 (got ${r.incidentDelay}).`);
    if (this.duplicateOf(r)) {
      throw new GraphError("DUPLICATE_ROUTE", `Line ${r.line} already connects ${r.from}–${r.to}.`);
    }

    const route: Route = { ...r, incidentDelay: Math.max(0, r.incidentDelay) };
    this.routes.set(route.id, route);

    // Undirected: push one directed half-edge into each bucket.
    this.adjacency.get(route.from)!.push(this.toEdge(route, route.to));
    this.adjacency.get(route.to)!.push(this.toEdge(route, route.from));

    for (const end of [route.from, route.to]) {
      const st = this.stations.get(end)!;
      if (!st.lines.includes(route.line)) this.stations.set(end, { ...st, lines: [...st.lines, route.line] });
    }
  }

  removeRoute(id: RouteId): void {
    const r = this.routes.get(id);
    if (!r) throw new GraphError("UNKNOWN_ROUTE", `No route "${id}".`);
    for (const end of [r.from, r.to]) {
      const bucket = this.adjacency.get(end);
      if (bucket) this.adjacency.set(end, bucket.filter((e) => e.routeId !== id));
    }
    this.routes.delete(id);
  }

  private duplicateOf(r: Route): boolean {
    return [...this.routes.values()].some(
      (x) =>
        x.line === r.line &&
        ((x.from === r.from && x.to === r.to) || (x.from === r.to && x.to === r.from)),
    );
  }

  private toEdge(r: Route, to: StationId): Edge {
    return {
      to,
      routeId: r.id,
      line: r.line,
      distanceKm: r.distanceKm,
      baseMinutes: r.baseMinutes,
      delay: r.incidentDelay,
    };
  }

  /**
   * Dynamic weight mutation. O(V + E): we rewrite both half-edges in place so
   * every future Dijkstra run sees the new congestion cost immediately.
   */
  setDelay(id: RouteId, minutes: number): void {
    const r = this.routes.get(id);
    if (!r) throw new GraphError("UNKNOWN_ROUTE", `No route "${id}".`);
    if (!Number.isFinite(minutes) || minutes < 0)
      throw new GraphError("BAD_NUMBER", `Delay must be a finite number ≥ 0 (got ${minutes}).`);
    r.incidentDelay = minutes;
    for (const end of [r.from, r.to]) {
      for (const e of this.adjacency.get(end)!) {
        if (e.routeId === id) e.delay = minutes;
      }
    }
  }

  /** Neighbours of a node. Unknown nodes yield [] rather than throwing (safe for probes). */
  neighbors(id: StationId): Edge[] {
    return this.adjacency.get(id) ?? [];
  }

  degree(id: StationId): number {
    return this.neighbors(id).length;
  }

  routeList(): Route[] {
    return [...this.routes.values()];
  }

  getRoute(id: RouteId): Route | undefined {
    return this.routes.get(id);
  }

  get size(): number {
    return this.routes.size;
  }

  /** Cheapest parallel edge between two adjacent stations (used by the dispatch engine). */
  bestEdge(a: StationId, b: StationId): Edge | undefined {
    return this.neighbors(a)
      .filter((e) => e.to === b)
      .sort((p, q) => edgeMinutes(p) - edgeMinutes(q))[0];
  }

  /** Total network delay currently injected by incidents, in minutes. */
  totalDelay(): number {
    return this.routeList().reduce((sum, r) => sum + r.incidentDelay, 0);
  }

  // ------------------------------------------------------- connectivity

  /** Breadth-first reachability — used to explain *why* a plan failed. */
  reachableFrom(source: StationId): Set<StationId> {
    const seen = new Set<StationId>();
    if (!this.hasStation(source)) return seen;
    const queue: StationId[] = [source];
    seen.add(source);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of this.neighbors(cur)) {
        if (!seen.has(e.to)) {
          seen.add(e.to);
          queue.push(e.to);
        }
      }
    }
    return seen;
  }

  isConnected(a: StationId, b: StationId): boolean {
    return this.reachableFrom(a).has(b);
  }

  /** All connected components, e.g. [[CEN, CIV...], [OLD]]. */
  components(): StationId[][] {
    const seen = new Set<StationId>();
    const out: StationId[][] = [];
    for (const id of this.stationIds()) {
      if (seen.has(id)) continue;
      const comp = this.reachableFrom(id);
      comp.forEach((c) => seen.add(c));
      out.push([...comp]);
    }
    return out;
  }
}

/** Build a fresh graph from plain data (React keeps the source arrays immutable). */
export function buildGraph(lines: TransitLine[], stations: Station[], routes: Route[]): TransitGraph {
  return new TransitGraph(lines, stations, routes);
}

export function lineColor(graph: TransitGraph, line: LineId, fallback = "#7d95a3"): string {
  return graph.lines.find((l) => l.id === line)?.color ?? fallback;
}
