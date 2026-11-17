import { useEffect, useRef, useState } from "react";
import { ExternalLink, Headphones, Mic, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

export type IeltsSpeakingConfig = {
  format: "ielts_speaking";
  title?: string;
  intro?: string;
  driveFolderUrl?: string;
  driveFolderName?: string;
  listeningAssignmentId?: string;
  listeningTitle?: string;
  part1?: Array<{ topic: string; questions: string[] }>;
  part2?: {
    task: string;
    bullets: string[];
    finalLine?: string;
    followUp?: string[];
    prepSeconds?: number;
    speakSeconds?: number;
  };
  part3?: { theme?: string; questions: string[] };
  rubric?: Array<{
    criterion: string;
    listenFor?: string[];
    strong?: string;
    developing?: string;
    needsWork?: string;
  }>;
  note?: string;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function safeLink(url: unknown): string {
  if (typeof url !== "string") return "";
  return /^https:\/\/(?:drive|docs)\.google\.com\//.test(url) ? url : "";
}

/** Reads a curriculum block config. Returns null unless it is an IELTS Speaking block. */
export function readIeltsSpeakingConfig(config: Record<string, unknown> | null | undefined): IeltsSpeakingConfig | null {
  if (!config || config.format !== "ielts_speaking") return null;
  const part1 = Array.isArray(config.part1)
    ? config.part1.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { topic?: unknown; questions?: unknown };
        const questions = asStringArray(row.questions);
        return typeof row.topic === "string" && questions.length > 0 ? [{ topic: row.topic, questions }] : [];
      })
    : [];
  const rawPart2 = config.part2 && typeof config.part2 === "object" ? (config.part2 as Record<string, unknown>) : null;
  const part2 =
    rawPart2 && typeof rawPart2.task === "string"
      ? {
          task: rawPart2.task,
          bullets: asStringArray(rawPart2.bullets),
          finalLine: typeof rawPart2.finalLine === "string" ? rawPart2.finalLine : undefined,
          followUp: asStringArray(rawPart2.followUp),
          prepSeconds: Number(rawPart2.prepSeconds) > 0 ? Number(rawPart2.prepSeconds) : 60,
          speakSeconds: Number(rawPart2.speakSeconds) > 0 ? Number(rawPart2.speakSeconds) : 120,
        }
      : undefined;
  const rawPart3 = config.part3 && typeof config.part3 === "object" ? (config.part3 as Record<string, unknown>) : null;
  const part3 = rawPart3
    ? { theme: typeof rawPart3.theme === "string" ? rawPart3.theme : undefined, questions: asStringArray(rawPart3.questions) }
    : undefined;
  const rubric = Array.isArray(config.rubric)
    ? config.rubric.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        if (typeof row.criterion !== "string") return [];
        return [
          {
            criterion: row.criterion,
            listenFor: asStringArray(row.listenFor),
            strong: typeof row.strong === "string" ? row.strong : undefined,
            developing: typeof row.developing === "string" ? row.developing : undefined,
            needsWork: typeof row.needsWork === "string" ? row.needsWork : undefined,
          },
        ];
      })
    : [];
  return {
    format: "ielts_speaking",
    title: typeof config.title === "string" ? config.title : undefined,
    intro: typeof config.intro === "string" ? config.intro : undefined,
    driveFolderUrl: safeLink(config.driveFolderUrl),
    driveFolderName: typeof config.driveFolderName === "string" ? config.driveFolderName : undefined,
    listeningAssignmentId:
      typeof config.listeningAssignmentId === "string" && /^[0-9a-f-]{36}$/i.test(config.listeningAssignmentId)
        ? config.listeningAssignmentId
        : undefined,
    listeningTitle: typeof config.listeningTitle === "string" ? config.listeningTitle : undefined,
    part1,
    part2,
    part3,
    rubric,
    note: typeof config.note === "string" ? config.note : undefined,
  };
}

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

type CueCardStage = "idle" | "prep" | "speak" | "done";

