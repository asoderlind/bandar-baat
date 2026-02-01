import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BookOpen, RefreshCw, Flame, BookA } from "lucide-react";

export function DashboardView() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["user-stats"],
    queryFn: () => api.getStats(),
  });

  const { data: reviewSummary } = useQuery({
    queryKey: ["review-summary"],
    queryFn: () => api.getReviewSummary(),
  });

  const { data: storyInfo } = useQuery({
    queryKey: ["story-ready"],
    queryFn: () => api.getReadyStoryInfo(),
  });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-bold">
          <span className="hindi-text">नमस्ते</span>! Welcome back
        </h1>
        <p className="text-muted-foreground mt-1">
          Continue your Hindi learning journey
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Words Known</CardTitle>
            <BookA className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.words_known || 0}</div>
            <p className="text-xs text-muted-foreground">
              Level: {stats?.level || "A1"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Current Streak
            </CardTitle>
            <Flame className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.streak_days || 0} days
            </div>
            <p className="text-xs text-muted-foreground">Keep it going!</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Reviews Due</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reviewSummary?.words_due || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {reviewSummary?.words_reviewed_today || 0} reviewed today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* New Story Card */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              New Story
            </CardTitle>
            <CardDescription>
              {storyInfo?.ready
                ? `Ready! ${storyInfo.new_words_available} new words available`
                : "Generate a personalized story at your level"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {storyInfo && (
              <div className="mb-4">
                <p className="text-sm text-muted-foreground mb-2">
                  Topic: {storyInfo.suggested_topic}
                </p>
                <p className="text-sm text-muted-foreground">
                  Difficulty: {storyInfo.level}
                </p>
              </div>
            )}
            <Link to="/story">
              <Button className="w-full">Start Learning →</Button>
            </Link>
          </CardContent>
        </Card>

        {/* Review Card */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Review Due
            </CardTitle>
            <CardDescription>
              {reviewSummary?.words_due
                ? `${reviewSummary.words_due} words waiting for review`
                : "All caught up! Come back later."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reviewSummary && reviewSummary.words_due > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Today's progress</span>
                  <span>{reviewSummary.words_reviewed_today} reviewed</span>
                </div>
                <Progress
                  value={Math.min(
                    100,
                    (reviewSummary.words_reviewed_today / 20) * 100,
                  )}
                />
              </div>
            )}
            <Link to="/review">
              <Button
                variant="outline"
                className="w-full"
                disabled={!reviewSummary?.words_due}
              >
                {reviewSummary?.words_due ? "Start Review →" : "No reviews due"}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/history">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="text-lg">📚 Past Stories</CardTitle>
              <CardDescription>
                Re-read or practice with previous stories
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/vocabulary">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="text-lg">📖 Vocabulary</CardTitle>
              <CardDescription>
                Browse and search your word collection
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
