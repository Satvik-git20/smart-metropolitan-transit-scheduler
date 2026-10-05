/**
 * AssemblyLine.ts — FEATURE 4: Inter-Line Transfer Optimiser.
 *
 * Direct application of CLRS §15.1 "Assembly-line scheduling" to a passenger
 * moving along a corridor served by two PARALLEL express lines.
 *
 *   line 0 (A)  ●───●───●───●───●───●
 *               │╲  │   ╲│  │  ╲│   │      ← transfer penalties t[i][j]
 *   line 1 (B)  ●───●───●───●───●───●
 *              entry                exit
 *
 *   a[i][j] — minutes to ride line i from corridor stop j to stop j+1
 *             (includes dwell; the two lines differ in rolling stock & stops)
 *   t[i][j] — penalty (stairs, escalator wait, ticket gate) for switching
 *             FROM line i AFTER stop j onto the other line at stop j+1
 *   e[i]    — street-to-platform entry cost at the corridor origin
 *   x[i]    — platform-to-street exit cost at the corridor terminus
 *
 * Recurrence (optimal substructure — the fastest way to reach stop j on line i
 * must use the fastest way to reach stop j-1 on *some* line):
 *
 *   f[i][0] = e[i] + a[i][0]
 *   f[i][j] = min( f[i][j-1]                 + a[i][j],     // stay on line i
 *                  f[1-i][j-1] + t[1-i][j-1] + a[i][j] )    // transfer in
 *   total   = min( f[0][n-1] + x[0],  f[1][n-1] + x[1] )
 *
 * Time O(n) · Space O(n) — versus 2ⁿ possible transfer patterns by brute
 * force. The l[i][j] bookkeeping array gives an O(n) traceback.
 *
 * Edge cases: n === 0 (empty corridor), arrays of mismatched length, negative
 * costs, and a corridor where one line is entirely faster (0 transfers).
 */

export interface ExpressLine {
  id: string;
  name: string;
  color: string;
}

export interface CorridorStop {
  id: string;
  name: string;
}

export interface AssemblyInput {
  lines: [ExpressLine, ExpressLine];
  stops: CorridorStop[];
  /** a[i][j]: ride cost on line i leaving stop j (last column = arrival at terminus) */
  ride: number[][];
  /** t[i][j]: penalty for leaving line i after stop j and boarding the other line */
  transfer: number[][];
  /** e[i]: entry cost onto line i at the corridor origin */
  entry: number[];
  /** x[i]: exit cost from line i at the corridor terminus */
  exit: number[];
}

export type FillChoice = "entry" | "stay" | "transfer";

export interface FillStep {
  j: number;
  line: number;
  value: number;
  stayFrom: number;
  transferFrom: number;
  transferPenalty: number;
  choice: FillChoice;
  message: string;
}

export interface AssemblyResult {
  input: AssemblyInput;
  /** f[i][j] cumulative cost table */
  f: number[][];
  /** l[i][j] line that produced the optimum (0/1) */
  l: number[][];
  choiceMap: FillChoice[][];
  total: number;
  entryLine: number;
  exitLine: number;
  /** ordered corridor stops with the line to be on at each */
  route: { stop: CorridorStop; line: number }[];
  transferStops: { afterStop: CorridorStop; from: number; to: number; penalty: number }[];
  transfers: number;
  naiveStayCost: number[];
  saving: number;
  steps: FillStep[];
  n: number;
}

export class AssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssemblyError";
  }
}