/** Part 2 cue card: 1 minute to prepare, then up to 2 minutes speaking. */
export function CueCardTimer({
  part2,
  revealBeforeStart,
}: {
  part2: NonNullable<IeltsSpeakingConfig["part2"]>;
  revealBeforeStart: boolean;
}) {
  const prepSeconds = part2.prepSeconds ?? 60;
  const speakSeconds = part2.speakSeconds ?? 120;
  const [stage, setStage] = useState<CueCardStage>("idle");
  const [remaining, setRemaining] = useState(prepSeconds);
  const endsAt = useRef<number>(0);

  useEffect(() => {
    if (stage !== "prep" && stage !== "speak") return;
    const tick = () => {
      const left = (endsAt.current - Date.now()) / 1000;
      if (left <= 0) {
        if (stage === "prep") {
          endsAt.current = Date.now() + speakSeconds * 1000;
          setRemaining(speakSeconds);
          setStage("speak");
        } else {
          setRemaining(0);
          setStage("done");
        }
        return;
      }
      setRemaining(left);
    };
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [stage, speakSeconds]);

  const startPrep = () => {
    endsAt.current = Date.now() + prepSeconds * 1000;
    setRemaining(prepSeconds);
    setStage("prep");
  };
  const startSpeaking = () => {
    endsAt.current = Date.now() + speakSeconds * 1000;
    setRemaining(speakSeconds);
    setStage("speak");
  };
  const reset = () => {
    setStage("idle");
    setRemaining(prepSeconds);
  };
  const showCard = revealBeforeStart || stage !== "idle";

  return (
    <div className="space-y-3" data-testid="ielts-cue-card">
      {showCard ? (
        <div className="rounded-xl border-2 border-primary/30 bg-background p-4">
          <p className="font-semibold">{part2.task}</p>
          {part2.bullets.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">You should say:</p>
              <ul className="ml-5 list-disc text-sm">
                {part2.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </>
          ) : null}
          {part2.finalLine ? <p className="mt-1 text-sm">{part2.finalLine}</p> : null}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground" data-testid="ielts-cue-card-hidden">
          The cue card stays hidden until you start, as in the real test.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 font-mono text-lg"
          data-testid="ielts-cue-card-timer"
          aria-live="polite"
        >
          <Timer className="h-4 w-4" />
          {stage === "idle"
            ? `${formatCountdown(prepSeconds)} prep`
            : stage === "prep"
              ? `${formatCountdown(remaining)} prep`
              : stage === "speak"
                ? `${formatCountdown(remaining)} speaking`
                : "Time is up"}
        </span>
        {stage === "idle" ? (
          <Button type="button" size="sm" onClick={startPrep}>
            Show cue card and start 1-minute preparation
          </Button>
        ) : null}
        {stage === "prep" ? (
          <Button type="button" size="sm" onClick={startSpeaking}>
            Start speaking now
          </Button>
        ) : null}
        {stage !== "idle" ? (
          <Button type="button" size="sm" variant="outline" onClick={reset}>
            Reset
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {formatCountdown(prepSeconds)} to prepare (make notes), then speak for 1–{Math.round(speakSeconds / 60)} minutes. The
        timer moves to speaking on its own.
      </p>
      {part2.followUp && part2.followUp.length > 0 && stage === "done" ? (
        <div className="text-sm">
          <p className="font-medium">Rounding-off question</p>
          <ul className="ml-5 list-disc">
            {part2.followUp.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function IeltsSpeakingBlock({
  config,
  studentFacing = false,
}: {
  config: IeltsSpeakingConfig;
  studentFacing?: boolean;
}) {
  return (
    <div className="space-y-5" data-testid="ielts-speaking-block">
      <div className="flex flex-wrap items-center gap-2">
        <Mic className="h-5 w-5 text-primary" />
        <p className="text-lg font-semibold">{config.title || "IELTS Speaking practice"}</p>
      </div>
      {config.intro ? <p className="text-sm text-muted-foreground">{config.intro}</p> : null}

      {config.listeningAssignmentId ? (
        <a
          href={`/portal/assignments/${config.listeningAssignmentId}`}
          className="flex items-center gap-2 rounded-xl border p-3 text-sm font-medium text-primary hover:bg-muted/40"
          data-testid="ielts-listening-link"
        >
          <Headphones className="h-4 w-4" />
          {config.listeningTitle || "IELTS Listening test (4 parts, 40 questions)"}
        </a>
      ) : null}

      {config.part1 && config.part1.length > 0 ? (
        <section className="space-y-2">
          <h4 className="font-semibold">Part 1 — Interview (4–5 minutes)</h4>
          {config.part1.map((topic) => (
            <div key={topic.topic}>
              <p className="text-sm font-medium">{topic.topic}</p>
              <ol className="ml-5 list-decimal text-sm">
                {topic.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      ) : null}

      {config.part2 ? (
        <section className="space-y-2">
          <h4 className="font-semibold">Part 2 — Long turn (3–4 minutes)</h4>
          <CueCardTimer part2={config.part2} revealBeforeStart={!studentFacing} />
        </section>
      ) : null}

      {config.part3 && config.part3.questions.length > 0 ? (
        <section className="space-y-2">
          <h4 className="font-semibold">Part 3 — Discussion (4–5 minutes)</h4>
          {config.part3.theme ? <p className="text-sm font-medium">{config.part3.theme}</p> : null}
          <ol className="ml-5 list-decimal text-sm">
            {config.part3.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {config.driveFolderUrl ? (
        <div className="rounded-xl border bg-muted/30 p-3 text-sm">
          <p>Record your answers and upload the recording to the Speaking folder.</p>
          <a
            href={config.driveFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-2 font-medium text-primary hover:underline"
            data-testid="ielts-speaking-drive-link"
          >
            <ExternalLink className="h-4 w-4" />
            {config.driveFolderName ? `Open “${config.driveFolderName}” in Google Drive` : "Open the Speaking folder"}
          </a>
        </div>
      ) : null}

      {!studentFacing && config.rubric && config.rubric.length > 0 ? (
        <section className="space-y-2" data-testid="ielts-speaking-rubric">
          <h4 className="font-semibold">Tutor rubric</h4>
          <p className="text-xs text-muted-foreground">
            {config.note || "Practice feedback on the four IELTS Speaking criteria. This is not an official IELTS band score."}
          </p>
          <div className="space-y-3">
            {config.rubric.map((row) => (
              <div key={row.criterion} className="rounded-xl border p-3 text-sm">
                <p className="font-semibold">{row.criterion}</p>
                {row.listenFor && row.listenFor.length > 0 ? (
                  <ul className="ml-5 mt-1 list-disc text-muted-foreground">
                    {row.listenFor.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                <dl className="mt-2 grid gap-1 sm:grid-cols-3">
                  {row.strong ? (
                    <div>
                      <dt className="font-medium">Strong</dt>
                      <dd className="text-muted-foreground">{row.strong}</dd>
                    </div>
                  ) : null}
                  {row.developing ? (
                    <div>
                      <dt className="font-medium">Developing</dt>
                      <dd className="text-muted-foreground">{row.developing}</dd>
                    </div>
                  ) : null}
                  {row.needsWork ? (
                    <div>
                      <dt className="font-medium">Needs work</dt>
                      <dd className="text-muted-foreground">{row.needsWork}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {studentFacing ? (
        <p className="text-xs text-muted-foreground">Practice only. This is not an official IELTS band score.</p>
      ) : null}
    </div>
  );
}
