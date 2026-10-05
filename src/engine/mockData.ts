/**
 * mockData.ts — the demonstration dataset.
 *
 * 14 stations, 4 colour-coded lines, 22 bidirectional segments. Note the
 * deliberate edge cases baked into the fixture:
 *
 *   • OLD (Old Harbour Ferry) has NO incident edges  → isolated node, proves
 *     the disconnected-component path through Dijkstra and BFS.
 *   • G5 (Harbour Quay → Market Cross) carries an 11-minute single-track
 *     working delay → the shortest path is *not* the fewest hops.
 *   • MKT→CEN exists twice (Green G2 and Amber A5) → parallel-edge multigraph.
 */

import type { AssemblyInput, ExpressLine, CorridorStop } from "./AssemblyLine";
import type { Route, ScheduleRequestLike, Station } from "./fixtureTypes";
import type { TransitLine } from "./types";
import type { VehicleKind } from "./DispatchEngine";

export const LINES: TransitLine[] = [
  { id: "RED", name: "North–South Line", color: "#ef4d55", mode: "METRO" },
  { id: "BLUE", name: "Harbour Line", color: "#3d8bfd", mode: "METRO" },
  { id: "GREEN", name: "Riverside Arc", color: "#2fbe7c", mode: "TRAM" },
  { id: "AMBER", name: "Crosstown Express", color: "#f2a41f", mode: "EXPRESS" },
];

export const LINE_BY_ID: Record<string, TransitLine> = Object.fromEntries(LINES.map((l) => [l.id, l]));

export const STATIONS: Station[] = [
  { id: "NGT", name: "Northgate", x: 150, y: 78, zone: 3, lines: ["RED"] },
  { id: "UNV", name: "University Heights", x: 302, y: 120, zone: 2, lines: ["RED", "GREEN"] },
  { id: "CIV", name: "Civic Center", x: 452, y: 176, zone: 1, lines: ["RED", "BLUE", "AMBER"], hub: true },
  { id: "HQY", name: "Harbour Quay", x: 645, y: 104, zone: 2, lines: ["BLUE", "GREEN"] },
  { id: "MKT", name: "Market Cross", x: 298, y: 288, zone: 1, lines: ["GREEN", "AMBER"] },
  { id: "CEN", name: "Central Terminal", x: 486, y: 318, zone: 1, lines: ["RED", "BLUE", "GREEN", "AMBER"], hub: true },
  { id: "STK", name: "Stockyard Junction", x: 668, y: 248, zone: 2, lines: ["BLUE", "AMBER"], hub: true },
  { id: "APT", name: "Airport Link", x: 878, y: 152, zone: 3, lines: ["AMBER"], hub: true },
  { id: "PRT", name: "Portside", x: 772, y: 372, zone: 3, lines: ["BLUE", "AMBER"] },
  { id: "RVP", name: "Riverside Park", x: 548, y: 432, zone: 2, lines: ["GREEN"] },
  { id: "STH", name: "Southbank", x: 330, y: 452, zone: 2, lines: ["RED", "GREEN"] },
  { id: "INB", name: "Industrial Belt", x: 163, y: 352, zone: 3, lines: ["RED"] },
  { id: "OBS", name: "Observatory Hill", x: 852, y: 486, zone: 3, lines: ["BLUE"] },
  // ⚠ isolated on purpose — no route references it.
  { id: "OLD", name: "Old Harbour Ferry", x: 92, y: 508, zone: 4, lines: [] },
];

