import { useEffect, useMemo, useState } from "react";
import { useTransit } from "@/state/store";
import { Btn, Panel, PaperCard, Reveal, Stat, Td, Th } from "@/components/ui";
import { bruteForceAssembly } from "@/engine/AssemblyLine";
import { corridorFixture } from "@/engine/mockData";
import { cn } from "@/utils/cn";

const W = 920;
const H = 330;
const RAIL_Y = [96, 236];
const X0 = 96;
const DX = 146;

export default function TransferTab() {
  const { corridor, setCorridor, corridorResult, corridorError, notify } = useTransit();
  const [revealed, setRevealed] = useState(0);
  const [replaying, setReplaying] = useState(false);

  const n = corridor.stops.length;
  const steps = corridorResult?.steps ?? [];

  useEffect(() => {
    setRevealed(0);
    setReplaying(true);
  }, [corridor]);

  useEffect(() => {
    if (!replaying) return;
    if (revealed >= steps.length) {
      setReplaying(false);
      return;
    }
    const h = window.setTimeout(() => setRevealed((r) => r + 1), 90);
    return () => window.clearTimeout(h);
  }, [replaying, revealed, steps.length]);

  const brute = useMemo(() => {
    try {
      return bruteForceAssembly(corridor);
    } catch {
      return null;
    }
  }, [corridor]);

  const xOf = (j: number) => X0 + j * DX;
  const res = corridorResult;

  const cellRevealed = (i: number, j: number) => {
    // steps are emitted column-major: for j, for i
    const idx = j * 2 + i;
    return idx < revealed;
  };

  const randomise = () => {
    setCorridor((c) => {
      const next = {
        ...c,
        ride: c.ride.map((row) => row.map((v) => Math.max(1, v + Math.round((Math.random() - 0.45) * 6)))),
        transfer: c.transfer.map((row) => row.map((v, j) => (j === row.length - 1 ? 0 : Math.max(0, v + Math.round((Math.random() - 0.5) * 4))))),
      };
      return next;
    });
    notify("warn", "Corridor costs perturbed — DP table recomputed in O(n).");
  };

  return (
    <div className="space-y-4">
      <Reveal>
        <Panel
          code="04"
          title="Inter-Line Transfer Optimiser · Assembly-Line Scheduling (DP)"
          right={
            <div className="flex items-center gap-2">
              <span className="hud-num text-[10px] text-mist-500">O(n) time · O(n) space · n={n}</span>
              <Btn size="sm" variant="outline" onClick={randomise}>
                Perturb costs
              </Btn>
              <Btn
                size="sm"
                onClick={() => {
                  setCorridor(() => corridorFixture());
                  notify("ok", "Corridor restored to the reference fixture.");
                }}
              >
                Reset corridor
              </Btn>
            </div>
          }
          bodyClass="p-3"
        >
          {corridorError && <div className="mb-2 rounded-sm border border-lred/40 bg-lred/10 px-3 py-2 font-mono text-[11px] text-lred">✕ {corridorError}</div>}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Stat label="Fastest corridor run" value={res ? res.total : "—"} unit="min" tone="amber" />
            <Stat label="Board line" value={res ? res.input.lines[res.entryLine].id : "—"} tone="good" />
            <Stat label="Alight line" value={res ? res.input.lines[res.exitLine].id : "—"} tone="good" />
            <Stat label="Transfers" value={res ? res.transfers : 0} tone={res && res.transfers > 0 ? "bad" : "default"} />
            <Stat label="vs never transferring" value={res ? `−${Math.max(0, res.saving)}` : "—"} unit="min" tone="good" />
          </div>

          {/* ---------------------------------------------- rail diagram */}
          <div className="mt-3 overflow-hidden rounded-sm border border-white/10 bg-ink-950/70">
            <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
              <defs>
                <linearGradient id="railFade" x1="0" x2="1">
                  <stop offset="0%" stopColor="#0b1218" />
                  <stop offset="50%" stopColor="#16242e" />
                  <stop offset="100%" stopColor="#0b1218" />
                </linearGradient>
              </defs>
              <rect width={W} height={H} fill="url(#railFade)" />

              {/* stop columns */}
              {corridor.stops.map((s, j) => (
                <g key={s.id}>
                  <line x1={xOf(j)} y1={44} x2={xOf(j)} y2={H - 34} stroke="#5d8ca5" strokeOpacity={0.16} strokeDasharray="3 5" />
                  <text x={xOf(j)} y={30} textAnchor="middle" fontSize={11} className="font-mono" fill="#c8d7e0" letterSpacing="0.6">
                    {s.name.toUpperCase()}
                  </text>
                  <text x={xOf(j)} y={H - 14} textAnchor="middle" fontSize={9.5} className="font-mono" fill="#5f7887">
                    stop j={j}
                  </text>
                </g>
              ))}

              {/* transfer cross-overs */}
              {[0, 1].map((i) =>
                corridor.stops.slice(0, -1).map((_, j) => {
                  const cost = corridor.transfer[i][j];
                  const x1 = xOf(j);
                  const x2 = xOf(j + 1);
                  const y1 = RAIL_Y[i];
                  const y2 = RAIL_Y[1 - i];
                  const used = res?.transferStops.some((t) => t.from === i && t.afterStop.id === corridor.stops[j].id);
                  return (
                    <g key={`${i}-${j}`}>
                      <path
                        d={`M${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke={used ? "#ffc24b" : "#5d8ca5"}
                        strokeOpacity={used ? 0.95 : 0.28}
                        strokeWidth={used ? 2.6 : 1.2}
                        strokeDasharray={used ? "none" : "4 4"}
                        className={used ? "marching" : undefined}
                      />
                      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 3} textAnchor="middle" fontSize={9.5} className="font-mono" fill={used ? "#ffc24b" : "#5f7887"}>
                        t={cost}
                      </text>
                    </g>
                  );
                }),
              )}

              {/* the two rails */}
              {[0, 1].map((i) => (
                <g key={i}>
                  <line x1={26} y1={RAIL_Y[i]} x2={W - 26} y2={RAIL_Y[i]} stroke={corridor.lines[i].color} strokeOpacity={0.28} strokeWidth={6} strokeLinecap="round" />
                  <text x={30} y={RAIL_Y[i] - 12} fontSize={10.5} className="font-mono" fill={corridor.lines[i].color} letterSpacing="1.4">
                    LINE {corridor.lines[i].id}
                  </text>
                  {/* entry / exit stubs */}
                  <text x={30} y={RAIL_Y[i] + 18} fontSize={9} className="font-mono" fill="#7d95a3">
                    e={corridor.entry[i]}
                  </text>
                  <text x={W - 52} y={RAIL_Y[i] + 18} fontSize={9} className="font-mono" fill="#7d95a3">
                    x={corridor.exit[i]}
                  </text>

                  {/* ride costs along the rail */}
                  {corridor.stops.map((_, j) => (
                    <g key={j}>
                      {j < n - 1 && (
                        <>
                          <line
                            x1={xOf(j) + 10}
                            y1={RAIL_Y[i]}
                            x2={xOf(j + 1) - 10}
                            y2={RAIL_Y[i]}
                            stroke={corridor.lines[i].color}
                            strokeOpacity={res?.route[j].line === i && res?.route[j + 1].line === i ? 1 : 0.45}
                            strokeWidth={res?.route[j].line === i && res?.route[j + 1].line === i ? 6 : 3.5}
                            className={res?.route[j].line === i && res?.route[j + 1].line === i ? "marching" : undefined}
                            strokeLinecap="round"
                          />
                          <text
                            x={(xOf(j) + xOf(j + 1)) / 2}
                            y={RAIL_Y[i] + (i === 0 ? -10 : 20)}
                            textAnchor="middle"
                            fontSize={10.5}
                            className="font-mono"
                            fill={res?.route[j].line === i && res?.route[j + 1].line === i ? "#ffffff" : "#7d95a3"}
                          >
                            {corridor.ride[i][j]}m
                          </text>
                        </>
                      )}
                      {j === n - 1 && (
                        <text x={xOf(j) + 34} y={RAIL_Y[i] + (i === 0 ? -10 : 20)} textAnchor="middle" fontSize={10.5} className="font-mono" fill="#7d95a3">
                          {corridor.ride[i][j]}m
                        </text>
                      )}
                      <circle
                        cx={xOf(j)}
                        cy={RAIL_Y[i]}
                        r={res?.route[j].line === i ? 9 : 6}
                        fill={res?.route[j].line === i ? corridor.lines[i].color : "#0b1218"}
                        stroke={corridor.lines[i].color}
                        strokeWidth={2}
                      />
                      {res?.route[j].line === i && <circle cx={xOf(j)} cy={RAIL_Y[i]} r={14} fill="none" stroke={corridor.lines[i].color} strokeWidth={1.2} className="halo" />}
                    </g>
                  ))}
                </g>
              ))}

              {/* chosen path polyline */}
              {res && (
                <polyline
                  points={res.route.map((r, j) => `${xOf(j)},${RAIL_Y[r.line]}`).join(" ")}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={0.9}
                  strokeWidth={2}
                  strokeDasharray="7 7"
                  className="marching-fast"
                />
              )}
            </svg>
          </div>

          {res && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
              <span className="sign text-[10px] text-mist-500">Optimal itinerary</span>
              {res.route.map((r, j) => {
                const prev = j > 0 ? res.route[j - 1] : null;
                const switched = prev && prev.line !== r.line;
                return (
                  <div key={r.stop.id} className="flex items-center gap-2">
                    {switched && (
                      <span className="sign rounded-[2px] bg-signal-500 px-1.5 py-0.5 text-[9px] font-bold text-ink-950">
                        transfer −{res.transferStops.find((t) => t.afterStop.id === prev.stop.id)?.penalty ?? 0}m
                      </span>
                    )}
                    <span
                      className="flex items-center gap-1.5 rounded-sm border px-2 py-1"
                      style={{ borderColor: `${corridor.lines[r.line].color}66`, backgroundColor: `${corridor.lines[r.line].color}18` }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: corridor.lines[r.line].color }} />
                      <span className="hud-num text-[10.5px] text-mist-100">{r.stop.name}</span>
                      <span className="hud-num text-[9px] text-mist-500">{corridor.lines[r.line].id}</span>
                    </span>
                  </div>
                );
              })}
              <span className="hud-num ml-auto text-[10px] text-mist-500">
                brute force checked {brute ? brute.patterns : 0} patterns → {brute ? brute.total : "—"} min{" "}
                <span className={cn(brute && res.total === brute.total ? "text-lgreen" : "text-lred")}>
                  {brute && res.total === brute.total ? "✓ DP is optimal" : "✗ mismatch"}
                </span>
              </span>
            </div>
          )}
        </Panel>
      </Reveal>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Reveal delay={50}>
          <PaperCard>
            <div className="flex items-center justify-between border-b border-black/15 px-3 py-2">
              <h3 className="sign text-[12px] text-ink-800">f[i][j] — cumulative fastest time</h3>
              <span className="hud-num text-[10px] text-ink-600">
                {revealed}/{steps.length} cells filled
              </span>
            </div>
            <div className="overflow-x-auto p-3">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th className="w-24">line \ stop</Th>
                    {corridor.stops.map((s, j) => (
                      <Th key={s.id} className="text-center">
                        j={j}
                        <div className="font-mono text-[8.5px] font-normal normal-case text-ink-500">{s.id}</div>
                      </Th>
                    ))}
                    <Th className="w-16 text-center">+ exit</Th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1].map((i) => (
                    <tr key={i}>
                      <Td className="font-semibold">
                        <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: corridor.lines[i].color }} />
                        {corridor.lines[i].id}
                      </Td>
                      {corridor.stops.map((_, j) => {
                        const shown = cellRevealed(i, j);
                        const choice = res?.choiceMap[i][j];
                        const onRoute = res?.route[j].line === i;
                        return (
                          <Td key={j} className="p-0 text-center">
                            <div
                              className={cn(
                                "hud-num px-1 py-1.5 text-[12px] transition-colors",
                                shown ? "opacity-100" : "opacity-15",
                                onRoute && shown && "bg-signal-400/40 font-bold",
                                shown && choice === "transfer" && !onRoute && "bg-lblue/12",
                              )}
                            >
                              {res ? res.f[i][j] : "·"}
                              <div className="text-[8px] font-normal text-ink-500">{shown ? choice : ""}</div>
                            </div>
                          </Td>
                        );
                      })}
                      <Td className="text-center">
                        <span className="hud-num text-[11px]">{res ? res.f[i][n - 1] + corridor.exit[i] : "·"}</span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-black/15 px-3 py-2 font-mono text-[10px] leading-relaxed text-ink-700">
              f[i][j] = min( f[i][j−1] + a[i][j] , f[1−i][j−1] + t[1−i][j−1] + a[i][j] ) — bottom-up, one pass, no recursion tree.
            </div>
          </PaperCard>
        </Reveal>

        <div className="space-y-4">
          <Reveal delay={80}>
            <PaperCard>
              <div className="flex items-center justify-between border-b border-black/15 px-3 py-2">
                <h3 className="sign text-[12px] text-ink-800">Fill order · recurrence log</h3>
                <Btn
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRevealed(steps.length);
                    setReplaying(false);
                  }}
                >
                  finish
                </Btn>
              </div>
              <div className="max-h-[230px] overflow-y-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    {steps.slice(0, revealed).map((s, idx) => (
                      <tr key={idx} className="rise">
                        <Td className="w-10 text-ink-500">{idx}</Td>
                        <Td className="text-[10px]">{s.message}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PaperCard>
          </Reveal>

          <Reveal delay={110}>
            <Panel code="04·b" title="Cost matrices · editable">
              <div className="space-y-3">
                {(["ride", "transfer"] as const).map((key) => (
                  <div key={key}>
                    <div className="sign mb-1 text-[9.5px] text-mist-500">
                      {key === "ride" ? "a[i][j] ride minutes" : "t[i][j] transfer penalty"}
                    </div>
                    <div className="grid gap-1" style={{ gridTemplateColumns: `64px repeat(${n}, minmax(0,1fr))` }}>
                      <span />
                      {corridor.stops.map((s, j) => (
                        <span key={s.id} className="hud-num text-center text-[9px] text-mist-500">
                          j{j}
                        </span>
                      ))}
                      {[0, 1].map((i) => (
                        <FragmentRow
                          key={i}
                          label={corridor.lines[i].id}
                          color={corridor.lines[i].color}
                          values={corridor[key][i]}
                          onChange={(vals) =>
                            setCorridor((c) => {
                              const m = c[key].map((row) => [...row]);
                              m[i] = vals;
                              return { ...c, [key]: m };
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-3 border-t border-white/8 pt-3">
                  {(["entry", "exit"] as const).map((key) => (
                    <div key={key}>
                      <div className="sign mb-1 text-[9.5px] text-mist-500">{key === "entry" ? "e[i] street → platform" : "x[i] platform → street"}</div>
                      <div className="flex gap-1.5">
                        {[0, 1].map((i) => (
                          <input
                            key={i}
                            type="number"
                            min={0}
                            value={corridor[key][i]}
                            onChange={(e) =>
                              setCorridor((c) => {
                                const arr = [...c[key]];
                                arr[i] = Math.max(0, Number(e.target.value) || 0);
                                return { ...c, [key]: arr };
                              })
                            }
                            className="hud-num w-16 rounded-[2px] border border-white/12 bg-ink-950 px-1.5 py-1 text-[11px] text-mist-100 outline-none focus:border-signal-500"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({
  label,
  color,
  values,
  onChange,
}: {
  label: string;
  color: string;
  values: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <>
      <span className="hud-num flex items-center gap-1 text-[9.5px] text-mist-400">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      {values.map((v, j) => (
        <input
          key={j}
          type="number"
          min={0}
          value={v}
          onChange={(e) => {
            const next = [...values];
            next[j] = Math.max(0, Number(e.target.value) || 0);
            onChange(next);
          }}
          className="hud-num w-full rounded-[2px] border border-white/12 bg-ink-950 px-1 py-1 text-center text-[11px] text-mist-100 outline-none transition-colors focus:border-signal-500"
        />
      ))}
    </>
  );
}

