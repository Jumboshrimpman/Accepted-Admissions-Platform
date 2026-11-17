import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  assignPhotosToQuestions,
  canPreviewInline,
  dueLabel,
  MATH_VIDEO_UPLOAD_CONCURRENCY,
  submitReadiness,
  uploadMimeType,
  uploadProblem,
  youtubeVideoIdFromUrl,
} from "@/lib/async-math-videos";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiPath(path: string): string {
  return `${basePath}${path}`;
}

type FileView = {
  id: string;
  filename: string;
  mimeType: string;
  bytes: number;
  contentUrl: string;
  driveWebViewLink?: string | null;
};
type ItemView = { index: number; text: string; files: FileView[] };
type VideoView = { videoId: string; url: string; embedUrl: string; thumbnailUrl: string };
type QuizView = { assignmentId: string; title: string; status: string; href: string | null };
type RequestView = {
  id: string;
  status: "draft" | "submitted" | "delivered" | "cancelled";
  items: ItemView[];
  orphanFiles: { id: string; filename: string; itemIndex: number }[];
  questionCount: number;
  createdAt: string;
  submittedAt: string | null;
  dueAt: string | null;
  overdue: boolean;
  deliveredAt: string | null;
  tutorName: string;
  clientName?: string;
  clientEmail?: string | null;
  driveFolderUrl?: string;
  video: VideoView | null;
  followUpQuiz: QuizView | null;
  tutorNote: string | null;
};
type Rules = { minQuestions: number; maxQuestions: number; recommendedCredits: number; turnaroundHours: number };
type Enrollment = {
  clientUserId: string;
  clientName: string;
  clientEmail: string;
  tutorName: string;
  enabled: boolean;
  offerEndsAt: string;
  credits: number;
};
type Overview =
  | { enabled: false }
  | {
      enabled: true;
      audience: "student";
      rules: Rules;
      uploadsConfigured: boolean;
      offer: { open: boolean; endsAt: string };
      credits: number;
      draft: RequestView | null;
      requests: RequestView[];
    }
  | { enabled: true; audience: "tutor"; rules: Rules; requests: RequestView[] }
  | {
      enabled: true;
      audience: "admin";
      rules: Rules;
      uploadsConfigured: boolean;
      enrollments: Enrollment[];
      requests: RequestView[];
    };

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || "Something went wrong. Try again.";
}

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_LABEL: Record<RequestView["status"], string> = {
  draft: "Not sent yet",
  submitted: "With your tutor",
  delivered: "Video ready",
  cancelled: "Cancelled",
};

// ------------------------------------------------------------------ shared pieces

/** Thumbnail first; the iframe (youtube-nocookie) only loads after a click. */
export function VideoPlayer({ video, title }: { video: VideoView; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="space-y-2" data-testid={`math-video-player-${video.videoId}`}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`${video.embedUrl}&autoplay=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="group absolute inset-0 h-full w-full"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${title}`}
            data-testid={`math-video-play-${video.videoId}`}
          >
            <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover opacity-90 group-hover:opacity-100" loading="lazy" />
            <span className="absolute left-1/2 top-1/2 flex h-14 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg">
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <a
        className="inline-flex items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`math-video-open-${video.videoId}`}
      >
        Open on YouTube ↗
      </a>
    </div>
  );
}

