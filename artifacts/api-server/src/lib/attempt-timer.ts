export type AttemptTimerEvent = {
  type: string;
  at: Date;
};

/**
 * Active time is the sum of started/resumed → paused/submitted intervals.
 * Time after a pause is not active, so a saved attempt does not keep burning
 * the clock while the student is away.
 */
export function summarizeAttemptTimer(
  events: readonly AttemptTimerEvent[],
  now: Date,
): { activeSeconds: number; pausedSeconds: number; pauseCount: number } {
  let activeSeconds = 0;
  let pausedSeconds = 0;
  let pauseCount = 0;
  let activeStart: Date | null = null;
  let pauseStart: Date | null = null;
  for (const event of events) {
    if (event.type === "started" || event.type === "resumed") {
      if (pauseStart) {
        pausedSeconds += Math.max(0, Math.floor((event.at.getTime() - pauseStart.getTime()) / 1000));
        pauseStart = null;
      }
      activeStart = event.at;
    } else if (event.type === "paused" || event.type === "submitted") {
      if (activeStart) {
        activeSeconds += Math.max(0, Math.floor((event.at.getTime() - activeStart.getTime()) / 1000));
        activeStart = null;
      }
      if (event.type === "paused") {
        pauseCount += 1;
        pauseStart = event.at;
      }
    }
  }
  if (activeStart) {
    activeSeconds += Math.max(0, Math.floor((now.getTime() - activeStart.getTime()) / 1000));
  }
  if (pauseStart) {
    pausedSeconds += Math.max(0, Math.floor((now.getTime() - pauseStart.getTime()) / 1000));
  }
  return { activeSeconds, pausedSeconds, pauseCount };
}

export function remainingAttemptSeconds(timeLimitMinutes: number, activeSeconds: number): number {
  return Math.max(0, timeLimitMinutes * 60 - activeSeconds);
}
