/**
 * types.ts — shared domain vocabulary for the Smart Metropolitan Transit Scheduler.
 *
 * The engine layer (Graph / MinHeap / Dijkstra / AssemblyLine / DispatchEngine)
 * is framework-free: it imports nothing from React and can be lifted verbatim
 * into a CLI binary or ported line-for-line to Python / Java / C++.
 */

export type StationId = string;
export type LineId = string;
export type RouteId = string;

export type TransitMode = "METRO" | "TRAM" | "BUS" | "EXPRESS";

/** A passenger-facing transit line (colour-coded, as on real signage). */
export interface TransitLine {
  id: LineId;
  name: string;
  color: string;
  mode: TransitMode;
}

/** A node in the network topology. x/y are canvas units used by the map view. */
export interface Station {
  id: StationId;
  name: string;
  x: number;
  y: number;
  zone: number;
  lines: LineId[];
  hub?: boolean;
}

/**
 * An undirected edge with *dynamic* weight.
 * `baseMinutes` is the free-flow running time derived from distance & mode;
 * `incidentDelay` is mutated at runtime by the incident controller, so the
 * same topology can produce different shortest paths over time.
 */
export interface Route {
  id: RouteId;
  from: StationId;
  to: StationId;
  line: LineId;
  distanceKm: number;
  baseMinutes: number;
  incidentDelay: number;
  note?: string;
}

/** One directed half of a Route, as stored in the adjacency list. */
export interface Edge {
  to: StationId;
  routeId: RouteId;
  line: LineId;
  distanceKm: number;
  baseMinutes: number;
  delay: number;
}

/** Effective traversal cost of an edge, in minutes. Never negative. */
export function edgeMinutes(e: Edge): number {
  return Math.max(0, e.baseMinutes + e.delay);
}

/** Effective traversal cost of a route, in minutes. Never negative. */
export function routeMinutes(r: Route): number {
  return Math.max(0, r.baseMinutes + r.incidentDelay);
}

export function formatClock(totalMinutes: number): string {
  const m = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatDuration(minutes: number): string {
  if (!isFinite(minutes)) return "∞";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`;
}
