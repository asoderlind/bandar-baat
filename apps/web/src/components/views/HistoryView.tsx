import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CheckCircle, Clock } from "lucide-react";

export function HistoryView() {
  const { data: stories, isLoading } = useQuery({
    queryKey: ["stories-history"],
    queryFn: () => api.getStories({ limit: 50 }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const completedStories = stories?.filter((s) => s.completed_at) || [];
  const inProgressStories = stories?.filter((s) => !s.completed_at) || [];

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
              <StoryCard key={story.id} story={story} />
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
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StoryCard({
  story,
}: {
  story: {
    id: string;
    title: string;
    topic: string | null;
    difficulty_level: string;
    word_count: number;
    completed_at: string | null;
    created_at: string;
  };
}) {
  const isCompleted = !!story.completed_at;

  return (
    <Link to={`/story/${story.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg">{story.title}</CardTitle>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded",
                story.difficulty_level === "A1" &&
                  "bg-green-100 text-green-800",
                story.difficulty_level === "A2" && "bg-blue-100 text-blue-800",
                story.difficulty_level === "B1" &&
                  "bg-yellow-100 text-yellow-800",
                story.difficulty_level === "B2" && "bg-red-100 text-red-800",
              )}
            >
              {story.difficulty_level}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-1">
            {story.topic && <p>Topic: {story.topic}</p>}
            <p>{story.word_count} words</p>
            <p>
              {isCompleted
                ? `Completed ${new Date(story.completed_at!).toLocaleDateString()}`
                : `Started ${new Date(story.created_at).toLocaleDateString()}`}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