export function solveAssemblyLine(input: AssemblyInput): AssemblyResult {
  const { lines, stops, ride, transfer, entry, exit } = input;
  const n = stops.length;

  if (n === 0) throw new AssemblyError("Corridor has no stops — nothing to schedule.");
  if (lines.length !== 2) throw new AssemblyError("This optimiser handles exactly two parallel express lines.");
  for (const [label, arr] of [
    ["ride", ride],
    ["transfer", transfer],
  ] as const) {
    if (arr.length !== 2 || arr.some((row) => row.length !== n))
      throw new AssemblyError(`Malformed ${label} matrix: expected 2 × ${n}.`);
  }
  if (entry.length !== 2 || exit.length !== 2) throw new AssemblyError("entry/exit arrays must have one cost per line.");
  if ([...ride.flat(), ...transfer.flat(), ...entry, ...exit].some((v) => !Number.isFinite(v) || v < 0))
    throw new AssemblyError("All costs must be finite and non-negative.");

  const f: number[][] = [new Array(n).fill(0), new Array(n).fill(0)];
  const l: number[][] = [new Array(n).fill(0), new Array(n).fill(0)];
  const choiceMap: FillChoice[][] = [new Array(n).fill("entry"), new Array(n).fill("entry")];
  const steps: FillStep[] = [];

  // ---- column 0: entry cost + first ride -------------------------------
  for (let i = 0; i < 2; i++) {
    f[i][0] = entry[i] + ride[i][0];
    l[i][0] = i;
    choiceMap[i][0] = "entry";
    steps.push({
      j: 0,
      line: i,
      value: f[i][0],
      stayFrom: Infinity,
      transferFrom: Infinity,
      transferPenalty: 0,
      choice: "entry",
      message: `f[${i}][0] = e${i} + a[${i}][0] = ${entry[i]} + ${ride[i][0]} = ${f[i][0]}`,
    });
  }

  // ---- columns 1..n-1 --------------------------------------------------
  for (let j = 1; j < n; j++) {
    for (let i = 0; i < 2; i++) {
      const other = 1 - i;
      const stayCost = f[i][j - 1] + ride[i][j];
      const transferCost = f[other][j - 1] + transfer[other][j - 1] + ride[i][j];
      const stayFrom = f[i][j - 1];
      const transferFrom = f[other][j - 1];

      if (stayCost <= transferCost) {
        f[i][j] = stayCost;
        l[i][j] = i;
        choiceMap[i][j] = "stay";
      } else {
        f[i][j] = transferCost;
        l[i][j] = other;
        choiceMap[i][j] = "transfer";
      }

      steps.push({
        j,
        line: i,
        value: f[i][j],
        stayFrom,
        transferFrom,
        transferPenalty: transfer[other][j - 1],
        choice: choiceMap[i][j],
        message:
          `f[${i}][${j}] = min(stay ${stayFrom} + ${ride[i][j]} = ${stayCost}, ` +
          `switch ${transferFrom} + ${transfer[other][j - 1]} + ${ride[i][j]} = ${transferCost}) ` +
          `= ${f[i][j]} [${choiceMap[i][j].toUpperCase()}]`,
      });
    }
  }

  // ---- terminus + traceback -------------------------------------------
  const withExit = [f[0][n - 1] + exit[0], f[1][n - 1] + exit[1]];
  const exitLine = withExit[0] <= withExit[1] ? 0 : 1;
  const total = withExit[exitLine];

  const lineAt: number[] = new Array(n).fill(0);
  lineAt[n - 1] = exitLine;
  for (let j = n - 1; j >= 1; j--) lineAt[j - 1] = l[lineAt[j]][j];

  const route = stops.map((stop, j) => ({ stop, line: lineAt[j] }));

  const transferStops: AssemblyResult["transferStops"] = [];
  for (let j = 0; j < n - 1; j++) {
    if (lineAt[j] !== lineAt[j + 1]) {
      transferStops.push({
        afterStop: stops[j],
        from: lineAt[j],
        to: lineAt[j + 1],
        penalty: transfer[lineAt[j]][j],
      });
    }
  }

  const naiveStayCost = [entry[0] + ride[0].reduce((a, b) => a + b, 0) + exit[0], entry[1] + ride[1].reduce((a, b) => a + b, 0) + exit[1]];

  return {
    input,
    f,
    l,
    choiceMap,
    total,
    entryLine: lineAt[0],
    exitLine,
    route,
    transferStops,
    transfers: transferStops.length,
    naiveStayCost,
    saving: Math.min(...naiveStayCost) - total,
    steps,
    n,
  };
}

/** Brute-force O(2^n) reference used by the CLI to *prove* the DP is optimal. */
export function bruteForceAssembly(input: AssemblyInput): { total: number; patterns: number } {
  const n = input.stops.length;
  let best = Infinity;
  const patterns = 1 << n;
  for (let mask = 0; mask < patterns; mask++) {
    const line = (j: number) => ((mask >> j) & 1) as 0 | 1;
    let cost = input.entry[line(0)];
    for (let j = 0; j < n; j++) {
      cost += input.ride[line(j)][j];
      if (j < n - 1 && line(j) !== line(j + 1)) cost += input.transfer[line(j)][j];
    }
    cost += input.exit[line(n - 1)];
    if (cost < best) best = cost;
  }
  return { total: best, patterns };
}
