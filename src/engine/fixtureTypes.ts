/**
 * fixtureTypes.ts — small shim so the fixture module does not import the
 * engine's mutable classes (keeps the data layer dependency-free and portable).
 */

import type { LineId, Route as RouteBase, Station as StationBase, StationId } from "./types";

export type Route = RouteBase;
export type Station = StationBase;

export interface ScheduleRequestLike {
  id: string;
  line: LineId;
  origin: StationId;
  destination: StationId;
  departAt: number;
  load?: number;
  capacity?: number;
}

export type { LineId, StationId };
