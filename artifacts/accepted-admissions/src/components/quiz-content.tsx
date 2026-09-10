import {
  parseQuizContent,
  readFigurePrimaryPresentation,
  type FigurePrimaryQuestionFields,
} from "@/lib/quiz-content";

const DEFAULT_IMAGE_CLASS =
  "mx-auto my-3 h-auto max-h-[min(44rem,85vh)] w-auto max-w-full rounded-xl bg-white object-contain p-2 shadow-sm";

export function QuizFigurePrimary({
  src,
  className,
  imageClassName,
}: {
  src: string;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <div className={`max-w-full overflow-x-auto overflow-y-visible ${className ?? ""}`} data-testid="quiz-figure-primary">
      <img
        src={src}
        alt="Question and choices"
        className={imageClassName ?? DEFAULT_IMAGE_CLASS}
      />
    </div>
  );
}

export function QuizStem({
  question,
  className,
  stimulusClassName,
  imageClassName,
}: {
  question: FigurePrimaryQuestionFields;
  className?: string;
  stimulusClassName?: string;
  imageClassName?: string;
}) {
  const figurePrimary = readFigurePrimaryPresentation(question);
  if (figurePrimary.enabled && figurePrimary.src) {
    return (
      <QuizFigurePrimary src={figurePrimary.src} className={className} imageClassName={imageClassName} />
    );
  }
  return (
    <>
      {question.stimulus ? (
        <QuizContent text={question.stimulus} className={stimulusClassName} imageClassName={imageClassName} />
      ) : null}
      <QuizContent text={question.prompt} className={className} imageClassName={imageClassName} />
    </>
  );
}

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
    <div className={`min-w-0 max-w-full overflow-x-auto overflow-y-visible ${className ?? ""}`} data-testid="quiz-content">
      {segments.map((segment, index) =>
        segment.type === "image" ? (
          <img
            key={`${segment.src}-${index}`}
            src={segment.src}
            alt={segment.alt || "Question figure"}
            className={imageClassName ?? DEFAULT_IMAGE_CLASS}
          />
        ) : segment.value.includes("\n") ? (
          <pre
            key={`pre-${index}`}
            className={preClassName ?? "min-w-0 overflow-x-auto whitespace-pre-wrap break-words text-sm text-muted-foreground"}
          >
            {segment.value}
          </pre>
        ) : (
          <p key={`text-${index}`} className="max-w-full whitespace-normal break-words leading-relaxed">
            {segment.value}
          </p>
        ),
      )}
    </div>
  );
}
