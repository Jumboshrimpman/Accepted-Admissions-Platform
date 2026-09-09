import { parseQuizContent } from "@/lib/quiz-content";

export function QuizContent({
  text,
  className,
  preClassName,
  imageClassName,
}: {
  text: string | null | undefined;
  className?: string;
  preClassName?: string;
  imageClassName?: string;
}) {
  const segments = parseQuizContent(text);
  if (segments.length === 0) return null;
  return (
    <div className={className} data-testid="quiz-content">
      {segments.map((segment, index) =>
        segment.type === "image" ? (
          <img
            key={`${segment.src}-${index}`}
            src={segment.src}
            alt={segment.alt || "Question figure"}
            className={
              imageClassName ??
              "mx-auto my-3 max-h-80 max-w-full rounded-xl bg-white object-contain p-2 shadow-sm"
            }
          />
        ) : segment.value.includes("\n") ? (
          <pre
            key={`pre-${index}`}
            className={preClassName ?? "whitespace-pre-wrap text-sm text-muted-foreground"}
          >
            {segment.value}
          </pre>
        ) : (
          <p key={`text-${index}`} className="leading-relaxed">
            {segment.value}
          </p>
        ),
      )}
    </div>
  );
}
