# Smart Metropolitan Transit Scheduler

A transit operations console built entirely from first-principles data structures — the engine imports **no graph, heap, or pathfinding library**. Four classical structures cooperate on one live network: an adjacency-list multigraph, a from-scratch binary min-heap, Dijkstra's algorithm, and an assembly-line dynamic program.

## Features

| # | Module | Structure | Complexity |
|---|--------|-----------|------------|
| 01 | **Network Topology** | weighted undirected multigraph as an adjacency list (`Map<StationId, Edge[]>`) | O(V + E) memory, O(deg v) neighbour scan |
| 02 | **Dispatch Engine** | array-backed binary min-heap written from scratch (`siftUp` / `siftDown`) | push / pop O(log n) |
| 03 | **Journey Planner** | Dijkstra SSSP with lazy deletion, early exit, and a full relaxation trace | O((V + E) log V) |
| 04 | **Transfer Optimiser** | assembly-line dynamic program (CLRS §15.1) with a 2ⁿ brute-force oracle | O(n) time, O(n) space |

The dispatch board is a priority queue keyed on *absolute arrival time*: vehicles are routed with Dijkstra, then ordered on the heap by ETA. Incidents mutate edge weights at runtime (`w(e) = baseMinutes + incidentDelay`), and the whole fleet re-plans against the new weights.

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # single-file production bundle → dist/index.html
npm run preview
```

Requires Node.js 18+.

## The six tabs

1. **Network Topology** — canvas map, per-station adjacency buckets, BFS connectivity audit, dynamic weight controller, chaos drill, and forms to `addStation` / `addRoute`.
2. **Dispatch Engine** — live fleet positions, the raw priority-queue array with level-order tree view, departure board, event stream, and an independently re-checked heap invariant.
3. **Journey Planner** — origin/destination pickers, animated route overlay, relaxation trace replay, and the `dist[]` / `prev[]` table with heap statistics.
4. **Transfer Optimiser** — two parallel express lines along a corridor; the DP table fills cell-by-cell, cross-overs animate, and the result is verified against exhaustive enumeration.
5. **CLI Console** — an in-app terminal where every command is a real engine call (see below).
6. **Source & Proofs** — syntax-highlighted engine source, complexity ledger, and edge-case register.

## CLI commands

```
stations [CODE]     routes [LINE]       neighbors CODE      components
add-station …       add-route …         delay ROUTE MIN     plan FROM TO
trace FROM TO [N]   heap                board [N]           dispatch FROM TO [KIND] [OFFSET]
tick [MIN]          fleet               withdraw ID         replan
transfer            brute               clock               demo
```

Type `help` in the console for the full reference, or `demo` for a scripted walkthrough of all four features.

## Architecture

```
src/
├── engine/                 framework-free, portable to a CLI or another language
│   ├── Graph.ts            adjacency-list multigraph, validated mutation, BFS connectivity
│   ├── MinHeap.ts          binary min-heap, Floyd build-heap, self-instrumentation
│   ├── Dijkstra.ts         SSSP with lazy deletion, dist/prev tables, trace events
│   ├── AssemblyLine.ts     two-line DP with traceback + 2ⁿ exhaustive verifier
│   ├── DispatchEngine.ts   vehicle lifecycle driven by extract-min
│   ├── types.ts            domain vocabulary and effective-weight helpers
│   └── mockData.ts         14-station reference fixture (incl. an isolated node)
├── state/store.tsx         React context bridging engine ↔ UI (simulation loop)
└── components/             the six tabs plus shared UI primitives
```

## Edge cases handled

Isolated node (OLD Ferry) · unreachable destinations reported as `found = false` with the reachable component · parallel edges (MKT–CEN on Green and Amber) · self-loops · duplicate ids · negative and non-finite (NaN) weights rejected at the boundary · empty schedule (`pop()` → `undefined`, `tick()` is a no-op) · tied arrival timestamps (deterministic id tie-break) · route or station deleted mid-journey (vehicle re-plans or is held) · midnight clock wrap.

## Verification

- The DP optimum is compared against 2ⁿ brute-force enumeration in both the UI and the CLI (`brute`).
- The dispatch tab re-checks the heap invariant on every render — proof, not assertion.
- Engine correctness was cross-checked externally: Dijkstra ≡ Bellman-Ford on 300 random graphs, assembly DP ≡ brute force on 500 random corridors, heap invariant held over 2000 random operations.

## Tech stack

React 19 · TypeScript (strict) · Vite 7 · Tailwind CSS v4 · clsx + tailwind-merge. The engine layer has zero runtime dependencies.
