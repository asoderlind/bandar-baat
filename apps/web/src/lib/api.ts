const API_BASE = "/api";

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: "include", // Include cookies for better-auth sessions
    });

    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || error.detail || "Request failed");
    }

    const json = await response.json();

    // Handle wrapped API responses (success/data format)
    if (
      json &&
      typeof json === "object" &&
      "success" in json &&
      "data" in json
    ) {
      if (!json.success) {
        throw new Error(json.error || "Request failed");
      }
      return json.data as T;
    }

    return json as T;
  }

  // Auth (using better-auth endpoints)
  async login(email: string, password: string) {
    const response = await this.request<{
      token: string;
      user: { id: string; email: string; name: string | null };
    }>("/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return response;
  }

  async register(email: string, password: string, name?: string) {
    return this.request<{
      token: string;
      user: { id: string; email: string; name: string | null };
    }>("/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
  }

  async logout() {
    await this.request("/auth/sign-out", { method: "POST" });
  }

  async getSession() {
    return this.request<{
      session: { id: string; userId: string } | null;
      user: { id: string; email: string; name: string | null } | null;
    }>("/auth/get-session", { method: "GET" });
  }

  // User
  async getProfile() {
    return this.request<{ id: string; email: string; name: string | null }>(
      "/user/profile",
    );
  }

  async getStats() {
    return this.request<{
      words_known: number;
      level: string;
      streak_days: number;
      reviews_due: number;
    }>("/user/stats");
  }

  async getProgress() {
    return this.request<{
      words_known: number;
      words_learning: number;
      grammar_learned: number;
      current_level: string;
      current_streak: number;
      total_stories_completed: number;
      total_exercises_completed: number;
    }>("/user/progress");
  }

  // Words
  async getWords(params?: {
    status?: string;
    level?: string;
    q?: string;
    limit?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.level) searchParams.set("level", params.level);
    if (params?.q) searchParams.set("q", params.q);
    if (params?.limit) searchParams.set("limit", String(params.limit));

    const query = searchParams.toString();
    return this.request<Word[]>(`/words${query ? `?${query}` : ""}`);
  }

  async searchWords(q: string) {
    return this.request<Word[]>(`/words/search?q=${encodeURIComponent(q)}`);
  }

  async markWordKnown(wordId: string) {
    return this.request<{ success: boolean }>(`/words/${wordId}/mark-known`, {
      method: "POST",
    });
  }

  // Grammar
  async getGrammarConcepts() {
    return this.request<GrammarConcept[]>("/grammar");
  }

  async getGrammarWithProgress() {
    return this.request<UserGrammar[]>("/grammar/with-progress");
  }

  // Stories
  async getStories(params?: { completed?: boolean; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.completed !== undefined)
      searchParams.set("completed", String(params.completed));
    if (params?.limit) searchParams.set("limit", String(params.limit));

    const query = searchParams.toString();
    return this.request<StoryListItem[]>(`/stories${query ? `?${query}` : ""}`);
  }

  async getReadyStoryInfo() {
    return this.request<{
      ready: boolean;
      level: string;
      newWordsAvailable: number;
      suggestedTopic: string;
    }>("/stories/ready");
  }

  async generateStory(params?: {
    topic?: string;
    includeWordIds?: string[];
    focusGrammarId?: string;
  }) {
    return this.request<Story>("/stories/generate", {
      method: "POST",
      body: JSON.stringify(params || {}),
    });
  }

  async getStory(storyId: string) {
    return this.request<Story>(`/stories/${storyId}`);
  }

  async completeStory(storyId: string, rating?: number) {
    return this.request<{ success: boolean; completedAt: string }>(
      `/stories/${storyId}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ rating }),
      },
    );
  }

  async deleteStory(storyId: string) {
    return this.request<{ success: boolean }>(`/stories/${storyId}`, {
      method: "DELETE",
    });
  }

  async getStoryExercises(storyId: string) {
    return this.request<Exercise[]>(`/exercises/story/${storyId}`);
  }

  // Exercises
  async submitExercise(exerciseId: string, answer: string, timeSpent?: number) {
    return this.request<{
      isCorrect: boolean;
      correctAnswer: string;
      feedback: string | null;
    }>(`/exercises/${exerciseId}/submit`, {
      method: "POST",
      body: JSON.stringify({
        answer: answer,
        timeSpentSeconds: timeSpent,
      }),
    });
  }

  // Reviews
  async getDueReviews(limit?: number) {
    const query = limit ? `?limit=${limit}` : "";
    return this.request<ReviewWord[]>(`/reviews/due${query}`);
  }

  async getReviewSummary() {
    return this.request<{
      wordsDue: number;
      wordsReviewedToday: number;
      nextReviewTime: string | null;
    }>("/reviews/summary");
  }

  async submitReview(wordId: string, quality: number) {
    return this.request<{
      nextReviewAt: string;
      newIntervalDays: number;
      status: string;
    }>("/reviews/submit", {
      method: "POST",
      body: JSON.stringify({ wordId, quality }),
    });
  }
}

// Types
interface Word {
  id: string;
  hindi: string;
  romanized: string;
  english: string;
  partOfSpeech: string;
  cefrLevel: string;
  tags: string[];
  notes: string | null;
  userProgress?: {
    status: string;
    familiarity: number;
    timesSeen: number;
  };
}

interface GrammarConcept {
  id: string;
  name: string;
  slug: string;
  description: string;
  cefrLevel: string;
  sortOrder: number;
  examples: { hindi: string; romanized: string; english: string }[];
}

interface UserGrammar {
  id: string;
  grammarConceptId: string;
  status: string;
  comfortScore: number;
  grammarConcept: GrammarConcept;
}

interface StoryListItem {
  id: string;
  title: string;
  topic: string | null;
  difficultyLevel: string;
  wordCount: number;
  completedAt: string | null;
  createdAt: string;
}

interface StorySentence {
  index: number;
  hindi: string;
  romanized: string;
  english: string;
  words: {
    hindi: string;
    romanized: string;
    english: string;
    wordId?: string;
    isNew: boolean;
    partOfSpeech?: string;
    grammarNote?: string;
  }[];
  grammarNotes: string[];
}

interface Story {
  id: string;
  title: string;
  contentHindi: string;
  contentRomanized: string;
  contentEnglish: string;
  sentences: StorySentence[];
  targetNewWordIds: string[];
  targetGrammarIds: string[];
  topic: string | null;
  difficultyLevel: string;
  wordCount: number;
  rating: number | null;
  createdAt: string;
  completedAt: string | null;
  exercises?: Exercise[];
}

interface Exercise {
  id: string;
  storyId: string;
  type: string;
  question: {
    prompt: string;
    context?: string;
    sentenceIndex?: number;
  };
  options: string[] | null;
  targetWordId: string | null;
  targetGrammarId: string | null;
}

interface ReviewWord {
  id: string;
  wordId: string;
  hindi: string;
  romanized: string;
  english: string;
  partOfSpeech: string;
  status: string;
  familiarity: number;
  srsIntervalDays: number;
  nextReviewAt: string | null;
}

export const api = new ApiClient();
export type {
  Word,
  GrammarConcept,
  UserGrammar,
  StoryListItem,
  Story,
  StorySentence,
  Exercise,
  ReviewWord,
};
