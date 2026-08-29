import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetAssignment,
  getGetAssignmentQueryKey,
  useStartAttempt, 
  useGetAttempt, 
  useSaveAttemptResponse, 
  usePauseAttempt, 
  useResumeAttempt, 
  useSubmitAttempt,
  getGetAttemptQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Timer, Pause, Play, CheckCircle, ChevronLeft, ChevronRight, Lock, Flag, Brain } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export default function PortalAssignment() {
  const params = useParams();
  const assignmentId = params.assignmentId as string;
  const queryClient = useQueryClient();
  
  const { data: assignment, isLoading: loadingAssignment } = useGetAssignment(assignmentId, { query: { enabled: !!assignmentId, queryKey: getGetAssignmentQueryKey(assignmentId) } });
  
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const { data: attempt, isLoading: loadingAttempt } = useGetAttempt(attemptId!, { query: { enabled: !!attemptId, queryKey: getGetAttemptQueryKey(attemptId!) } });

  const startAttempt = useStartAttempt();
  const pauseAttempt = usePauseAttempt();
  const resumeAttempt = useResumeAttempt();
  const submitAttempt = useSubmitAttempt();
  const saveResponse = useSaveAttemptResponse();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [localResponses, setLocalResponses] = useState<Record<string, { prediction?: string, finalAnswer?: string, locked?: boolean, flagged?: boolean }>>({});
  
  const [timer, setTimer] = useState(0);

  // Sync attempt to local state
  useEffect(() => {
    if (attempt && attempt.status === 'active') {
      const respMap: any = {};
      attempt.responses.forEach(r => {
        respMap[r.questionId] = {
          prediction: r.prediction || "",
          finalAnswer: r.finalAnswer || "",
          locked: r.predictionLocked || false,
          flagged: r.flagged || false
        };
      });
      setLocalResponses(respMap);
      setTimer(attempt.activeSeconds);
    }
  }, [attempt]);

  // Local timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (attempt?.status === 'active') {
      interval = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [attempt?.status]);

  const handleStart = () => {
    startAttempt.mutate({ assignmentId }, {
      onSuccess: (data) => {
        setAttemptId(data.id);
      }
    });
  };

  const handlePause = () => {
    if (!attemptId) return;
    pauseAttempt.mutate({ attemptId }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetAttemptQueryKey(attemptId), data);
      }
    });
  };

  const handleResume = () => {
    if (!attemptId) return;
    resumeAttempt.mutate({ attemptId }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetAttemptQueryKey(attemptId), data);
      }
    });
  };

  const handleSubmit = () => {
    if (!attemptId) return;
    submitAttempt.mutate({ attemptId, data: { confirm: true } }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetAttemptQueryKey(attemptId) });
      }
    });
  };

  const updateResponse = (qId: string, updates: any) => {
    setLocalResponses(prev => ({
      ...prev,
      [qId]: { ...prev[qId], ...updates }
    }));
    
    // Auto-save debounced would be better, but we save immediately on blur/change for simplicity here
    if (attemptId) {
      const current = localResponses[qId] || {};
      saveResponse.mutate({
        attemptId,
        data: {
          questionId: qId,
          prediction: updates.prediction !== undefined ? updates.prediction : current.prediction,
          lockPrediction: updates.locked !== undefined ? updates.locked : current.locked,
          finalAnswer: updates.finalAnswer !== undefined ? updates.finalAnswer : current.finalAnswer,
          flagged: updates.flagged !== undefined ? updates.flagged : current.flagged,
          timeSpentSeconds: 0 // Track locally per question ideally
        }
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetAssignmentQueryKey(assignmentId)
          });
          queryClient.invalidateQueries({
            queryKey: getGetAttemptQueryKey(attemptId)
          });
        }
      });
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loadingAssignment || (!assignment && !attempt)) {
    return <div className="p-8"><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  }

  if (!assignment) return <div>Assignment not found</div>;

  // View: Instructions / Start
  if (!attemptId) {
    return (
      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in py-8">
        <Link href="/portal" className="text-sm text-muted-foreground hover:text-primary">&larr; Back to Dashboard</Link>
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="bg-primary/5 border-b pb-6">
            <Badge variant="outline" className="w-fit mb-4">{assignment.subject}</Badge>
            <CardTitle className="text-3xl font-bold">{assignment.title}</CardTitle>
            <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Timer className="w-4 h-4" /> {assignment.timeLimitMinutes} min limit</span>
              <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4" /> {assignment.questionCount} questions</span>
            </div>
          </CardHeader>
          <CardContent className="pt-6 prose dark:prose-invert">
            <p className="whitespace-pre-wrap">{assignment.instructions}</p>
          </CardContent>
          <CardFooter className="bg-muted/30 pt-6">
            <Button size="lg" onClick={handleStart} disabled={startAttempt.isPending} className="w-full text-lg rounded-full h-14 bg-gradient-brand hover:shadow-lg transition-all">
              {startAttempt.isPending ? "Starting..." : "Start Assignment"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (loadingAttempt || !attempt) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;

  // View: Paused
  if (attempt.status === 'paused') {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-in zoom-in-95">
        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
          <Pause className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="text-3xl font-bold">Attempt Paused</h2>
        <p className="text-muted-foreground text-lg max-w-md">Your timer and progress are saved. Question content is hidden while paused.</p>
        <Button size="lg" onClick={handleResume} disabled={resumeAttempt.isPending} className="rounded-full px-8 h-14 bg-primary text-primary-foreground">
          <Play className="w-5 h-5 mr-2" /> {resumeAttempt.isPending ? "Resuming..." : "Resume Assignment"}
        </Button>
      </div>
    );
  }

  // View: Submitted
  if (attempt.status === 'submitted') {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center space-y-6 animate-in slide-in-from-bottom-4">
        <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center mx-auto text-accent">
          <CheckCircle className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-bold">Assignment Submitted</h2>
        <p className="text-muted-foreground text-lg">Great job! Your responses have been saved.</p>
        <Link href="/portal">
          <Button variant="outline" size="lg" className="rounded-full mt-4">Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  // View: Active Attempt
  const question = assignment.questions[currentQuestionIndex];
  if (!question) return null;

  const currentResponse = localResponses[question.id] || {};
  const isPredictionLocked = currentResponse.locked || !question.predictionFirst;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Top Bar */}
      <div className="sticky top-16 z-30 bg-background/95 backdrop-blur-md py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-lg">Question {currentQuestionIndex + 1} of {assignment.questions.length}</span>
          <Button variant="ghost" size="sm" onClick={() => updateResponse(question.id, { flagged: !currentResponse.flagged })} className={currentResponse.flagged ? "text-destructive bg-destructive/10" : "text-muted-foreground"}>
            <Flag className="w-4 h-4 mr-2" /> {currentResponse.flagged ? "Flagged" : "Flag for Review"}
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <div className={`font-mono text-lg font-bold px-3 py-1 rounded-md ${timer > assignment.timeLimitMinutes * 60 * 0.9 ? "bg-destructive text-destructive-foreground" : "bg-muted text-foreground"}`}>
            {formatTime(timer)}
          </div>
          <Button variant="outline" size="sm" onClick={handlePause} disabled={pauseAttempt.isPending}>
            <Pause className="w-4 h-4 mr-2" /> Pause
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 pt-4">
        {/* Stimulus / Prompt */}
        <div className="space-y-6">
          {question.stimulus && (
            <Card className="bg-muted/30 shadow-none border-none">
              <CardContent className="p-6 prose dark:prose-invert">
                <p className="whitespace-pre-wrap">{question.stimulus}</p>
              </CardContent>
            </Card>
          )}
          <div className="text-lg font-medium leading-relaxed">
            {question.prompt}
          </div>
        </div>

        {/* Response Area */}
        <div className="space-y-6">
          {question.predictionFirst && (
            <Card className={`border-2 transition-colors ${!isPredictionLocked ? 'border-accent shadow-md shadow-accent/10' : 'border-muted opacity-80'}`}>
              <CardHeader className="py-4 bg-muted/20">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-accent" /> Prediction First
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <Textarea 
                  placeholder="Predict the answer before looking at choices..."
                  value={currentResponse.prediction || ""}
                  onChange={e => updateResponse(question.id, { prediction: e.target.value })}
                  disabled={isPredictionLocked}
                  className="min-h-[100px] resize-none"
                />
                {!isPredictionLocked && (
                  <div className="flex gap-3">
                    <Button onClick={() => updateResponse(question.id, { locked: true })} className="w-full bg-accent hover:bg-accent/90">
                      <Lock className="w-4 h-4 mr-2" /> Lock Prediction
                    </Button>
                    <Button variant="outline" onClick={() => updateResponse(question.id, { locked: true, prediction: "I don't know" })}>
                      I don't know
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isPredictionLocked && question.choices && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-4">
              <h3 className="font-semibold text-lg">Select your answer:</h3>
              {question.choices.map((choice, idx) => {
                const isSelected = currentResponse.finalAnswer === choice.id;
                return (
                  <button
                    key={choice.id}
                    onClick={() => updateResponse(question.id, { finalAnswer: choice.id })}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                      isSelected 
                        ? 'border-primary bg-primary/5 shadow-sm' 
                        : 'border-border hover:border-primary/40 hover:bg-muted/50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-medium ${
                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <div className="flex-1 text-base">{choice.text}</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Button 
            variant="outline" 
            size="lg"
            onClick={() => setCurrentQuestionIndex(i => Math.max(0, i - 1))}
            disabled={currentQuestionIndex === 0}
            className="rounded-full px-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" /> Previous
          </Button>

          {currentQuestionIndex < assignment.questions.length - 1 ? (
            <Button 
              size="lg"
              onClick={() => setCurrentQuestionIndex(i => Math.min(assignment.questions.length - 1, i + 1))}
              className="rounded-full px-8 bg-primary text-primary-foreground"
            >
              Next <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          ) : (
            <Button 
              size="lg"
              onClick={handleSubmit}
              disabled={submitAttempt.isPending}
              className="rounded-full px-8 bg-accent text-white hover:bg-accent/90 shadow-lg shadow-accent/20"
            >
              {submitAttempt.isPending ? "Submitting..." : "Submit Assignment"} <CheckCircle className="w-5 h-5 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}