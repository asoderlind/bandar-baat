import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type StorySentence } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn, getGenderClass } from "@/lib/utils";

import { Volume2, VolumeX, Loader2 } from "lucide-react";

type StoryStep = "preview" | "read" | "exercises" | "complete";

const STAGE_TO_STEP: Record<string, StoryStep> = {
  intro: "preview",
  show: "read",
  questions: "exercises",
  complete: "complete",
};

const STEP_TO_STAGE: Record<StoryStep, string> = {
  preview: "intro",
  read: "show",
  exercises: "questions",
  complete: "complete",
};

export function StoryView() {
  const { storyId, stage } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Derive step from URL stage param
  const stepFromUrl: StoryStep = (stage && STAGE_TO_STEP[stage]) || "preview";
  const [step, setStepInternal] = useState<StoryStep>(stepFromUrl);

  // Sync step when URL stage changes
  useEffect(() => {
    if (storyId && stage && STAGE_TO_STEP[stage]) {
      setStepInternal(STAGE_TO_STEP[stage]);
    } else if (storyId && !stage) {
      setStepInternal("preview");
    }
  }, [storyId, stage]);

  // Navigate to the correct URL when step changes
  const setStep = useCallback(
    (newStep: StoryStep) => {
      setStepInternal(newStep);
      if (storyId) {
        navigate(`/story/${storyId}/${STEP_TO_STAGE[newStep]}`, {
          replace: true,
        });
      }
    },
    [storyId, navigate],
  );
  const [displayMode, setDisplayMode] = useState<"hindi" | "english">("hindi");
  const [selectedWord, setSelectedWord] = useState<{
    hindi: string;
    romanized: string;
    english: string;
    partOfSpeech?: string;
    gender?: string;
    isNew?: boolean;
    position?: { x: number; y: number };
    loading?: boolean;
  } | null>(null);
  const [currentExercise, setCurrentExercise] = useState(0);
  const [exerciseAnswer, setExerciseAnswer] = useState("");
  const [exerciseResult, setExerciseResult] = useState<{
    correct: boolean;
    feedback?: string;
  } | null>(null);
  const [topic, setTopic] = useState("");
  const [storyMode, setStoryMode] = useState<"generate" | "import">("generate");
  const [importText, setImportText] = useState("");

  // Cache for dictionary lookups to avoid repeated API calls
  const dictCacheRef = useRef<
    Map<
      string,
      {
        romanized: string;
        english: string;
        partOfSpeech?: string;
      }
    >
  >(new Map());

  // Audio playback state
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play audio for a word, sentence, or full text
  const playAudio = useCallback(
    async (text: string, opts?: { slow?: boolean; rate?: number }) => {
      const effectiveRate = opts?.rate ?? (opts?.slow ? 0.75 : speakingRate);
      const audioKey = `${text}-${effectiveRate}`;

      // Stop current audio if playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        if (playingAudio === audioKey) {
          setPlayingAudio(null);
          return;
        }
      }

      setLoadingAudio(audioKey);
      try {
        const result = await api.synthesizeHindi(text, {
          speakingRate: effectiveRate,
        });
        const audio = new Audio(result.audioUrl);
        audioRef.current = audio;

        audio.onplay = () => {
          setLoadingAudio(null);
          setPlayingAudio(audioKey);
        };
        audio.onended = () => {
          setPlayingAudio(null);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setLoadingAudio(null);
          setPlayingAudio(null);
          audioRef.current = null;
        };

        await audio.play();
      } catch (error) {
        console.error("Failed to play audio:", error);
        setLoadingAudio(null);
        setPlayingAudio(null);
      }
    },
    [playingAudio, speakingRate],
  );

  // Dictionary lookup for unannotated words
  useEffect(() => {
    if (!selectedWord?.loading) return;

    const word = selectedWord.hindi;

    // Check cache first
    const cached = dictCacheRef.current.get(word);
    if (cached) {
      setSelectedWord((prev) =>
        prev ? { ...prev, ...cached, loading: false } : null,
      );
      return;
    }

    let cancelled = false;
    api
      .lookupWord(word)
      .then((result) => {
        if (cancelled) return;
        let english = "";
        let partOfSpeech: string | undefined;
        if (result.found && result.definitions.length > 0) {
          const def = result.definitions[0];
          english = def.meanings.slice(0, 3).join("; ");
          partOfSpeech = def.partOfSpeech;
        }

        const resolved = {
          romanized: result.romanized || "",
          english: english || "(no definition found)",
          partOfSpeech,
        };

        // Cache it
        dictCacheRef.current.set(word, resolved);

        setSelectedWord((prev) =>
          prev && prev.hindi === word
            ? { ...prev, ...resolved, loading: false }
            : prev,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedWord((prev) =>
          prev && prev.hindi === word
            ? {
                ...prev,
                romanized: "",
                english: "(lookup failed)",
                loading: false,
              }
            : prev,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [selectedWord?.loading, selectedWord?.hindi]);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        // Check if clicked on a word (has cursor-pointer class)
        const target = e.target as HTMLElement;
        if (!target.closest(".cursor-pointer")) {
          setSelectedWord(null);
        }
      }
    };

    if (selectedWord) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [selectedWord]);

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
    mutationFn: (params: { topic?: string }) =>
      api.generateStory(params),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      navigate(`/story/${data.id}/intro`, { replace: true });
    },
  });

  // Import story mutation
  const importMutation = useMutation({
    mutationFn: (params: { text: string; topic?: string }) =>
      api.importStory(params),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      navigate(`/story/${data.id}/intro`, { replace: true });
    },
  });

  // Complete story mutation
  const completeMutation = useMutation({
    mutationFn: (rating?: number) => api.completeStory(story!.id, rating),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story", story?.id] });
      queryClient.invalidateQueries({ queryKey: ["user-stats"] });
      if (story?.id) {
        navigate(`/story/${story.id}/complete`, { replace: true });
      }
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
        correct: data.isCorrect,
        feedback: data.feedback || undefined,
      });
    },
  });

  // If no story ID, show generation/import form
  if (
    !storyId &&
    !generateMutation.isPending &&
    !importMutation.isPending
  ) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold">New Story</h1>
          <p className="text-muted-foreground mt-1">
            Generate a personalized story or import your own Hindi text
          </p>
        </div>

        <Tabs
          value={storyMode}
          onValueChange={(v) => setStoryMode(v as "generate" | "import")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>

          <TabsContent value="generate">
            <Card>
              <CardHeader>
                <CardTitle>Generate Story</CardTitle>
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
                    generateMutation.mutate({
                      topic: topic || undefined,
                    })
                  }
                  disabled={generateMutation.isPending}
                >
                  Generate Story →
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="import">
            <Card>
              <CardHeader>
                <CardTitle>Import Hindi Text</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Paste Devanagari text
                  </label>
                  <textarea
                    className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 hindi-text text-lg"
                    placeholder="यहाँ हिंदी पाठ चिपकाएँ..."
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Paste any Hindi story or text in Devanagari script. It will
                    be analyzed and annotated for your learning level.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Topic (optional)
                  </label>
                  <Input
                    placeholder="e.g., daily life, travel..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() =>
                    importMutation.mutate({
                      text: importText,
                      topic: topic || undefined,
                    })
                  }
                  disabled={!importText.trim() || importMutation.isPending}
                >
                  Import & Process Story →
                </Button>
                {importMutation.isError && (
                  <p className="text-sm text-destructive">
                    {importMutation.error?.message || "Import failed"}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  if (storyLoading || generateMutation.isPending || importMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-muted-foreground">
          {generateMutation.isPending
            ? "Claude is writing your story..."
            : importMutation.isPending
              ? "Claude is processing your text..."
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
      .filter((w) => w.isNew)
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
                  <div className={cn("hindi-text text-xl", getGenderClass(word.partOfSpeech, word.gender) || "text-primary")}>
                    {word.hindi}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {word.romanized}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{word.english}</div>
                  {word.partOfSpeech && (
                    <div className="text-xs text-muted-foreground">
                      {word.partOfSpeech}
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
    // Check if story has parsed sentences or needs to use raw content
    const hasSentences = story.sentences && story.sentences.length > 0;

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold hindi-text">{story.title}</h1>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => playAudio(story.contentHindi)}
              disabled={
                loadingAudio === `${story.contentHindi}-${speakingRate}`
              }
            >
              {loadingAudio === `${story.contentHindi}-${speakingRate}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : playingAudio === `${story.contentHindi}-${speakingRate}` ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
              {playingAudio === `${story.contentHindi}-${speakingRate}`
                ? "Stop"
                : "Listen"}
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Speed
              </span>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.25}
                value={speakingRate}
                onChange={(e) => setSpeakingRate(Number(e.target.value))}
                className="w-20 accent-primary"
              />
              <span className="text-xs font-medium w-8">{speakingRate}×</span>
            </div>
            <Tabs
              value={displayMode}
              onValueChange={(v) => setDisplayMode(v as typeof displayMode)}
            >
              <TabsList>
                <TabsTrigger value="hindi">देवनागरी</TabsTrigger>
                <TabsTrigger value="english">English</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="story-content prose prose-lg dark:prose-invert max-w-none">
              {hasSentences ? (
                <StoryProse
                  sentences={story.sentences}
                  displayMode={displayMode}
                  speakingRate={speakingRate}
                  playingAudio={playingAudio}
                  loadingAudio={loadingAudio}
                  onPlaySentence={(text) => playAudio(text)}
                  onWordClick={(word) => {
                    setSelectedWord(word);
                    playAudio(word.hindi);
                  }}
                />
              ) : (
                // Fallback for stories without parsed sentences
                <div className="text-lg whitespace-pre-wrap">
                  {displayMode === "hindi" && (
                    <p className="hindi-text">
                      {story.contentHindi || "Content not available"}
                    </p>
                  )}
                  {displayMode === "english" && (
                    <p>{story.contentEnglish || "Content not available"}</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Word tooltip */}
        {selectedWord && (
          <Card
            ref={tooltipRef}
            className="fixed z-50 shadow-lg border-2 w-72"
            style={{
              left: selectedWord.position
                ? Math.min(
                    Math.max(16, selectedWord.position.x - 144),
                    window.innerWidth - 304,
                  )
                : 16,
              top: selectedWord.position
                ? Math.min(selectedWord.position.y, window.innerHeight - 180)
                : 100,
            }}
          >
            <CardContent className="p-4">
              <div className="flex justify-between items-start gap-2">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("hindi-text text-2xl font-semibold", getGenderClass(selectedWord.partOfSpeech, selectedWord.gender))}>
                      {selectedWord.hindi}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        playAudio(selectedWord.hindi);
                      }}
                      disabled={
                        loadingAudio === `${selectedWord.hindi}-${speakingRate}`
                      }
                    >
                      {loadingAudio ===
                      `${selectedWord.hindi}-${speakingRate}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : playingAudio ===
                        `${selectedWord.hindi}-${speakingRate}` ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {selectedWord.loading ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Looking up…
                      </span>
                    </div>
                  ) : (
                    <>
                      {selectedWord.romanized && (
                        <div className="text-sm text-muted-foreground italic">
                          {selectedWord.romanized}
                        </div>
                      )}
                      <div className="font-medium text-lg">
                        {selectedWord.english}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {selectedWord.partOfSpeech && (
                          <span className="text-xs text-muted-foreground">
                            {selectedWord.partOfSpeech}
                          </span>
                        )}
                        {selectedWord.isNew && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            New word
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 -mt-1 -mr-1"
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
            <Button onClick={() => completeMutation.mutate(undefined)}>
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
            <p>Words learned: {story.targetNewWordIds.length}</p>
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

function StoryProse({
  sentences,
  displayMode,
  speakingRate,
  playingAudio,
  loadingAudio,
  onPlaySentence,
  onWordClick,
}: {
  sentences: StorySentence[];
  displayMode: "hindi" | "english";
  speakingRate: number;
  playingAudio: string | null;
  loadingAudio: string | null;
  onPlaySentence: (text: string) => void;
  onWordClick: (word: {
    hindi: string;
    romanized: string;
    english: string;
    partOfSpeech?: string;
    gender?: string;
    isNew?: boolean;
    position?: { x: number; y: number };
    loading?: boolean;
  }) => void;
}) {
  // Helper to detect if a sentence is dialogue (starts with speaker: or contains quotes)
  const isDialogue = (text: string): boolean => {
    return /^[A-Za-z\u0900-\u097F]+:/.test(text.trim()) || /[""]/.test(text);
  };

  // Helper to render clickable words in Hindi text
  const renderClickableText = (sentence: StorySentence) => {
    const text = sentence.hindi;
    if (!text) return null;

    // Create a map for word lookup (strip punctuation for matching)
    const wordMap = new Map<string, (typeof sentence.words)[0]>();
    sentence.words.forEach((word) => {
      // Add multiple forms for matching
      wordMap.set(word.hindi, word);
      // Strip common punctuation for matching
      const stripped = word.hindi.replace(/[।,?""\-—!।॥]/g, "");
      if (stripped) wordMap.set(stripped, word);
    });

    // Split by word boundaries, keeping delimiters
    const parts = text.split(/(\s+|[,।?""\-—!।॥]+)/);

    return parts.map((part, i) => {
      const trimmed = part.replace(/[।,?""\-—!।॥]+/g, "").trim();
      const word = wordMap.get(trimmed) || wordMap.get(part.trim());

      if (word) {
        // Annotated word — show tooltip immediately
        return (
          <span
            key={i}
            className={cn(
              "cursor-pointer hover:bg-primary/20 rounded px-0.5 transition-colors",
              getGenderClass(word.partOfSpeech, word.gender) ||
                (word.isNew
                  ? "text-primary font-medium underline decoration-dotted underline-offset-4"
                  : "hover:text-primary"),
              word.isNew && getGenderClass(word.partOfSpeech, word.gender) &&
                "font-medium underline decoration-dotted underline-offset-4",
            )}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onWordClick({
                ...word,
                position: {
                  x: rect.left + rect.width / 2,
                  y: rect.bottom + 8,
                },
              });
            }}
          >
            {part}
          </span>
        );
      }

      // Non-annotated word — make clickable if it contains Devanagari
      const hasDevanagari = /[\u0900-\u097F]/.test(trimmed);
      if (hasDevanagari && trimmed.length > 0) {
        return (
          <span
            key={i}
            className="cursor-pointer hover:bg-muted rounded px-0.5 transition-colors"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onWordClick({
                hindi: trimmed,
                romanized: "",
                english: "",
                position: {
                  x: rect.left + rect.width / 2,
                  y: rect.bottom + 8,
                },
                loading: true,
              });
            }}
          >
            {part}
          </span>
        );
      }

      return <span key={i}>{part}</span>;
    });
  };

  // Group sentences into paragraphs (dialogue on own lines, narrative grouped)
  const renderContent = () => {
    if (displayMode === "english") {
      // For English mode, group consecutive narration sentences into paragraphs
      const elements: React.ReactElement[] = [];
      let currentParagraph: string[] = [];

      sentences.forEach((sentence, i) => {
        const text = sentence.english;
        const dialogue = isDialogue(text);

        if (dialogue) {
          // Flush current paragraph before dialogue
          if (currentParagraph.length > 0) {
            elements.push(
              <p
                key={`para-${elements.length}`}
                className="text-lg leading-relaxed mb-4"
              >
                {currentParagraph.join(" ")}
              </p>,
            );
            currentParagraph = [];
          }

          // Render dialogue on its own line
          elements.push(
            <p
              key={i}
              className="text-lg leading-relaxed pl-4 border-l-2 border-primary/30 my-3"
            >
              {text}
            </p>,
          );
        } else {
          // Accumulate narration sentences
          currentParagraph.push(text);
        }
      });

      // Flush remaining paragraph
      if (currentParagraph.length > 0) {
        elements.push(
          <p
            key={`para-${elements.length}`}
            className="text-lg leading-relaxed mb-4"
          >
            {currentParagraph.join(" ")}
          </p>,
        );
      }

      return elements;
    }

    // For Hindi mode, group consecutive narration sentences into paragraphs
    const elements: React.ReactElement[] = [];
    let currentParagraph: { sentence: StorySentence; index: number }[] = [];

    sentences.forEach((sentence, i) => {
      const dialogue = isDialogue(sentence.hindi);

      if (dialogue) {
        // Flush current paragraph before dialogue
        if (currentParagraph.length > 0) {
          elements.push(
            <p
              key={`para-${elements.length}`}
              className="text-lg hindi-text leading-relaxed mb-4"
            >
              {currentParagraph.map(({ sentence, index }) => (
                <span key={index} className="inline-flex items-start gap-1">
                  <button
                    type="button"
                    className="shrink-0 mt-1 text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => onPlaySentence(sentence.hindi)}
                    title="Play sentence"
                  >
                    {loadingAudio === `${sentence.hindi}-${speakingRate}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : playingAudio === `${sentence.hindi}-${speakingRate}` ? (
                      <VolumeX className="h-3.5 w-3.5" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <span>{renderClickableText(sentence)} </span>
                </span>
              ))}
            </p>,
          );
          currentParagraph = [];
        }

        // Render dialogue on its own line
        elements.push(
          <p
            key={i}
            className="text-lg hindi-text leading-relaxed pl-4 border-l-2 border-primary/30 my-3 flex items-start gap-1"
          >
            <button
              type="button"
              className="shrink-0 mt-1 text-muted-foreground hover:text-primary transition-colors"
              onClick={() => onPlaySentence(sentence.hindi)}
              title="Play sentence"
            >
              {loadingAudio === `${sentence.hindi}-${speakingRate}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : playingAudio === `${sentence.hindi}-${speakingRate}` ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <span>{renderClickableText(sentence)}</span>
          </p>,
        );
      } else {
        // Accumulate narration sentences
        currentParagraph.push({ sentence, index: i });
      }
    });

    // Flush remaining paragraph
    if (currentParagraph.length > 0) {
      elements.push(
        <p
          key={`para-${elements.length}`}
          className="text-lg hindi-text leading-relaxed mb-4"
        >
          {currentParagraph.map(({ sentence, index }) => (
            <span key={index} className="inline-flex items-start gap-1">
              <button
                type="button"
                className="shrink-0 mt-1 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => onPlaySentence(sentence.hindi)}
                title="Play sentence"
              >
                {loadingAudio === `${sentence.hindi}-${speakingRate}` ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : playingAudio === `${sentence.hindi}-${speakingRate}` ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
              <span>{renderClickableText(sentence)} </span>
            </span>
          ))}
        </p>,
      );
    }

    return elements;
  };

  return <div className="space-y-2">{renderContent()}</div>;
}