function FileThumb({ file, onRemove }: { file: FileView; onRemove?: () => void }) {
  const src = apiPath(file.contentUrl);
  return (
    <div className="relative w-24" data-testid={`math-video-file-${file.id}`}>
      <a href={src} target="_blank" rel="noopener noreferrer" className="block h-24 w-24 overflow-hidden rounded-lg border bg-muted">
        {canPreviewInline(file.mimeType) ? (
          <img src={src} alt={file.filename} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] text-muted-foreground">
            {file.mimeType === "application/pdf" ? "PDF" : "Photo"}
            <br />
            {file.filename.slice(0, 24)}
          </span>
        )}
      </a>
      {file.driveWebViewLink ? (
        <a className="mt-1 block text-[11px] text-muted-foreground underline" href={file.driveWebViewLink} target="_blank" rel="noopener noreferrer">
          Drive
        </a>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          className="absolute -right-2 -top-2 h-6 w-6 rounded-full border bg-background text-xs shadow"
          aria-label={`Remove ${file.filename}`}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function QuestionsReadOnly({ request }: { request: RequestView }) {
  return (
    <ol className="space-y-3">
      {request.items.map((item) => (
        <li key={item.index} className="rounded-lg border p-3 text-sm">
          <p className="font-medium">Question {item.index + 1}</p>
          {item.text ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.text}</p> : null}
          {item.files.length ? (
            <div className="mt-2 flex flex-wrap gap-3">
              {item.files.map((file) => (
                <FileThumb key={file.id} file={file} />
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ student

function HowItWorks({ rules, tutorName }: { rules: Rules; tutorName: string }) {
  return (
    <div className="space-y-3 text-sm" data-testid="math-video-how-it-works">
      <p>
        To help you work through challenging SAT Math questions between live sessions, {tutorName} will also offer
        personalized video explanations.
      </p>
      <div>
        <p className="font-semibold">How it works</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium">Submission:</span> Upload {rules.minQuestions}–{rules.maxQuestions} SAT Math
            questions or concepts through the portal.
          </li>
          <li>
            <span className="font-medium">Video and Quiz:</span> Within {rules.turnaroundHours} hours of your submission,{" "}
            {tutorName} will upload your video explanation and the accompanying follow-up practice quiz in the portal.{" "}
            {tutorName}&apos;s 10–30-minute video will walk through your questions, explain key concepts, and demonstrate
            additional practice problems.
          </li>
        </ul>
      </div>
      <div>
        <p className="font-semibold">Logistics</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>We recommend you start with {rules.recommendedCredits} question credits (1 credit = 1 question).</li>
          <li>Each question submitted uses one credit, and you can distribute your credits across multiple video requests.</li>
          <li>
            Each video request must include a minimum of {rules.minQuestions} and a maximum of {rules.maxQuestions}{" "}
            questions to ensure an appropriate amount of content for recording.
          </li>
          <li>You can submit questions throughout the week as you encounter challenging topics.</li>
          <li>Your video explanations and follow-up quizzes will be available in your portal.</li>
        </ul>
      </div>
    </div>
  );
}

type Uploading = { key: string; itemIndex: number; name: string; error?: string };

function DraftComposer({
  draft,
  rules,
  credits,
  offerOpen,
  uploadsConfigured,
  onChanged,
}: {
  draft: RequestView;
  rules: Rules;
  credits: number;
  offerOpen: boolean;
  uploadsConfigured: boolean;
  onChanged: () => void;
}) {
  const [texts, setTexts] = useState<string[]>(() => draft.items.map((item) => item.text));
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const bulkInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTexts((current) => {
      if (current.length === draft.items.length) return current;
      return draft.items.map((item, index) => current[index] ?? item.text);
    });
  }, [draft.items]);

  const filesByItem = (index: number) => draft.items[index]?.files ?? [];
  const itemsForCheck = texts.map((text, index) => ({ text, fileCount: filesByItem(index).length }));
  const readiness = submitReadiness({
    items: itemsForCheck,
    credits,
    minQuestions: rules.minQuestions,
    maxQuestions: rules.maxQuestions,
    offerOpen,
    uploading: uploading.some((entry) => !entry.error),
  });

  const saveItems = useCallback(
    async (next: string[]) => {
      const response = await fetch(apiPath(`/api/math-videos/requests/${draft.id}/items`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: next.map((text) => ({ text })) }),
      });
      if (!response.ok) setMessage(await readError(response));
    },
    [draft.id],
  );

  const uploadMany = async (entries: { file: File; itemIndex: number }[]) => {
    setMessage("");
    const problems: string[] = [];
    const queue = entries.filter(({ file }) => {
      const problem = uploadProblem(file);
      if (problem) problems.push(problem);
      return !problem;
    });
    if (problems.length) setMessage(problems.join(" "));
    const tagged = queue.map((entry, position) => ({ ...entry, key: `${Date.now()}-${position}-${entry.file.name}` }));
    setUploading((current) => [...current, ...tagged.map(({ key, itemIndex, file }) => ({ key, itemIndex, name: file.name }))]);
    let cursor = 0;
    const worker = async () => {
      while (cursor < tagged.length) {
        const entry = tagged[cursor++]!;
        const params = new URLSearchParams({ item: String(entry.itemIndex), filename: entry.file.name });
        try {
          const response = await fetch(apiPath(`/api/math-videos/requests/${draft.id}/files?${params.toString()}`), {
            method: "POST",
            headers: { "Content-Type": uploadMimeType(entry.file) ?? "application/octet-stream" },
            body: entry.file,
          });
          if (!response.ok) {
            const error = await readError(response);
            setUploading((current) => current.map((row) => (row.key === entry.key ? { ...row, error } : row)));
            continue;
          }
          setUploading((current) => current.filter((row) => row.key !== entry.key));
        } catch {
          setUploading((current) =>
            current.map((row) => (row.key === entry.key ? { ...row, error: "Upload failed. Check your connection." } : row)),
          );
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(MATH_VIDEO_UPLOAD_CONCURRENCY, tagged.length) }, worker));
    onChanged();
  };

  const addPhotosToQuestion = (itemIndex: number, files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    void uploadMany(Array.from(files).map((file) => ({ file, itemIndex })));
  };

  /** One photo per question. Adds questions as needed, up to the max. */
  const addPhotosAsQuestions = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const plan = assignPhotosToQuestions({
      items: itemsForCheck,
      photoCount: list.length,
      maxQuestions: rules.maxQuestions,
    });
    if (plan.itemCount !== texts.length) {
      const next = [...texts, ...Array.from({ length: plan.itemCount - texts.length }, () => "")];
      setTexts(next);
      await saveItems(next);
    }
    const entries = list
      .map((file, index) => ({ file, itemIndex: plan.targets[index] }))
      .filter((entry): entry is { file: File; itemIndex: number } => entry.itemIndex !== null);
    if (entries.length < list.length) {
      setMessage(`Only ${rules.maxQuestions} questions fit in one request. Start another request for the rest.`);
    }
    await uploadMany(entries);
  };

  const removeFile = async (fileId: string) => {
    const response = await fetch(apiPath(`/api/math-videos/requests/${draft.id}/files/${fileId}`), { method: "DELETE" });
    if (!response.ok) setMessage(await readError(response));
    onChanged();
  };

  const addQuestion = async () => {
    if (texts.length >= rules.maxQuestions) return;
    const next = [...texts, ""];
    setTexts(next);
    await saveItems(next);
    onChanged();
  };

  const removeQuestion = async (index: number) => {
    if (filesByItem(index).length > 0) {
      setMessage("Remove this question's photos first.");
      return;
    }
    if (draft.items.slice(index + 1).some((item) => item.files.length > 0)) {
      setMessage("Remove photos from the questions below first, or clear this question's text instead.");
      return;
    }
    const next = texts.filter((_, position) => position !== index);
    setTexts(next);
    await saveItems(next);
    onChanged();
  };

  const submit = async () => {
    if (!readiness.ready) return;
    if (!window.confirm(`Submit ${readiness.count} questions? This uses ${readiness.count} question credits.`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(apiPath(`/api/math-videos/requests/${draft.id}/submit`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: textsRef.current.map((text) => ({ text })) }),
      });
      if (!response.ok) {
        setMessage(await readError(response));
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!window.confirm("Discard this unsent request? No credits are used.")) return;
    const response = await fetch(apiPath(`/api/math-videos/requests/${draft.id}`), { method: "DELETE" });
    if (!response.ok) setMessage(await readError(response));
    onChanged();
  };

  const onDrop = (itemIndex: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    addPhotosToQuestion(itemIndex, event.dataTransfer.files);
  };

  return (
    <div className="space-y-4 rounded-xl border p-4" data-testid="math-video-draft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">New video request</p>
        {uploadsConfigured ? (
          <>
            <input
              ref={bulkInput}
              type="file"
              accept="image/*,.heic,.heif,application/pdf"
              multiple
              className="hidden"
              data-testid="math-video-bulk-input"
              onChange={(event) => {
                void addPhotosAsQuestions(event.target.files);
                event.target.value = "";
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => bulkInput.current?.click()} data-testid="math-video-bulk-button">
              Add photos (one per question)
            </Button>
          </>
        ) : null}
      </div>
      {!uploadsConfigured ? (
        <p className="text-sm text-muted-foreground">Photo uploads aren&apos;t switched on yet. Type or paste each question for now.</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Take photos with your phone or choose them from your library. Drop several onto a question if it spans more than one page.
        </p>
      )}
      <ol className="space-y-3">
        {texts.map((text, index) => (
          <li key={index} className="rounded-lg border p-3" data-testid={`math-video-item-${index}`}>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={uploadsConfigured ? onDrop(index) : undefined}
              className="space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Question {index + 1}</p>
                <button type="button" className="text-xs text-muted-foreground underline" onClick={() => void removeQuestion(index)}>
                  Remove
                </button>
              </div>
              <Textarea
                value={text}
                placeholder="Optional if you add a photo: question number, source, or the concept you're stuck on"
                aria-label={`Question ${index + 1} note`}
                rows={2}
                onChange={(event) => {
                  const next = [...texts];
                  next[index] = event.target.value;
                  setTexts(next);
                }}
                onBlur={() => void saveItems(textsRef.current)}
              />
              <div className="flex flex-wrap items-start gap-3">
                {filesByItem(index).map((file) => (
                  <FileThumb key={file.id} file={file} onRemove={() => void removeFile(file.id)} />
                ))}
                {uploading
                  .filter((entry) => entry.itemIndex === index)
                  .map((entry) => (
                    <div key={entry.key} className="flex h-24 w-24 items-center justify-center rounded-lg border p-2 text-center text-[11px]">
                      {entry.error ? <span className="text-destructive">{entry.error}</span> : <span>Uploading {entry.name.slice(0, 18)}…</span>}
                    </div>
                  ))}
                {uploadsConfigured ? (
                  <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-lg border border-dashed text-center text-xs text-muted-foreground">
                    + Photo
                    <input
                      type="file"
                      accept="image/*,.heic,.heif,application/pdf"
                      multiple
                      className="sr-only"
                      data-testid={`math-video-item-input-${index}`}
                      onChange={(event) => {
                        addPhotosToQuestion(index, event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {draft.orphanFiles.length ? (
        <p className="text-sm text-destructive">
          {draft.orphanFiles.length} photo(s) belong to a removed question. Add the question back or ask for help.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={texts.length >= rules.maxQuestions} onClick={() => void addQuestion()}>
          Add question
        </Button>
        <Button type="button" disabled={!readiness.ready || busy} onClick={() => void submit()} data-testid="math-video-submit">
          Submit {readiness.count} question{readiness.count === 1 ? "" : "s"} · uses {readiness.count} credit{readiness.count === 1 ? "" : "s"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void discard()}>
          Discard
        </Button>
      </div>
      {readiness.reason ? <p className="text-sm text-muted-foreground" data-testid="math-video-readiness">{readiness.reason}</p> : null}
      {message ? (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function StudentRequest({ request }: { request: RequestView }) {
  return (
    <div className="space-y-3 rounded-xl border p-4 text-sm" data-testid={`math-video-request-${request.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">
            {request.questionCount} questions · sent {when(request.submittedAt)}
          </p>
          {request.status === "submitted" && request.dueAt ? (
            <p className="text-muted-foreground">Your video and quiz are due by {when(request.dueAt)}.</p>
          ) : null}
        </div>
        <Badge variant={request.status === "delivered" ? "default" : "outline"}>{STATUS_LABEL[request.status]}</Badge>
      </div>
      {request.status === "delivered" && request.video ? (
        <VideoPlayer video={request.video} title={`${request.tutorName}'s video explanation`} />
      ) : null}
      {request.status === "delivered" && request.followUpQuiz?.href ? (
        <a
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          href={apiPath(request.followUpQuiz.href)}
          data-testid={`math-video-quiz-${request.id}`}
        >
          Start follow-up quiz: {request.followUpQuiz.title}
        </a>
      ) : null}
      {request.tutorNote ? <p className="whitespace-pre-wrap rounded-lg bg-muted p-3">{request.tutorNote}</p> : null}
      <details>
        <summary className="cursor-pointer text-muted-foreground">Your questions</summary>
        <div className="mt-2">
          <QuestionsReadOnly request={request} />
        </div>
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ tutor / admin

function DeliveryForm({ request, admin, onChanged }: { request: RequestView; admin: boolean; onChanged: () => void }) {
  const [youtubeUrl, setYoutubeUrl] = useState(request.video?.url ?? "");
  const [quizId, setQuizId] = useState(request.followUpQuiz?.assignmentId ?? "");
  const [note, setNote] = useState(request.tutorNote ?? "");
  const [quizzes, setQuizzes] = useState<{ id: string; title: string; status: string }[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const previewId = youtubeVideoIdFromUrl(youtubeUrl);

  const loadQuizzes = useCallback(() => {
    fetch(apiPath(`/api/math-videos/requests/${request.id}/quiz-options`))
      .then(async (response) => (response.ok ? ((await response.json()) as { quizzes: typeof quizzes }).quizzes : []))
      .then((rows) => setQuizzes(rows ?? []))
      .catch(() => setQuizzes([]));
  }, [request.id]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  const save = async (): Promise<boolean> => {
    setMessage("");
    const response = await fetch(apiPath(`/api/math-videos/requests/${request.id}/delivery`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeUrl, followUpAssignmentId: quizId, tutorNote: note }),
    });
    if (!response.ok) {
      setMessage(await readError(response));
      return false;
    }
    return true;
  };

  const deliver = async () => {
    setBusy(true);
    try {
      if (!(await save())) return;
      const response = await fetch(apiPath(`/api/math-videos/requests/${request.id}/deliver`), { method: "POST" });
      if (!response.ok) {
        setMessage(await readError(response));
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel this request and give the student their credits back?")) return;
    const response = await fetch(apiPath(`/api/math-videos/requests/${request.id}/cancel`), { method: "POST" });
    if (!response.ok) setMessage(await readError(response));
    onChanged();
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3" data-testid={`math-video-delivery-${request.id}`}>
      <label className="block text-sm font-medium">
        Unlisted YouTube link
        <Input
          className="mt-1"
          value={youtubeUrl}
          placeholder="https://youtu.be/…"
          onChange={(event) => setYoutubeUrl(event.target.value)}
          data-testid={`math-video-youtube-${request.id}`}
        />
      </label>
      {youtubeUrl && !previewId ? <p className="text-xs text-destructive">That doesn&apos;t look like a YouTube video link.</p> : null}
      {previewId ? (
        <div className="max-w-sm">
          <VideoPlayer
            video={{
              videoId: previewId,
              url: `https://www.youtube.com/watch?v=${previewId}`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${previewId}?rel=0&modestbranding=1`,
              thumbnailUrl: `https://i.ytimg.com/vi/${previewId}/hqdefault.jpg`,
            }}
            title="Video preview"
          />
        </div>
      ) : null}
      <label className="block text-sm font-medium">
        Follow-up practice quiz
        <select
          className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={quizId}
          onChange={(event) => setQuizId(event.target.value)}
          data-testid={`math-video-quiz-select-${request.id}`}
        >
          <option value="">Choose a quiz assigned to this student…</option>
          {(quizzes ?? []).map((quiz) => (
            <option key={quiz.id} value={quiz.id}>
              {quiz.title}
              {quiz.status === "published" ? "" : " (draft — publish before delivering)"}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        Build the quiz in the usual quiz builder for this student and publish it, then{" "}
        <button type="button" className="underline" onClick={loadQuizzes}>
          refresh this list
        </button>
        .
      </p>
      <label className="block text-sm font-medium">
        Note to the student (optional)
        <Textarea className="mt-1" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void save().then((ok) => ok && onChanged())}>
          Save
        </Button>
        {request.status === "submitted" ? (
          <Button type="button" size="sm" disabled={busy || !previewId || !quizId} onClick={() => void deliver()} data-testid={`math-video-deliver-${request.id}`}>
            Mark delivered
          </Button>
        ) : null}
        {admin && request.status === "submitted" ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => void cancel()}>
            Cancel and refund credits
          </Button>
        ) : null}
      </div>
      {message ? (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function QueueRequest({ request, admin, onChanged }: { request: RequestView; admin: boolean; onChanged: () => void }) {
  const open = request.status === "submitted";
  return (
    <details className="rounded-xl border p-4 text-sm" open={open} data-testid={`math-video-queue-${request.id}`}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          {request.clientName} · {request.questionCount} questions
          {admin ? <span className="font-normal text-muted-foreground"> · {request.tutorName}</span> : null}
        </span>
        <span className="flex items-center gap-2">
          {open ? (
            <Badge variant={request.overdue ? "destructive" : "outline"} data-testid={`math-video-due-${request.id}`}>
              {dueLabel(request.dueAt)} · {when(request.dueAt)}
            </Badge>
          ) : null}
          <Badge variant={request.status === "delivered" ? "default" : "secondary"}>
            {request.status === "submitted" ? "To record" : request.status === "delivered" ? "Delivered" : "Cancelled"}
          </Badge>
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-muted-foreground">
          Sent {when(request.submittedAt)}
          {request.deliveredAt ? ` · delivered ${when(request.deliveredAt)}` : ""}
          {admin && request.clientEmail ? ` · ${request.clientEmail}` : ""}
          {admin && request.driveFolderUrl ? (
            <>
              {" · "}
              <a className="underline" href={request.driveFolderUrl} target="_blank" rel="noopener noreferrer">
                Drive folder
              </a>
            </>
          ) : null}
        </p>
        <QuestionsReadOnly request={request} />
        {request.status !== "cancelled" ? <DeliveryForm request={request} admin={admin} onChanged={onChanged} /> : null}
      </div>
    </details>
  );
}

function AdminEnrollments({ enrollments, rules, onChanged }: { enrollments: Enrollment[]; rules: Rules; onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [grants, setGrants] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const call = async (path: string, method: string, body: unknown) => {
    setMessage("");
    const response = await fetch(apiPath(path), {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) setMessage(await readError(response));
    onChanged();
  };

  return (
    <div className="space-y-3" data-testid="math-video-enrollments">
      <p className="font-semibold">Students</p>
      {enrollments.length === 0 ? <p className="text-sm text-muted-foreground">No student is set up yet.</p> : null}
      {enrollments.map((row) => (
        <div key={row.clientUserId} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
          <div className="min-w-48 flex-1">
            <p className="font-medium">{row.clientName}</p>
            <p className="text-muted-foreground">
              {row.clientEmail} · {row.tutorName} · closes {when(row.offerEndsAt)}
            </p>
          </div>
          <Badge variant={row.enabled ? "default" : "outline"}>{row.enabled ? "Visible to student" : "Hidden"}</Badge>
          <span className="font-medium">{row.credits} credits</span>
          <Input
            className="w-20"
            inputMode="numeric"
            aria-label={`Credits to add for ${row.clientName}`}
            value={grants[row.clientUserId] ?? String(rules.recommendedCredits)}
            onChange={(event) => setGrants({ ...grants, [row.clientUserId]: event.target.value })}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void call("/api/math-videos/credits", "POST", {
                clientUserId: row.clientUserId,
                credits: Number(grants[row.clientUserId] ?? rules.recommendedCredits),
                note: "Granted from the admin dashboard",
              })
            }
          >
            Add credits
          </Button>
          <Button
            type="button"
            size="sm"
            variant={row.enabled ? "ghost" : "default"}
            onClick={() => {
              if (!row.enabled && !window.confirm(`Show SAT Math video requests to ${row.clientName}?`)) return;
              void call("/api/math-videos/enrollments", "PUT", { clientUserId: row.clientUserId, enabled: !row.enabled });
            }}
          >
            {row.enabled ? "Hide" : "Show to student"}
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Student email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!email.trim()}
          onClick={() => {
            void call("/api/math-videos/enrollments", "PUT", { email: email.trim(), enabled: false });
            setEmail("");
          }}
        >
          Add student (hidden)
        </Button>
      </div>
      {message ? (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ panel

export function AsyncMathVideosPanel({ mode }: { mode: "student" | "tutor" | "admin" }) {
  const [data, setData] = useState<Overview | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    fetch(apiPath("/api/math-videos"))
      .then(async (response) => (response.ok ? ((await response.json()) as Overview) : ({ enabled: false } as const)))
      .then(setData)
      .catch(() => setData({ enabled: false }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data || !data.enabled) return null;
  if (mode === "student" && data.audience !== "student") return null;
  if (mode === "tutor" && data.audience !== "tutor") return null;
  if (mode === "admin" && data.audience !== "admin") return null;

  if (data.audience === "student") {
    const tutorName = data.draft?.tutorName ?? data.requests[0]?.tutorName ?? "Xavier";
    const start = async () => {
      setStarting(true);
      setMessage("");
      try {
        const response = await fetch(apiPath("/api/math-videos/requests"), { method: "POST" });
        if (!response.ok) setMessage(await readError(response));
        load();
      } finally {
        setStarting(false);
      }
    };
    return (
      <Card data-testid="math-videos-student">
        <CardHeader>
          <CardTitle>SAT Math Video Explanations</CardTitle>
          <CardDescription>
            Asynchronous, until {new Date(data.offer.endsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
            ·{" "}
            <span className="font-medium text-foreground" data-testid="math-video-credits">
              {data.credits} question credit{data.credits === 1 ? "" : "s"} left
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <details open={data.requests.length === 0 && !data.draft}>
            <summary className="cursor-pointer text-sm font-medium">How it works</summary>
            <div className="mt-2">
              <HowItWorks rules={data.rules} tutorName={tutorName.split(/\s+/)[0] ?? tutorName} />
            </div>
          </details>
          {data.draft ? (
            <DraftComposer
              key={data.draft.id}
              draft={data.draft}
              rules={data.rules}
              credits={data.credits}
              offerOpen={data.offer.open}
              uploadsConfigured={data.uploadsConfigured}
              onChanged={load}
            />
          ) : data.offer.open ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" disabled={starting || data.credits < data.rules.minQuestions} onClick={() => void start()} data-testid="math-video-start">
                Start a video request
              </Button>
              {data.credits < data.rules.minQuestions ? (
                <p className="text-sm text-muted-foreground">
                  You need at least {data.rules.minQuestions} question credits to send a request.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Video requests closed after Dec 5. Your videos and quizzes stay here.</p>
          )}
          {data.requests.map((request) => (
            <StudentRequest key={request.id} request={request} />
          ))}
          {message ? (
            <p className="text-sm text-destructive" role="alert">
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const admin = data.audience === "admin";
  const openCount = data.requests.filter((request) => request.status === "submitted").length;
  return (
    <Card data-testid={`math-videos-${data.audience}`}>
      <CardHeader>
        <CardTitle>SAT Math video requests{openCount ? ` (${openCount} to record)` : ""}</CardTitle>
        <CardDescription>
          Each request is due {data.rules.turnaroundHours} hours after it is sent. Add the unlisted YouTube link and a published
          follow-up quiz, then mark it delivered.
          {admin && !data.uploadsConfigured ? " Google Drive is not connected, so students can only type their questions." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {admin ? <AdminEnrollments enrollments={data.enrollments} rules={data.rules} onChanged={load} /> : null}
        {data.requests.length === 0 ? <p className="text-sm text-muted-foreground">No video requests yet.</p> : null}
        {data.requests.map((request) => (
          <QueueRequest key={request.id} request={request} admin={admin} onChanged={load} />
        ))}
      </CardContent>
    </Card>
  );
}
