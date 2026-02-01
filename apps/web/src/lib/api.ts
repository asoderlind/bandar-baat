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

    return response.json();
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
      new_words_available: number;
      suggested_topic: string;
    }>("/stories/ready");
  }

  async generateStory(params?: {
    topic?: string;
    include_word_ids?: string[];
    focus_grammar_id?: string;
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
    return this.request<{ success: boolean; completed_at: string }>(
      `/stories/${storyId}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ rating }),
      },
    );
  }

  async getStoryExercises(storyId: string) {
    return this.request<Exercise[]>(`/stories/${storyId}/exercises`);
  }

  // Exercises
  async submitExercise(exerciseId: string, answer: string, timeSpent?: number) {
    return this.request<{
      is_correct: boolean;
      correct_answer: string;
      feedback: string | null;
    }>(`/exercises/${exerciseId}/submit`, {
      method: "POST",
      body: JSON.stringify({
        user_answer: answer,
        time_spent_seconds: timeSpent,
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
      words_due: number;
      words_reviewed_today: number;
      next_review_time: string | null;
    }>("/reviews/summary");
  }

  async submitReview(userWordId: string, quality: number) {
    return this.request<{
      next_review_at: string;
      new_interval_days: number;
      status: string;
    }>(`/reviews/${userWordId}/submit`, {
      method: "POST",
      body: JSON.stringify({ quality }),
    });
  }
}

// Types
interface Word {
  id: string;
  hindi: string;
  romanized: string;
  english: string;
  part_of_speech: string;
  cefr_level: string;
  tags: string[];
  notes: string | null;
  user_progress?: {
    status: string;
    familiarity: number;
    times_seen: number;
  };
}

interface GrammarConcept {
  id: string;
  name: string;
  slug: string;
  description: string;
  cefr_level: string;
  sort_order: number;
  examples: { hindi: string; romanized: string; english: string }[];
}

interface UserGrammar {
  id: string;
  grammar_concept_id: string;
  status: string;
  comfort_score: number;
  grammar_concept: GrammarConcept;
}

interface StoryListItem {
  id: string;
  title: string;
  topic: string | null;
  difficulty_level: string;
  word_count: number;
  completed_at: string | null;
  created_at: string;
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
    word_id?: string;
    is_new: boolean;
    part_of_speech?: string;
    grammar_note?: string;
  }[];
  grammar_notes: string[];
}

interface Story {
  id: string;
  title: string;
  content_hindi: string;
  content_romanized: string;
  content_english: string;
  sentences: StorySentence[];
  target_new_word_ids: string[];
  target_grammar_ids: string[];
  topic: string | null;
  difficulty_level: string;
  word_count: number;
  rating: number | null;
  created_at: string;
  completed_at: string | null;
}

interface Exercise {
  id: string;
  story_id: string;
  type: string;
  question: {
    prompt: string;
    context?: string;
    sentence_index?: number;
  };
  options: string[] | null;
  target_word_id: string | null;
  target_grammar_id: string | null;
}

interface ReviewWord {
  user_word: {
    id: string;
    word_id: string;
    status: string;
    familiarity: number;
    times_reviewed: number;
    word: Word;
  };
  example_sentence: StorySentence | null;
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