export const ROUTES: Route[] = [
  // RED — North/South trunk
  { id: "R1", from: "NGT", to: "UNV", line: "RED", distanceKm: 3.2, baseMinutes: 5, incidentDelay: 0 },
  { id: "R2", from: "UNV", to: "CIV", line: "RED", distanceKm: 2.8, baseMinutes: 4, incidentDelay: 0 },
  { id: "R3", from: "CIV", to: "CEN", line: "RED", distanceKm: 3.6, baseMinutes: 6, incidentDelay: 7, note: "Signal fault — Civic Center" },
  { id: "R4", from: "CEN", to: "STH", line: "RED", distanceKm: 4.2, baseMinutes: 7, incidentDelay: 0 },
  { id: "R5", from: "STH", to: "INB", line: "RED", distanceKm: 3.9, baseMinutes: 6, incidentDelay: 0 },
  // BLUE — Harbour trunk
  { id: "B1", from: "HQY", to: "CIV", line: "BLUE", distanceKm: 4.6, baseMinutes: 7, incidentDelay: 0 },
  { id: "B2", from: "CIV", to: "CEN", line: "BLUE", distanceKm: 2.4, baseMinutes: 4, incidentDelay: 0 },
  { id: "B3", from: "CEN", to: "STK", line: "BLUE", distanceKm: 3.1, baseMinutes: 5, incidentDelay: 4, note: "Congestion — level crossing" },
  { id: "B4", from: "STK", to: "PRT", line: "BLUE", distanceKm: 4.4, baseMinutes: 7, incidentDelay: 0 },
  { id: "B5", from: "PRT", to: "OBS", line: "BLUE", distanceKm: 2.9, baseMinutes: 5, incidentDelay: 0 },
  // GREEN — Riverside arc
  { id: "G1", from: "UNV", to: "MKT", line: "GREEN", distanceKm: 2.2, baseMinutes: 4, incidentDelay: 0 },
  { id: "G2", from: "MKT", to: "CEN", line: "GREEN", distanceKm: 2.6, baseMinutes: 4, incidentDelay: 0 },
  { id: "G3", from: "CEN", to: "RVP", line: "GREEN", distanceKm: 1.9, baseMinutes: 3, incidentDelay: 0 },
  { id: "G4", from: "RVP", to: "STH", line: "GREEN", distanceKm: 3.3, baseMinutes: 5, incidentDelay: 0 },
  { id: "G5", from: "HQY", to: "MKT", line: "GREEN", distanceKm: 5.2, baseMinutes: 9, incidentDelay: 11, note: "Single-track working" },
  { id: "G6", from: "RVP", to: "PRT", line: "GREEN", distanceKm: 4.8, baseMinutes: 8, incidentDelay: 0 },
  // AMBER — Crosstown express
  { id: "A1", from: "CIV", to: "MKT", line: "AMBER", distanceKm: 2.0, baseMinutes: 3, incidentDelay: 0 },
  { id: "A2", from: "CIV", to: "STK", line: "AMBER", distanceKm: 5.8, baseMinutes: 8, incidentDelay: 2, note: "Headway restriction" },
  { id: "A3", from: "STK", to: "APT", line: "AMBER", distanceKm: 6.4, baseMinutes: 9, incidentDelay: 0 },
  { id: "A4", from: "APT", to: "PRT", line: "AMBER", distanceKm: 4.0, baseMinutes: 8, incidentDelay: 0 },
  { id: "A5", from: "MKT", to: "CEN", line: "AMBER", distanceKm: 2.6, baseMinutes: 3, incidentDelay: 0 },
  { id: "A6", from: "PRT", to: "STK", line: "AMBER", distanceKm: 3.4, baseMinutes: 5, incidentDelay: 0 },
];

/** Curated incident presets for the topology console. */
export const INCIDENT_PRESETS = [
  { label: "Signal fault", minutes: 7 },
  { label: "Peak congestion", minutes: 12 },
  { label: "Single-track working", minutes: 18 },
  { label: "Minor dwell overrun", minutes: 3 },
  { label: "Cleared", minutes: 0 },
];

export interface SeedVehicle extends Omit<ScheduleRequestLike, "kind"> {
  kind: VehicleKind;
}

