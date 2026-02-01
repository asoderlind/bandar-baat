import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Story, type StorySentence, type Exercise } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type StoryStep = "preview" | "read" | "exercises" | "complete";

export function StoryView() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<StoryStep>("preview");
  const [displayMode, setDisplayMode] = useState<"hindi" | "roman" | "english">(
    "hindi",
  );
  const [selectedWord, setSelectedWord] = useState<{
    hindi: string;
    romanized: string;
    english: string;
  } | null>(null);
  const [currentExercise, setCurrentExercise] = useState(0);
  const [exerciseAnswer, setExerciseAnswer] = useState("");
  const [exerciseResult, setExerciseResult] = useState<{
    correct: boolean;
    feedback?: string;
  } | null>(null);
  const [topic, setTopic] = useState("");

  // Fetch existing story or generate new one
  const { data: story, isLoading: storyLoading } = useQuery({
    queryKey: ["story", storyId],
    queryFn: () => (storyId ? api.getStory(storyId) : Promise.resolve(null)),
    enabled: !!storyId,
  });

  // Fetch exercises for story
  const { data: exercises } = useQuery({
    queryKey: ["story-exercises", story?.id],
    queryFn: () => api.getStoryExercises(story!.id),
    enabled: !!story?.id,
  });

  // Generate story mutation
  const generateMutation = useMutation({
    mutationFn: (params: { topic?: string }) => api.generateStory(params),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      navigate(`/story/${data.id}`, { replace: true });
      setStep("preview");
    },
  });

  // Complete story mutation
  const completeMutation = useMutation({
    mutationFn: (rating?: number) => api.completeStory(story!.id, rating),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story", story?.id] });
      queryClient.invalidateQueries({ queryKey: ["user-stats"] });
      setStep("complete");
    },
  });

  // Submit exercise mutation
  const submitExerciseMutation = useMutation({
    mutationFn: ({
      exerciseId,
      answer,
    }: {
      exerciseId: string;
      answer: string;
    }) => api.submitExercise(exerciseId, answer),
    onSuccess: (data) => {
      setExerciseResult({
        correct: data.is_correct,
        feedback: data.feedback || undefined,
      });
    },
  });

  // If no story ID, show generation form
  if (!storyId && !generateMutation.isPending) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Generate New Story</h1>
          <p className="text-muted-foreground mt-1">
            Create a personalized story based on your vocabulary level
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Story Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Topic (optional)
              </label>
              <Input
                placeholder="e.g., at the market, meeting a friend, ordering food..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={() =>
                generateMutation.mutate({ topic: topic || undefined })
              }
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Generating story with Claude...
                </>
              ) : (
                "Generate Story →"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (storyLoading || generateMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-muted-foreground">
          {generateMutation.isPending
            ? "Claude is writing your story..."
            : "Loading story..."}
        </p>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Story not found</p>
        <Button className="mt-4" onClick={() => navigate("/story")}>
          Generate New Story
        </Button>
      </div>
    );
  }

  // Preview new words step
  if (step === "preview") {
    const newWords = story.sentences
      .flatMap((s) => s.words)
      .filter((w) => w.is_new)
      .filter((w, i, arr) => arr.findIndex((x) => x.hindi === w.hindi) === i);

    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold">{story.title}</h1>
          <p className="text-muted-foreground">
            Topic: {story.topic || "General"}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New words in this story</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {newWords.map((word, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-accent rounded-lg"
              >
                <div>
                  <div className="hindi-text text-xl text-primary">
                    {word.hindi}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {word.romanized}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{word.english}</div>
                  {word.part_of_speech && (
                    <div className="text-xs text-muted-foreground">
                      {word.part_of_speech}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Button className="w-full" onClick={() => setStep("read")}>
          Got it, show story →
        </Button>
      </div>
    );
  }

  // Read story step
  if (step === "read") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold hindi-text">{story.title}</h1>
          <Tabs
            value={displayMode}
            onValueChange={(v) => setDisplayMode(v as typeof displayMode)}
          >
            <TabsList>
              <TabsTrigger value="hindi">देवनागरी</TabsTrigger>
              <TabsTrigger value="roman">Roman</TabsTrigger>
              <TabsTrigger value="english">English</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="story-content space-y-6">
              {story.sentences.map((sentence, i) => (
                <SentenceDisplay
                  key={i}
                  sentence={sentence}
                  displayMode={displayMode}
                  onWordClick={setSelectedWord}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Word tooltip */}
        {selectedWord && (
          <Card className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 shadow-lg">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="hindi-text text-xl">{selectedWord.hindi}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedWord.romanized}
                  </div>
                  <div className="font-medium mt-1">{selectedWord.english}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedWord(null)}
                >
                  ✕
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-4">
          <Button variant="outline" onClick={() => setStep("preview")}>
            ← Back to words
          </Button>
          <Button className="flex-1" onClick={() => setStep("exercises")}>
            Continue to exercises →
          </Button>
        </div>
      </div>
    );
  }

  // Exercises step
  if (step === "exercises" && exercises) {
    const exercise = exercises[currentExercise];

    if (!exercise) {
      // All exercises done
      return (
        <div className="max-w-2xl mx-auto text-center space-y-6 py-12">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl font-bold">Exercises Complete!</h1>
          <p className="text-muted-foreground">
            Great job! You've practiced all the exercises for this story.
          </p>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={() => setStep("read")}>
              Re-read Story
            </Button>
            <Button onClick={() => completeMutation.mutate()}>
              Complete Session →
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium">
            Exercise {currentExercise + 1} of {exercises.length}
          </h2>
          <span className="text-sm text-muted-foreground">
            {exercise.type.replace("_", " ")}
          </span>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-lg">{exercise.question.prompt}</p>
            {exercise.question.context && (
              <p className="text-muted-foreground italic">
                "{exercise.question.context}"
              </p>
            )}

            {exercise.options ? (
              <div className="grid gap-2">
                {exercise.options.map((option, i) => (
                  <Button
                    key={i}
                    variant={exerciseAnswer === option ? "default" : "outline"}
                    className="justify-start text-left h-auto py-3"
                    onClick={() => setExerciseAnswer(option)}
                    disabled={!!exerciseResult}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            ) : (
              <Input
                value={exerciseAnswer}
                onChange={(e) => setExerciseAnswer(e.target.value)}
                placeholder="Type your answer..."
                disabled={!!exerciseResult}
              />
            )}

            {exerciseResult && (
              <div
                className={cn(
                  "p-4 rounded-lg",
                  exerciseResult.correct
                    ? "bg-green-100 dark:bg-green-900/20"
                    : "bg-red-100 dark:bg-red-900/20",
                )}
              >
                <p className="font-medium">
                  {exerciseResult.correct ? "✅ Correct!" : "❌ Not quite"}
                </p>
                {exerciseResult.feedback && (
                  <p className="text-sm mt-1">{exerciseResult.feedback}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-4">
          {!exerciseResult ? (
            <Button
              className="flex-1"
              disabled={!exerciseAnswer || submitExerciseMutation.isPending}
              onClick={() =>
                submitExerciseMutation.mutate({
                  exerciseId: exercise.id,
                  answer: exerciseAnswer,
                })
              }
            >
              Submit Answer
            </Button>
          ) : (
            <Button
              className="flex-1"
              onClick={() => {
                setCurrentExercise((c) => c + 1);
                setExerciseAnswer("");
                setExerciseResult(null);
              }}
            >
              Next Exercise →
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Complete step
  if (step === "complete") {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-6 py-12">
        <div className="text-6xl">✅</div>
        <h1 className="text-2xl font-bold">Session Complete!</h1>
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p>Words learned: {story.target_new_word_ids.length}</p>
            <p>Story: {story.title}</p>
          </CardContent>
        </Card>
        <p className="text-muted-foreground">
          New words will appear in review tomorrow.
        </p>
        <Button onClick={() => navigate("/")}>Back to Dashboard</Button>
      </div>
    );
  }

  return null;
}

function SentenceDisplay({
  sentence,
  displayMode,
  onWordClick,
}: {
  sentence: StorySentence;
  displayMode: "hindi" | "roman" | "english";
  onWordClick: (word: {
    hindi: string;
    romanized: string;
    english: string;
  }) => void;
}) {
  if (displayMode === "english") {
    return <p className="text-lg">{sentence.english}</p>;
  }

  return (
    <div className="sentence">
      <p className={cn("text-lg", displayMode === "hindi" && "hindi-text")}>
        {sentence.words.map((word, i) => (
          <span
            key={i}
            className={cn(word.is_new ? "word-new" : "word-known")}
            onClick={() => onWordClick(word)}
          >
            {displayMode === "hindi" ? word.hindi : word.romanized}
            {i < sentence.words.length - 1 && " "}
          </span>
        ))}
      </p>
      {displayMode === "hindi" && (
        <p className="text-sm text-muted-foreground mt-1">
          {sentence.romanized}
        </p>
      )}
      {sentence.grammar_notes.length > 0 && (
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
          ℹ️ {sentence.grammar_notes.join(" • ")}
        </p>
      )}
    </div>
  );
}
