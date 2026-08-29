import { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetSession, useCreateCurriculumBlock, useUpdateCurriculumBlock, getGetSessionQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { ChevronRight, Plus, GripVertical, Save, Edit3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export default function TutorSession() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const queryClient = useQueryClient();
  
  const { data: session, isLoading, error } = useGetSession(sessionId, { query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) } });
  const createBlock = useCreateCurriculumBlock();
  const updateBlock = useUpdateCurriculumBlock();

  const [addingBlock, setAddingBlock] = useState(false);
  const [newBlockText, setNewBlockText] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/4 rounded-lg" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !session) return <div>Session not found</div>;

  const handleAddHeading = () => {
    if (!newBlockText) return;
    createBlock.mutate({
      sessionId,
      data: {
        kind: 'heading',
        visibility: 'student',
        config: { text: newBlockText },
        position: session.blocks.length
      }
    }, {
      onSuccess: () => {
        setAddingBlock(false);
        setNewBlockText("");
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
      }
    });
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in pb-20">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Link href="/tutor" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Dashboard
          </Link>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <Link href={`/tutor/courses/${session.courseId}`} className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Course
          </Link>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Edit Session</span>
        </div>
        
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">{session.title}</h1>
            <p className="text-muted-foreground">{format(parseISO(session.dateTime), "EEEE, MMMM d, yyyy 'at' h:mm a")}</p>
          </div>
          <Badge variant="outline" className="text-sm">{session.status}</Badge>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-primary" />
            Curriculum Builder
          </h2>
          <Button size="sm" onClick={() => setAddingBlock(true)} disabled={addingBlock} className="bg-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" /> Add Block
          </Button>
        </div>
        
        <div className="space-y-4">
          {session.blocks.length > 0 ? (
            session.blocks.map(block => (
              <Card key={block.id} className="border border-border/50 group">
                <CardContent className="p-4 flex gap-4">
                  <div className="cursor-grab text-muted-foreground/30 hover:text-foreground mt-1">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between items-start">
                      <Badge variant="secondary" className="text-xs uppercase tracking-wider">{block.kind}</Badge>
                      <Badge variant="outline" className="text-[10px]">{block.visibility}</Badge>
                    </div>
                    {block.kind === 'heading' && (
                      <h3 className="text-lg font-bold">{String(block.config.text || '')}</h3>
                    )}
                    {block.kind === 'rich_text' && (
                      <div className="text-muted-foreground line-clamp-2 text-sm whitespace-pre-wrap">{String(block.config.html || '')}</div>
                    )}
                    {block.kind !== 'heading' && block.kind !== 'rich_text' && (
                      <p className="text-sm text-muted-foreground italic">Config: {JSON.stringify(block.config)}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-12 border border-dashed rounded-xl bg-muted/10 text-muted-foreground">
              No curriculum blocks yet. Start building!
            </div>
          )}

          {addingBlock && (
            <Card className="border-accent shadow-md">
              <CardContent className="p-4 space-y-4">
                <h3 className="font-semibold text-accent">New Heading Block</h3>
                <Textarea 
                  placeholder="Enter heading text..." 
                  value={newBlockText}
                  onChange={e => setNewBlockText(e.target.value)}
                  className="resize-none"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setAddingBlock(false)}>Cancel</Button>
                  <Button onClick={handleAddHeading} disabled={!newBlockText || createBlock.isPending} className="bg-accent text-white hover:bg-accent/90">
                    <Save className="w-4 h-4 mr-2" /> {createBlock.isPending ? "Saving..." : "Save Block"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}