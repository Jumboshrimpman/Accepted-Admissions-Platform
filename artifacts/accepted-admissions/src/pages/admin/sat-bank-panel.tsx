import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSatBankCollectionQueryKey,
  getListSatBankCollectionsQueryKey,
  getListSatBankQuestionsQueryKey,
  useAssignSatBankPrework,
  useGetSatBankCollection,
  useImportSatBank,
  useListSatBankCollections,
  useListSatBankQuestions,
} from "@workspace/api-client-react";
import { BookOpen, Download, Library } from "lucide-react";
import { adminCurriculumHref } from "@/lib/admin-curriculum-location";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function errorText(error: unknown): string {
  const data = (error as { data?: { error?: string } } | null)?.data;
  return data?.error || "The SAT/PSAT bank request could not be completed.";
}

export function SatBankPanel({
  collectionId,
  onOpenCollection,
}: {
  collectionId: string | null;
  onOpenCollection: (id: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const collections = useListSatBankCollections();
  const questions = useListSatBankQuestions(
    {},
    { query: { queryKey: getListSatBankQuestionsQueryKey() } },
  );
  const detail = useGetSatBankCollection(collectionId ?? "", {
    query: {
      enabled: Boolean(collectionId),
      queryKey: getGetSatBankCollectionQueryKey(collectionId ?? ""),
    },
  });
  const importBank = useImportSatBank();
  const [message, setMessage] = useState("");
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListSatBankCollectionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSatBankQuestionsQueryKey() });
    if (collectionId) {
      queryClient.invalidateQueries({ queryKey: getGetSatBankCollectionQueryKey(collectionId) });
    }
  };

  return (
    <div className="space-y-5" data-testid="sat-bank-panel">
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" /> SAT/PSAT question bank
          </CardTitle>
          <CardDescription>
            Canonical College Board source questions (SAT digital 4–11 + PSAT packs). Official
            explanations stay separate from AI notes. Import JSON/JSONL from{" "}
            <code>content/college-board/</code>. Skill/difficulty are null in these PDFs; figure-heavy
            items may have an empty stem. Do not recreate official wording.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {message ? <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{message}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={importBank.isPending}
              data-testid="import-sat-bank"
              onClick={() =>
                importBank.mutate(
                  { data: {} },
                  {
                    onSuccess: (result) => {
                      setMessage(
                        `Imported ${result.inserted} new and ${result.updated} updated questions from ${result.filesScanned} file(s). Collections staged: ${result.collectionsEnsured}.`,
                      );
                      refresh();
                    },
                    onError: (error) => setMessage(errorText(error)),
                  },
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {importBank.isPending ? "Importing…" : "Import staged extracts"}
            </Button>
            <p className="self-center text-xs text-muted-foreground">
              {questions.data?.length ?? 0} bank questions · {collections.data?.length ?? 0} source
              collections
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Source collections</CardTitle>
            <CardDescription>Open a College Board test in original order.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(collections.data ?? []).map((collection) => (
              <button
                key={collection.id}
                type="button"
                data-testid={`sat-bank-collection-${collection.slug}`}
                className={`w-full rounded-xl border p-3 text-left ${
                  collectionId === collection.id ? "border-primary bg-primary/5" : "bg-background"
                }`}
                onClick={() => onOpenCollection(collection.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{collection.title}</p>
                  <Badge variant="outline">{collection.extractStatus}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {collection.questionCount} questions · {collection.officialExplanationCount} official
                  explanations · {collection.assets.length} linked files
                </p>
              </button>
            ))}
            {(collections.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Import the 15 official JSONL packs to create SAT Practice Test 4–11 and the PSAT
                collections.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {detail.data?.title ?? "Collection preview"}
            </CardTitle>
            <CardDescription>
              {detail.data
                ? "Original order. Linked PDFs are paths/URLs, not recreated content."
                : "Choose a collection to see its questions."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.data?.assets.map((asset) => (
              <p key={asset.id} className="text-xs text-muted-foreground">
                {asset.kind.replaceAll("_", " ")}: {asset.resourceUrl || "path pending"}
              </p>
            ))}
            {(detail.data?.questions ?? []).map((question, index) => (
              <div
                key={question.id}
                className="rounded-lg border p-3"
                data-testid={`sat-bank-question-${question.sourceKey}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Q{index + 1}</Badge>
                  <Badge variant="outline">{question.section === "rw" ? "R&W" : "Math"}</Badge>
                  <Badge variant="outline">{question.skill || "Skill not in PDF"}</Badge>
                  {question.questionType === "spr" ? <Badge variant="outline">SPR</Badge> : null}
                  {question.assignable === false ? (
                    <Badge variant="outline">Figure/choices incomplete</Badge>
                  ) : null}
                  {question.sourceKind === "seed" ? (
                    <Badge variant="outline">Seed fixture</Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm">
                  {question.prompt ||
                    "Prompt was not recovered from this figure-heavy PDF page. Official explanation is on file; do not invent the stem."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {question.sourceKey} · {question.estimatedSeconds}s
                  {question.hasOfficialExplanation ? " · official explanation on file" : " · official explanation pending"}
                  {question.assignable === false ? " · not used in 60-min pre-work until enriched" : ""}
                </p>
              </div>
            ))}
            {collectionId && !detail.isLoading && (detail.data?.questions.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                No extract rows yet for this test. PDF OCR is still pending if only source files were
                staged.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">
        Assign a ~60 minute set from Sessions.{" "}
        <Link href={adminCurriculumHref({ section: "sessions" })} className="text-primary underline">
          Open sessions
        </Link>
        .
      </p>
    </div>
  );
}

export function AssignBankPreworkControl({
  sessionId,
  collections,
  onChanged,
}: {
  sessionId: string;
  collections: Array<{ id: string; title: string; questionCount: number }>;
  onChanged: () => void;
}) {
  const assign = useAssignSatBankPrework();
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? "");
  const [homeworkKind, setHomeworkKind] = useState<"routine" | "diagnostic">("routine");
  const [message, setMessage] = useState("");
  return (
    <div className="mt-3 space-y-2" data-testid={`assign-bank-prework-${sessionId}`}>
      <p className="text-sm font-medium">
        {homeworkKind === "diagnostic" ? "Full-length diagnostic pre-work" : "60-minute bank pre-work"}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          aria-label="SAT bank collection for 60-minute pre-work"
          className="h-9 max-w-md rounded-md border bg-background px-2 text-xs"
          value={collectionId}
          onChange={(event) => setCollectionId(event.target.value)}
        >
          <option value="">Mixed unused bank (time target)</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.title}
              {collection.questionCount ? ` · ${collection.questionCount} Q` : " · extract pending"}
            </option>
          ))}
        </select>
        <select
          aria-label="Homework type"
          className="h-9 rounded-md border bg-background px-2 text-xs"
          value={homeworkKind}
          onChange={(event) => setHomeworkKind(event.target.value as "routine" | "diagnostic")}
        >
          <option value="routine">Routine (no SAT score)</option>
          <option value="diagnostic">Diagnostic (estimated only)</option>
        </select>
        <Button
          size="sm"
          disabled={assign.isPending}
          onClick={() =>
            assign.mutate(
              {
                sessionId,
                data: {
                  collectionId: collectionId || null,
                  homeworkKind,
                  ...(homeworkKind === "routine" ? { targetMinutes: 60 } : {}),
                },
              },
              {
                onSuccess: (result) => {
                  setMessage(
                    `Assigned ${result.questionCount} questions (~${Math.round(result.estimatedSeconds / 60)} min). ${
                      result.extractIncomplete
                        ? "Some official explanations are still pending."
                        : "Official explanations stay on the bank records."
                    }`,
                  );
                  onChanged();
                },
                onError: (error) => setMessage(errorText(error)),
              },
            )
          }
        >
          <BookOpen className="mr-2 h-4 w-4" />
          {assign.isPending
            ? "Assigning…"
            : homeworkKind === "diagnostic"
              ? "Assign full diagnostic"
              : "Assign 60-min pre-work"}
        </Button>
      </div>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
