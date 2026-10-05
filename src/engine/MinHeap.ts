/**
 * MinHeap.ts — FEATURE 2 (foundation): a from-scratch binary min-heap.
 *
 * No library, no Array.prototype.sort: an explicit array-backed complete
 * binary tree with two primitives —
 *
 *     siftUp(i)   — restore the heap property upwards after an insert
 *     siftDown(i) — restore it downwards after extract-min
 *
 * Invariants (parent p of index i is ⌊(i-1)/2⌋, children are 2i+1, 2i+2):
 *     ∀ i > 0 :  cmp(data[parent(i)], data[i]) <= 0
 *
 * push / pop are O(log n); peek / size are O(1). n sort() calls would be
 * O(n log n) *per* extraction, and a linked list would be O(n) per insert —
 * the heap is the only structure giving O(log n) on both sides, which is what
 * a dispatch board needs when vehicles re-prioritise themselves continuously.
 *
 * The class also instruments itself (`stats`, `recentOps`) so the UI can prove
 * the complexity claims instead of merely asserting them.
 */

export type Comparator<T> = (a: T, b: T) => number;

export type HeapOpKind = "compare" | "swap" | "push" | "pop";

export interface HeapOp {
  kind: HeapOpKind;
  index: number;
  other?: number;
  /** monotonically increasing stamp so the UI can expire highlights */
  seq: number;
}

export interface HeapStats {
  comparisons: number;
  swaps: number;
  pushes: number;
  pops: number;
  peakSize: number;
}

export class MinHeap<T> {
  private data: T[] = [];
  private readonly cmp: Comparator<T>;
  private seq = 0;

  readonly stats: HeapStats = { comparisons: 0, swaps: 0, pushes: 0, pops: 0, peakSize: 0 };
  /** Last few structural operations — the visualiser flashes these cells. */
  recentOps: HeapOp[] = [];

  constructor(cmp: Comparator<T>, initial: T[] = []) {
    this.cmp = cmp;
    if (initial.length) {
      // O(n) Floyd build-heap: sift down from the last internal node.
      this.data = [...initial];
      this.stats.peakSize = this.data.length;
      for (let i = Math.floor(this.data.length / 2) - 1; i >= 0; i--) this.siftDown(i);
    }
  }

  get size(): number {
    return this.data.length;
  }

  isEmpty(): boolean {
    return this.data.length === 0;
  }

  /** O(1) — the min always lives at the root. */
  peek(): T | undefined {
    return this.data[0];
  }

  /** O(1) snapshot for rendering. */
  toArray(): T[] {
    return [...this.data];
  }

  clear(): void {
    this.data = [];
    this.recentOps = [];
  }

  push(value: T): void {
    this.data.push(value);
    this.stats.pushes++;
    this.stats.peakSize = Math.max(this.stats.peakSize, this.data.length);
    this.log({ kind: "push", index: this.data.length - 1 });
    this.siftUp(this.data.length - 1);
  }

  /** O(log n) — remove and return the minimum, or undefined when empty. */
  pop(): T | undefined {
    const n = this.data.length;
    if (n === 0) return undefined; // empty-schedule edge case, no throw
    const min = this.data[0];
    this.stats.pops++;
    this.log({ kind: "pop", index: 0 });
    const last = this.data.pop()!;
    if (n > 1) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return min;
  }

  /** Pop-and-push in a single O(log n) — used when a vehicle is rescheduled. */
  replacePeek(value: T): T | undefined {
    if (this.isEmpty()) {
      this.push(value);
      return undefined;
    }
    const min = this.data[0];
    this.data[0] = value;
    this.stats.pops++;
    this.stats.pushes++;
    this.log({ kind: "swap", index: 0 });
    this.siftDown(0);
    return min;
  }

  /** Linear scan removal — O(n), only used by admin tooling, never on the hot path. */
  removeWhere(predicate: (v: T) => boolean): T[] {
    const removed: T[] = [];
    const keep: T[] = [];
    for (const v of this.data) (predicate(v) ? removed : keep).push(v);
    if (removed.length) {
      this.data = keep;
      for (let i = Math.floor(this.data.length / 2) - 1; i >= 0; i--) this.siftDown(i);
    }
    return removed;
  }

  /** Debug helper: assert the heap property holds (used by the test menu). */
  verify(): boolean {
    for (let i = 1; i < this.data.length; i++) {
      const p = (i - 1) >> 1;
      if (this.cmp(this.data[p], this.data[i]) > 0) return false;
    }
    return true;
  }

  // ------------------------------------------------------- internals

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      this.stats.comparisons++;
      this.log({ kind: "compare", index: i, other: parent });
      if (this.cmp(this.data[parent], this.data[i]) <= 0) break; // heap property satisfied
      this.swap(parent, i);
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.data.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;

      if (left < n) {
        this.stats.comparisons++;
        this.log({ kind: "compare", index: left, other: smallest });
        if (this.cmp(this.data[left], this.data[smallest]) < 0) smallest = left;
      }
      if (right < n) {
        this.stats.comparisons++;
        this.log({ kind: "compare", index: right, other: smallest });
        if (this.cmp(this.data[right], this.data[smallest]) < 0) smallest = right;
      }
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const tmp = this.data[a];
    this.data[a] = this.data[b];
    this.data[b] = tmp;
    this.stats.swaps++;
    this.log({ kind: "swap", index: a, other: b });
  }

  private log(op: Omit<HeapOp, "seq">): void {
    this.recentOps.push({ ...op, seq: this.seq++ });
    if (this.recentOps.length > 10) this.recentOps.shift();
  }

  /** Height of the tree — log₂(n)+1, shown next to the array view. */
  get height(): number {
    return this.data.length === 0 ? 0 : Math.floor(Math.log2(this.data.length)) + 1;
  }
}

/** Convenience: natural ordering for numbers/strings. */
export function natural<T extends number | string>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