/** Rolling stock on the board at service start (06:00). */
export const SEED_VEHICLES: SeedVehicle[] = [
  { id: "M-101", kind: "METRO", line: "RED", origin: "NGT", destination: "STH", departAt: 360, load: 214 },
  { id: "M-114", kind: "METRO", line: "BLUE", origin: "HQY", destination: "PRT", departAt: 364, load: 188 },
  { id: "E-207", kind: "EXPRESS", line: "AMBER", origin: "CIV", destination: "APT", departAt: 362, load: 301 },
  { id: "T-330", kind: "TRAM", line: "GREEN", origin: "UNV", destination: "RVP", departAt: 367, load: 62 },
  { id: "B-455", kind: "BUS", line: "RED", origin: "INB", destination: "CEN", departAt: 363, load: 31 },
  { id: "M-122", kind: "METRO", line: "RED", origin: "STH", destination: "NGT", departAt: 371, load: 143 },
  { id: "E-212", kind: "EXPRESS", line: "AMBER", origin: "MKT", destination: "PRT", departAt: 375, load: 268 },
  { id: "B-462", kind: "BUS", line: "BLUE", origin: "OBS", destination: "CIV", departAt: 369, load: 18 },
  { id: "T-338", kind: "TRAM", line: "GREEN", origin: "HQY", destination: "STH", departAt: 380, load: 47 },
  { id: "M-133", kind: "METRO", line: "BLUE", origin: "PRT", destination: "CEN", departAt: 386, load: 176 },
];

/** Random-but-deterministic spare units the CLI can inject with `dispatch seed`. */
export const SPARE_POOL: { origin: string; destination: string }[] = [
  { origin: "NGT", destination: "APT" },
  { origin: "INB", destination: "OBS" },
  { origin: "MKT", destination: "HQY" },
  { origin: "STH", destination: "STK" },
  { origin: "UNV", destination: "PRT" },
  { origin: "CIV", destination: "RVP" },
];

// ---------------------------------------------------------------------------
// FEATURE 4 fixture — two PARALLEL express services along the Eastern Corridor
// ---------------------------------------------------------------------------

export const CORRIDOR_STOPS: CorridorStop[] = [
  { id: "CIV", name: "Civic Center" },
  { id: "CEN", name: "Central Terminal" },
  { id: "STK", name: "Stockyard Jct" },
  { id: "PRT", name: "Portside" },
  { id: "OBS", name: "Observatory Hill" },
  { id: "APT", name: "Airport Link" },
];

export const EXPRESS_LINES: [ExpressLine, ExpressLine] = [
  { id: "AMBER", name: "Amber Crosstown Express", color: "#f2a41f" },
  { id: "BLUE", name: "Blue Harbour Express", color: "#3d8bfd" },
];

/**
 * ride[i][j] — minutes on line i from corridor stop j to stop j+1
 *              (final column = arrival/egress at the terminus).
 * Story: the Amber Express owns the CBD tunnel (fast for stops 0–2) but runs
 * on-street through the harbour district (very slow for stops 3–4). The Blue
 * Harbour Express is the mirror image: slow in the core, fast on its dedicated
 * coastal viaduct. Transfer penalties are cheap at the big interchanges
 * (Stockyard, Portside) and expensive at street-level stops.
 */
export const CORRIDOR_RIDE: number[][] = [
  [3, 4, 5, 14, 15, 3], // AMBER
  [9, 8, 6, 5, 4, 3], //  BLUE
];

export const CORRIDOR_TRANSFER: number[][] = [
  [1, 6, 2, 6, 2, 0], // leaving AMBER after stop j
  [1, 6, 2, 6, 2, 0], // leaving BLUE  after stop j
];

export const CORRIDOR_ENTRY: number[] = [2, 5];
export const CORRIDOR_EXIT: number[] = [5, 1];

export function corridorFixture(): AssemblyInput {
  return {
    lines: EXPRESS_LINES,
    stops: CORRIDOR_STOPS,
    ride: CORRIDOR_RIDE.map((r) => [...r]),
    transfer: CORRIDOR_TRANSFER.map((t) => [...t]),
    entry: [...CORRIDOR_ENTRY],
    exit: [...CORRIDOR_EXIT],
  };
}

/** Live-editable copy so the console can mutate costs without touching the fixture. */
export function cloneCorridor(input: AssemblyInput): AssemblyInput {
  return {
    lines: input.lines,
    stops: input.stops,
    ride: input.ride.map((r) => [...r]),
    transfer: input.transfer.map((t) => [...t]),
    entry: [...input.entry],
    exit: [...input.exit],
  };
}

export const CORRIDOR_STORY: Record<string, string> = {
  AMBER: "Deep-bore CBD tunnel → surface running through the harbour district.",
  BLUE: "Street-level in the core → dedicated coastal viaduct east of Portside.",
};
