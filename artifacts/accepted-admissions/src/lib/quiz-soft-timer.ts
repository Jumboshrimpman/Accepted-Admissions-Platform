export const SOFT_TIMER_NOTE =
  "Try your best to finish within 30 minutes. If you go over, you can keep working.";

function clockLabel(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Math.abs(totalSeconds)));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/** Countdown until the limit, then "Over m:ss" without stopping. */
export function formatQuizClock(seconds: number): { text: string; overtime: boolean } {
  if (seconds < 0) return { text: `Over ${clockLabel(seconds)}`, overtime: true };
  return { text: clockLabel(seconds), overtime: false };
}

/** Hard timers stop at 0. A soft timer keeps counting into negative seconds. */
export function tickQuizSeconds(seconds: number, soft: boolean): number {
  if (soft) return seconds - 1;
  return Math.max(0, seconds - 1);
}
