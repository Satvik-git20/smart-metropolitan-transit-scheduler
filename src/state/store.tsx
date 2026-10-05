import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { TransitGraph, GraphError } from "@/engine/Graph";
import { DispatchEngine } from "@/engine/DispatchEngine";
import type { DispatchSnapshot, ScheduleRequest, Vehicle, VehicleKind } from "@/engine/DispatchEngine";
import { dijkstra } from "@/engine/Dijkstra";
import type { DijkstraResult } from "@/engine/Dijkstra";
import { solveAssemblyLine } from "@/engine/AssemblyLine";
import type { AssemblyInput, AssemblyResult } from "@/engine/AssemblyLine";
import {
  corridorFixture,
  LINES,
  ROUTES,
  SEED_VEHICLES,
  STATIONS,
} from "@/engine/mockData";
import type { Route, Station, StationId, TransitLine } from "@/engine/types";

export interface Toast {
  id: number;
  tone: "ok" | "warn" | "err";
  text: string;
}

interface TransitContextValue {
  lines: TransitLine[];
  stations: Station[];
  routes: Route[];
  graph: TransitGraph;
  addStation: (s: Omit<Station, "lines">) => void;
  addRoute: (r: Omit<Route, "incidentDelay"> & { incidentDelay?: number }) => void;
  removeRoute: (id: string) => void;
  removeStation: (id: string) => void;
  setDelay: (routeId: string, minutes: number) => void;
  clearDelays: () => number;
  resetNetwork: () => void;

  engine: DispatchEngine;
  snap: DispatchSnapshot;
  playing: boolean;
  speed: number;
  setPlaying: (v: boolean) => void;
  setSpeed: (v: number) => void;
  stepClock: (minutes: number) => void;
  dispatchVehicle: (req: ScheduleRequest) => Vehicle;
  withdrawVehicle: (id: string) => void;
  replanFleet: () => number;
  resetFleet: () => void;
  refresh: () => void;

  source: StationId;
  target: StationId;
  setSource: (id: StationId) => void;
  setTarget: (id: StationId) => void;
  plan: DijkstraResult | null;
  planError: string | null;

  corridor: AssemblyInput;
  setCorridor: (updater: (c: AssemblyInput) => AssemblyInput) => void;
  corridorResult: AssemblyResult | null;
  corridorError: string | null;

  toasts: Toast[];
  notify: (tone: Toast["tone"], text: string) => void;
}

const TransitContext = createContext<TransitContextValue | null>(null);

function makeGraph(lines: TransitLine[], stations: Station[], routes: Route[]): TransitGraph {
  return new TransitGraph(lines, stations, routes);
}

