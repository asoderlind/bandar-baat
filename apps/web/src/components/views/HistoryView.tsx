import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle, Clock, Trash2 } from "lucide-react";

export function HistoryView() {
  const queryClient = useQueryClient();

  const { data: stories, isLoading } = useQuery({
    queryKey: ["stories-history"],
    queryFn: () => api.getStories({ limit: 50 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (storyId: string) => api.deleteStory(storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories-history"] });
    },
  });

  const handleDelete = (storyId: string) => {
    deleteMutation.mutate(storyId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const completedStories = stories?.filter((s) => s.completedAt) || [];
  const inProgressStories = stories?.filter((s) => !s.completedAt) || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Story History</h1>
        <p className="text-muted-foreground mt-1">
          Re-read and practice with your previous stories
        </p>
      </div>

      {/* In Progress */}
      {inProgressStories.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            In Progress ({inProgressStories.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {inProgressStories.map((story) => (
              <StoryCard key={story.id} story={story} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          Completed ({completedStories.length})
        </h2>
        {completedStories.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No completed stories yet. Start learning to build your history!
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {completedStories.map((story) => (
              <StoryCard key={story.id} story={story} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StoryCard({
  story,
  onDelete,
}: {
  story: {
    id: string;
    title: string;
    topic: string | null;
    difficultyLevel: string;
    wordCount: number;
    completedAt: string | null;
    createdAt: string;
  };
  onDelete: (id: string) => void;
}) {
  const isCompleted = !!story.completedAt;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this story?")) {
      onDelete(story.id);
    }
  };

  return (
    <Link to={`/story/${story.id}`} className="block relative group">
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="text-lg flex-1">{story.title}</CardTitle>
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded",
                  story.difficultyLevel === "A1" &&
                    "bg-green-100 text-green-800",
                  story.difficultyLevel === "A2" && "bg-blue-100 text-blue-800",
                  story.difficultyLevel === "B1" &&
                    "bg-yellow-100 text-yellow-800",
                  story.difficultyLevel === "B2" && "bg-red-100 text-red-800",
                )}
              >
                {story.difficultyLevel}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-1">
            {story.topic && <p>Topic: {story.topic}</p>}
            <p>{story.wordCount} words</p>
            <p>
              {isCompleted
                ? `Completed ${new Date(story.completedAt!).toLocaleDateString()}`
                : `Started ${new Date(story.createdAt).toLocaleDateString()}`}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
