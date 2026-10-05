import { useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import type { PathLeg } from "@/engine/Dijkstra";
import type { LineId, Route, Station, StationId, TransitLine } from "@/engine/types";

export const MAP_W = 960;
export const MAP_H = 560;

export interface VehicleDot {
  id: string;
  x: number;
  y: number;
  line: LineId;
  progress: number;
}

interface Props {
  stations: Station[];
  routes: Route[];
  lines: TransitLine[];
  sourceId?: StationId;
  targetId?: StationId;
  path?: StationId[];
  legs?: PathLeg[];
  vehicles?: VehicleDot[];
  reachable?: Set<StationId>;
  selectedRoute?: string;
  onStationClick?: (id: StationId) => void;
  onRouteClick?: (id: string) => void;
  drawKey?: string | number;
  showLegend?: boolean;
  className?: string;
}

interface Geometry {
  route: Route;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  color: string;
}

export default function NetworkMap({
  stations,
  routes,
  lines,
  sourceId,
  targetId,
  path,
  legs,
  vehicles = [],
  reachable,
  selectedRoute,
  onStationClick,
  onRouteClick,
  drawKey = 0,
  showLegend = true,
  className,
}: Props) {
  const [hover, setHover] = useState<StationId | null>(null);
  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const colorOf = useMemo(() => new Map(lines.map((l) => [l.id, l.color])), [lines]);

  /** Parallel segments between the same station pair are fanned out so both stay legible. */
  const geometry = useMemo<Geometry[]>(() => {
    const groups = new Map<string, Route[]>();
    for (const r of routes) {
      const key = [r.from, r.to].sort().join("|");
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const out: Geometry[] = [];
    groups.forEach((group) => {
      group.forEach((r, i) => {
        const a = byId.get(r.from);
        const b = byId.get(r.to);
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const off = (i - (group.length - 1) / 2) * (group.length > 1 ? 11 : 0);
        const x1 = a.x + nx * off;
        const y1 = a.y + ny * off;
        const x2 = b.x + nx * off;
        const y2 = b.y + ny * off;
        out.push({ route: r, x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, color: colorOf.get(r.line) ?? "#7d95a3" });
      });
    });
    return out;
  }, [routes, byId, colorOf]);

  const pathSegments = useMemo(() => {
    if (!path || path.length < 2) return [];
    return path.slice(0, -1).map((id, i) => {
      const a = byId.get(id);
      const b = byId.get(path[i + 1]);
      const leg = legs?.[i];
      return { a, b, leg, color: leg ? (colorOf.get(leg.line) ?? "#ffc24b") : "#ffc24b" };
    });
  }, [path, legs, byId, colorOf]);

  const hovered = hover ? byId.get(hover) : undefined;
  const inPath = (id: StationId) => (path ? path.includes(id) : false);

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="block w-full" role="img" aria-label="Metropolitan network diagram">
        <defs>
          <radialGradient id="mapVignette" cx="50%" cy="42%" r="72%">
            <stop offset="0%" stopColor="#16242e" />
            <stop offset="70%" stopColor="#0b1218" />
            <stop offset="100%" stopColor="#06090c" />
          </radialGradient>
          <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="mapGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#5d8ca5" strokeOpacity="0.09" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={MAP_W} height={MAP_H} fill="url(#mapVignette)" />
        <rect width={MAP_W} height={MAP_H} fill="url(#mapGrid)" />

        {/* harbour water — gives the diagram a sense of place */}
        <path
          d="M620 560 C 700 470, 800 450, 960 430 L960 560 Z"
          fill="#0f2b34"
          opacity="0.55"
        />
        <path d="M640 560 C 715 480, 810 462, 960 445" fill="none" stroke="#2fbe7c" strokeOpacity="0.14" strokeWidth="2" />
        <text x="905" y="530" textAnchor="end" className="font-mono" fontSize="10" fill="#4d7d86" letterSpacing="3">
          HARBOUR
        </text>

        {/* ---------------------------------------------- edges */}
        <g>
          {geometry.map(({ route, x1, y1, x2, y2, color }) => {
            const dim = reachable && (!reachable.has(route.from) || !reachable.has(route.to));
            const isSel = selectedRoute === route.id;
            return (
              <g key={route.id} opacity={dim ? 0.18 : 1}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#05080b" strokeWidth={isSel ? 10 : 8} strokeLinecap="round" opacity={0.85} />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={isSel ? 5 : 4}
                  strokeLinecap="round"
                  className={cn(onRouteClick && "cursor-pointer", isSel && "marching-fast")}
                  opacity={route.incidentDelay > 0 ? 0.95 : 0.8}
                  onClick={() => onRouteClick?.(route.id)}
                >
                  <title>{`${route.id} · ${route.from}–${route.to} · ${route.distanceKm} km · ${route.baseMinutes}m + ${route.incidentDelay}m delay`}</title>
                </line>
                {route.incidentDelay > 0 && (
                  <g className="cursor-help" onClick={() => onRouteClick?.(route.id)}>
                    <circle cx={x1 + (x2 - x1) / 2} cy={y1 + (y2 - y1) / 2} r={9} fill="#0b1218" stroke="#f2a41f" strokeWidth={1.5} />
                    <circle cx={x1 + (x2 - x1) / 2} cy={y1 + (y2 - y1) / 2} r={13} fill="none" stroke="#f2a41f" strokeWidth={1} className="halo" />
                    <text x={x1 + (x2 - x1) / 2} y={y1 + (y2 - y1) / 2 + 3.5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#ffc24b" className="font-mono">
                      {route.incidentDelay}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* ------------------------------------- highlighted itinerary */}
        {pathSegments.length > 0 && (
          <g key={String(drawKey)} filter="url(#softGlow)">
            {pathSegments.map((seg, i) =>
              seg.a && seg.b ? (
                <g key={i}>
                  <line x1={seg.a.x} y1={seg.a.y} x2={seg.b.x} y2={seg.b.y} stroke="#05080b" strokeWidth={13} strokeLinecap="round" opacity={0.9} />
                  <line
                    x1={seg.a.x}
                    y1={seg.a.y}
                    x2={seg.b.x}
                    y2={seg.b.y}
                    stroke={seg.color}
                    strokeWidth={7}
                    strokeLinecap="round"
                    className="draw-path"
                    style={{ animationDelay: `${i * 90}ms` }}
                  />
                  <line
                    x1={seg.a.x}
                    y1={seg.a.y}
                    x2={seg.b.x}
                    y2={seg.b.y}
                    stroke="#ffffff"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="marching-fast"
                    opacity={0.85}
                  />
                </g>
              ) : null,
            )}
          </g>
        )}

        {/* ---------------------------------------------- vehicles */}
        <g>
          {vehicles.map((v) => (
            <g key={v.id} transform={`translate(${v.x} ${v.y})`}>
              <circle r={10} fill={colorOf.get(v.line) ?? "#ffc24b"} opacity={0.18} />
              <rect x={-6} y={-4.5} width={12} height={9} rx={2.5} fill={colorOf.get(v.line) ?? "#ffc24b"} stroke="#05080b" strokeWidth={1.2} />
              <text y={-9} textAnchor="middle" fontSize="8.5" fill="#e3ecf1" className="font-mono" opacity={0.9}>
                {v.id}
              </text>
            </g>
          ))}
        </g>

        {/* ---------------------------------------------- stations */}
        <g>
          {stations.map((s) => {
            const isolated = !routes.some((r) => r.from === s.id || r.to === s.id);
            const dim = reachable ? !reachable.has(s.id) : false;
            const onPath = inPath(s.id);
            const isSrc = sourceId === s.id;
            const isTgt = targetId === s.id;
            const isHover = hover === s.id;
            return (
              <g
                key={s.id}
                transform={`translate(${s.x} ${s.y})`}
                opacity={dim ? 0.28 : 1}
                className={cn(onStationClick && "cursor-pointer")}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover((h) => (h === s.id ? null : h))}
                onClick={() => onStationClick?.(s.id)}
              >
                {(isSrc || isTgt || isHover || s.hub) && (
                  <circle r={s.hub ? 16 : 13} fill="none" strokeWidth={1.5} className="halo" stroke={isSrc ? "#ffc24b" : isTgt ? "#2fbe7c" : "#5d8ca5"} />
                )}
                {isolated && <circle r={11} fill="none" stroke="#ef4d55" strokeWidth={1.5} strokeDasharray="3 3" />}
                <circle r={s.hub ? 8 : 5.5} fill={isSrc ? "#ffc24b" : isTgt ? "#2fbe7c" : onPath ? "#e3ecf1" : "#0b1218"} stroke={onPath || isSrc || isTgt ? "#05080b" : "#c8d7e0"} strokeWidth={isHover ? 3 : 2} className="transition-all duration-200" />
                {s.hub && <circle r={2.6} fill="#05080b" />}
                <text
                  x={s.x > MAP_W - 190 ? -14 : 14}
                  y={4}
                  textAnchor={s.x > MAP_W - 190 ? "end" : "start"}
                  fontSize={isHover || isSrc || isTgt ? 12.5 : 11}
                  className="font-mono"
                  fill={isSrc ? "#ffc24b" : isTgt ? "#2fbe7c" : isHover ? "#ffffff" : "#a3b7c3"}
                  stroke="#06090c"
                  strokeWidth={3}
                  paintOrder="stroke"
                  letterSpacing="0.4"
                >
                  {s.name.toUpperCase()}
                </text>
                <text
                  x={s.x > MAP_W - 190 ? -14 : 14}
                  y={16}
                  textAnchor={s.x > MAP_W - 190 ? "end" : "start"}
                  fontSize={8.5}
                  className="font-mono"
                  fill="#5f7887"
                  stroke="#06090c"
                  strokeWidth={2.5}
                  paintOrder="stroke"
                >
                  {s.id}
                  {isolated ? " · NO SERVICE" : ""}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-20 w-max max-w-[240px] -translate-x-1/2 -translate-y-[calc(100%+18px)] rounded-sm border border-signal-500/40 bg-ink-950/95 px-2.5 py-2 shadow-2xl"
          style={{ left: `${(hovered.x / MAP_W) * 100}%`, top: `${(hovered.y / MAP_H) * 100}%` }}
        >
          <div className="sign text-[11px] text-mist-50">{hovered.name}</div>
          <div className="mt-1 flex items-center gap-1">
            {(hovered.lines.length ? hovered.lines : ["—"]).map((l) => (
              <span key={l} className="h-2 w-4 rounded-[1px]" style={{ backgroundColor: colorOf.get(l) ?? "#5f7887" }} />
            ))}
            <span className="hud-num ml-1 text-[9.5px] text-mist-400">
              Z{hovered.zone}
              {hovered.hub ? " · INTERCHANGE" : ""}
            </span>
          </div>
        </div>
      )}

      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/8 pt-2">
          {lines.map((l) => (
            <span key={l.id} className="flex items-center gap-1.5">
              <span className="h-[3px] w-6 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="sign text-[9.5px] text-mist-400">{l.name}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="hud-num flex h-3.5 w-3.5 items-center justify-center rounded-full border border-signal-500 text-[8px] text-signal-400">!</span>
            <span className="sign text-[9.5px] text-mist-400">Incident delay (min)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-dashed border-lred" />
            <span className="sign text-[9.5px] text-mist-400">Isolated node</span>
          </span>
        </div>
      )}
    </div>
  );
}