export function TransitProvider({ children }: { children: ReactNode }) {
  const [lines] = useState<TransitLine[]>(LINES);
  const [stations, setStations] = useState<Station[]>(STATIONS);
  const [routes, setRoutes] = useState<Route[]>(ROUTES);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(1);

  const graph = useMemo(() => makeGraph(lines, stations, routes), [lines, stations, routes]);

  const [source, setSource] = useState<StationId>("NGT");
  const [target, setTarget] = useState<StationId>("APT");

  // ---------------------------------------------------------------- engine
  const engineRef = useRef<DispatchEngine | null>(null);
  if (!engineRef.current) {
    const engine = new DispatchEngine(makeGraph(lines, STATIONS, ROUTES), 6 * 60);
    for (const v of SEED_VEHICLES) {
      try {
        engine.schedule(v as ScheduleRequest);
      } catch {
        /* fixture is validated at build time; ignore defensive failures */
      }
    }
    engineRef.current = engine;
  }
  const engine = engineRef.current;

  const replenishSeq = useRef(0);
  const vehicleSeq = useRef(500);
  const [snap, setSnap] = useState<DispatchSnapshot>(() => engine.snapshot());
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);

  const refresh = useCallback(() => setSnap(engine.snapshot()), [engine]);

  // Keep the engine pointed at the freshly-built graph whenever the topology
  // or its dynamic weights change.
  useEffect(() => {
    engine.attachGraph(graph);
    refresh();
  }, [engine, graph, refresh]);

  /**
   * Keep the board populated: when the queue drains below four units, inject
   * the next service from the seed pattern with a fresh id. Without this the
   * demonstration would converge on the (valid but boring) empty-schedule state.
   */
  const replenish = useCallback(() => {
    let active = engine.snapshot().active;
    let guard = 0;
    while (active < 6 && guard++ < 6) {
      const seed = SEED_VEHICLES[replenishSeq.current++ % SEED_VEHICLES.length];
      try {
        engine.schedule({ ...seed, id: `${seed.kind[0]}-${vehicleSeq.current++}`, departAt: engine.clock + 1 + guard } as ScheduleRequest);
        active++;
      } catch {
        break; // destination became unreachable — leave the board short rather than spin
      }
    }
  }, [engine]);

  // Simulation loop: 1 wall-clock second == `speed` service minutes.
  useEffect(() => {
    if (!playing) return;
    const handle = window.setInterval(() => {
      engine.tick(1);
      replenish();
      setSnap(engine.snapshot());
    }, Math.max(120, 1000 / speed));
    return () => window.clearInterval(handle);
  }, [engine, playing, speed, replenish]);

  // Clock wraps at midnight so the demo can run indefinitely. rewind()
  // shifts every queued vehicle's timestamps along with the clock so heap
  // keys and service time stay consistent.
  useEffect(() => {
    if (snap.clock > 24 * 60 + 360) {
      engine.rewind(24 * 60);
      setSnap(engine.snapshot());
    }
  }, [engine, snap.clock]);

  const notify = useCallback((tone: Toast["tone"], text: string) => {
    const id = toastSeq.current++;
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  // ------------------------------------------------------------- topology
  const addStation = useCallback(
    (s: Omit<Station, "lines">) => {
      if (!/^[A-Z]{2,5}$/.test(s.id)) throw new Error(`Station code must be 2–5 uppercase letters (got "${s.id}").`);
      if (stations.some((p) => p.id === s.id)) throw new GraphError("DUPLICATE_STATION", `Station "${s.id}" already exists in the topology.`);
      if (!s.name.trim()) throw new Error("Station name cannot be empty.");
      setStations((prev) => [...prev, { ...s, id: s.id.toUpperCase(), lines: [] }]);
      notify("ok", `Station ${s.id.toUpperCase()} · ${s.name} added — adjacency bucket created (degree 0).`);
    },
    [stations, notify],
  );

  const addRoute = useCallback(
    (r: Omit<Route, "incidentDelay"> & { incidentDelay?: number }) => {
      const probe = makeGraph(lines, stations, routes);
      probe.addRoute({ ...r, incidentDelay: r.incidentDelay ?? 0 }); // throws on any invariant breach
      setRoutes((prev) => [...prev, { ...r, incidentDelay: r.incidentDelay ?? 0 }]);
      notify("ok", `Route ${r.id} · ${r.from}–${r.to} opened on line ${r.line} (${r.baseMinutes} min / ${r.distanceKm} km).`);
    },
    [lines, stations, routes, notify],
  );

  const removeRoute = useCallback(
    (id: string) => {
      setRoutes((prev) => prev.filter((r) => r.id !== id));
      notify("warn", `Route ${id} closed.`);
    },
    [notify],
  );

  const removeStation = useCallback(
    (id: string) => {
      setStations((prev) => prev.filter((s) => s.id !== id));
      setRoutes((prev) => prev.filter((r) => r.from !== id && r.to !== id));
      notify("warn", `Station ${id} decommissioned with its incident edges.`);
    },
    [notify],
  );

  const setDelay = useCallback(
    (routeId: string, minutes: number) => {
      setRoutes((prev) => prev.map((r) => (r.id === routeId ? { ...r, incidentDelay: Math.max(0, minutes) } : r)));
      notify(minutes > 0 ? "warn" : "ok", `Weight update · ${routeId} delay := ${Math.max(0, minutes)} min.`);
    },
    [notify],
  );

  const clearDelays = useCallback(() => {
    const n = routes.filter((r) => r.incidentDelay > 0).length;
    setRoutes((prev) => prev.map((r) => (r.incidentDelay ? { ...r, incidentDelay: 0, note: undefined } : r)));
    notify("ok", `${n} incident(s) cleared — network back to free-flow weights.`);
    return n;
  }, [routes, notify]);

  const resetNetwork = useCallback(() => {
    setStations(STATIONS);
    setRoutes(ROUTES);
    notify("ok", "Topology restored to the reference fixture.");
  }, [notify]);

  // ------------------------------------------------------------- dispatch
  const dispatchVehicle = useCallback(
    (req: ScheduleRequest) => {
      const v = engine.schedule(req);
      setSnap(engine.snapshot());
      notify("ok", `${v.id} enqueued · ETA ${v.path[v.leg]} — heap size ${engine.snapshot().active}.`);
      return v;
    },
    [engine, notify],
  );

  const withdrawVehicle = useCallback(
    (id: string) => {
      engine.withdraw(id);
      setSnap(engine.snapshot());
      notify("warn", `${id} withdrawn from service.`);
    },
    [engine, notify],
  );

  const replanFleet = useCallback(() => {
    const touched = engine.replanAll();
    setSnap(engine.snapshot());
    notify("ok", `Fleet re-planned · ${touched} vehicle(s) re-routed around current weights.`);
    return touched;
  }, [engine, notify]);

  const resetFleet = useCallback(() => {
    engine.reset(6 * 60);
    for (const v of SEED_VEHICLES) {
      try {
        engine.schedule(v as ScheduleRequest);
      } catch {
        /* ignore */
      }
    }
    setSnap(engine.snapshot());
    notify("ok", "Dispatch board reset to the 06:00 service pattern.");
  }, [engine, notify]);

  const stepClock = useCallback(
    (minutes: number) => {
      engine.tick(minutes);
      setSnap(engine.snapshot());
    },
    [engine],
  );

  // -------------------------------------------------------------- planner
  const planResult = useMemo(() => {
    try {
      return { ok: true as const, result: dijkstra(graph, source, target) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Unable to plan journey." };
    }
  }, [graph, source, target]);
  const plan = planResult.ok ? planResult.result : null;
  const planError = planResult.ok ? null : planResult.error;

  // ------------------------------------------------------------- corridor
  const [corridor, setCorridorRaw] = useState<AssemblyInput>(corridorFixture);
  const setCorridor = useCallback((updater: (c: AssemblyInput) => AssemblyInput) => {
    setCorridorRaw((prev) => updater(prev));
  }, []);
  const corridorResult = useMemo<AssemblyResult | null>(() => {
    try {
      return solveAssemblyLine(corridor);
    } catch {
      return null;
    }
  }, [corridor]);
  const corridorError = corridorResult ? null : "Corridor matrix is malformed — check dimensions and non-negative costs.";

  const value: TransitContextValue = {
    lines,
    stations,
    routes,
    graph,
    addStation,
    addRoute,
    removeRoute,
    removeStation,
    setDelay,
    clearDelays,
    resetNetwork,
    engine,
    snap,
    playing,
    speed,
    setPlaying,
    setSpeed,
    stepClock,
    dispatchVehicle,
    withdrawVehicle,
    replanFleet,
    resetFleet,
    refresh,
    source,
    target,
    setSource,
    setTarget,
    plan,
    planError,
    corridor,
    setCorridor,
    corridorResult,
    corridorError,
    toasts,
    notify,
  };

  return <TransitContext.Provider value={value}>{children}</TransitContext.Provider>;
}

export function useTransit(): TransitContextValue {
  const ctx = useContext(TransitContext);
  if (!ctx) throw new Error("useTransit must be used inside <TransitProvider>");
  return ctx;
}

export type { Vehicle, VehicleKind, ScheduleRequest };
