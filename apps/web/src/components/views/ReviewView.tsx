import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Volume2 } from "lucide-react";

export function ReviewView() {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [, setAudioUrl] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: reviews, isLoading } = useQuery({
    queryKey: ["reviews-due"],
    queryFn: () => api.getDueReviews(20),
  });

  const playAudio = useCallback(async (text: string) => {
    try {
      setIsLoadingAudio(true);
      const { audioUrl: url } = await api.synthesizeHindi(text);
      const fullUrl = api.getAudioUrl(url.split("/").pop()!);
      setAudioUrl(fullUrl);
      if (audioRef.current) {
        audioRef.current.src = fullUrl;
        await audioRef.current.play();
      }
    } catch (err) {
      console.error("Audio playback failed:", err);
    } finally {
      setIsLoadingAudio(false);
    }
  }, []);

  // Auto-play audio when a new card is shown
  useEffect(() => {
    if (reviews && reviews[currentIndex]) {
      playAudio(reviews[currentIndex].hindi);
    }
  }, [currentIndex, reviews, playAudio]);

  const submitMutation = useMutation({
    mutationFn: ({ wordId, quality }: { wordId: string; quality: number }) =>
      api.submitReview(wordId, quality),
    onSuccess: (_, variables) => {
      if (variables.quality >= 3) {
        setCorrectCount((c) => c + 1);
      }

      if (currentIndex + 1 >= (reviews?.length || 0)) {
        setSessionComplete(true);
        queryClient.invalidateQueries({ queryKey: ["reviews-due"] });
        queryClient.invalidateQueries({ queryKey: ["review-summary"] });
        queryClient.invalidateQueries({ queryKey: ["user-stats"] });
      } else {
        setCurrentIndex((i) => i + 1);
        setShowAnswer(false);
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-6 py-12">
        <div className="text-6xl">🎉</div>
        <h1 className="text-2xl font-bold">All Caught Up!</h1>
        <p className="text-muted-foreground">
          No words are due for review right now. Come back later!
        </p>
        <Button onClick={() => (window.location.href = "/")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (sessionComplete) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-6 py-12">
        <div className="text-6xl">✅</div>
        <h1 className="text-2xl font-bold">Review Complete!</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-lg">
              You reviewed <span className="font-bold">{reviews.length}</span>{" "}
              words
            </p>
            <p className="text-muted-foreground">
              {correctCount} correct (
              {Math.round((correctCount / reviews.length) * 100)}%)
            </p>
          </CardContent>
        </Card>
        <Button onClick={() => (window.location.href = "/")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const currentReview = reviews[currentIndex];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress */}
      <div>
        <div className="flex justify-between text-sm mb-2">
          <span>Review Progress</span>
          <span>
            {currentIndex + 1} / {reviews.length}
          </span>
        </div>
        <Progress value={((currentIndex + 1) / reviews.length) * 100} />
      </div>

      {/* Review Card */}
      <Card className="min-h-[350px]">
        <CardContent className="pt-6 flex flex-col items-center min-h-[350px]">
          {/* Hidden audio element */}
          <audio ref={audioRef} />

          {!showAnswer ? (
            <>
              <div className="flex-1 flex flex-col items-center justify-center w-full">
                <div className="hindi-large text-4xl text-center mb-4">
                  {currentReview.hindi}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mb-4"
                  onClick={() => playAudio(currentReview.hindi)}
                  disabled={isLoadingAudio}
                >
                  <Volume2
                    className={`h-6 w-6 ${isLoadingAudio ? "animate-pulse" : ""}`}
                  />
                </Button>
              </div>
              <div className="w-full mt-auto">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => setShowAnswer(true)}
                >
                  Show Answer
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 flex flex-col items-center justify-center w-full">
                <div className="hindi-large text-4xl text-center mb-2">
                  {currentReview.hindi}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mb-2"
                  onClick={() => playAudio(currentReview.hindi)}
                  disabled={isLoadingAudio}
                >
                  <Volume2
                    className={`h-6 w-6 ${isLoadingAudio ? "animate-pulse" : ""}`}
                  />
                </Button>
                <div className="text-lg text-muted-foreground mb-2">
                  {currentReview.romanized}
                </div>
                <div className="text-2xl font-medium">
                  {currentReview.english}
                </div>
              </div>

              {/* Rating buttons (SM-2 quality scale) */}
              <div className="grid grid-cols-4 gap-2 w-full mt-auto pt-6">
                <Button
                  variant="destructive"
                  onClick={() =>
                    submitMutation.mutate({
                      wordId: currentReview.wordId,
                      quality: 0,
                    })
                  }
                  disabled={submitMutation.isPending}
                >
                  Again
                  <span className="text-xs block opacity-70">1 min</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    submitMutation.mutate({
                      wordId: currentReview.wordId,
                      quality: 2,
                    })
                  }
                  disabled={submitMutation.isPending}
                >
                  Hard
                  <span className="text-xs block opacity-70">10 min</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    submitMutation.mutate({
                      wordId: currentReview.wordId,
                      quality: 4,
                    })
                  }
                  disabled={submitMutation.isPending}
                >
                  Good
                  <span className="text-xs block opacity-70">1 day</span>
                </Button>
                <Button
                  onClick={() =>
                    submitMutation.mutate({
                      wordId: currentReview.wordId,
                      quality: 5,
                    })
                  }
                  disabled={submitMutation.isPending}
                >
                  Easy
                  <span className="text-xs block opacity-70">4 days</span>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Status: {currentReview.status}</span>
        <span>Familiarity: {Math.round(currentReview.familiarity * 100)}%</span>
      </div>
    </div>
  );
}
