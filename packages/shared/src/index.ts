// ============================================
// ENUMS
// ============================================

export type PartOfSpeech =
  | "NOUN"
  | "VERB"
  | "ADJECTIVE"
  | "ADVERB"
  | "POSTPOSITION"
  | "PARTICLE"
  | "PRONOUN"
  | "CONJUNCTION";

export type CEFRLevel = "A1" | "A2" | "B1" | "B2";

export type WordStatus = "NEW" | "LEARNING" | "KNOWN" | "MASTERED";

export type GrammarStatus = "LOCKED" | "AVAILABLE" | "LEARNING" | "LEARNED";

export type WordSource = "SEEDED" | "STORY" | "MANUAL" | "REVIEW";

export type ExerciseType =
  | "COMPREHENSION"
  | "FILL_BLANK"
  | "TRANSLATE_TO_HINDI"
  | "TRANSLATE_TO_ENGLISH"
  | "WORD_ORDER"
  | "MULTIPLE_CHOICE";

export type SessionType = "STORY" | "REVIEW" | "PLACEMENT" | "FREE_PRACTICE";

// ============================================
// CORE VOCABULARY TYPES
// ============================================

export interface Word {
  id: string;
  hindi: string;
  romanized: string;
  english: string;
  partOfSpeech: PartOfSpeech;
  rootFormId?: string;
  cefrLevel: CEFRLevel;
  tags: string[];
  audioUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GrammarConcept {
  id: string;
  name: string;
  slug: string;
  description: string;
  cefrLevel: CEFRLevel;
  sortOrder: number;
  examples: GrammarExample[];
  prerequisiteIds: string[];
  createdAt: string;
}

export interface GrammarExample {
  hindi: string;
  romanized: string;
  english: string;
}

// ============================================
// USER PROGRESS TYPES
// ============================================

export interface UserWord {
  id: string;
  userId: string;
  wordId: string;
  status: WordStatus;
  familiarity: number; // 0.0 to 1.0
  timesSeen: number;
  timesReviewed: number;
  timesCorrect: number;
  lastSeenAt?: string;
  nextReviewAt?: string;
  srsIntervalDays: number;
  srsEaseFactor: number;
  source: WordSource;
  createdAt: string;
}

export interface UserGrammar {
  id: string;
  userId: string;
  grammarConceptId: string;
  status: GrammarStatus;
  introducedAt?: string;
  comfortScore: number; // 0.0 to 1.0
  createdAt: string;
}

// ============================================
// STORY TYPES
// ============================================

export interface Story {
  id: string;
  userId: string;
  title: string;
  contentHindi: string;
  contentRomanized: string;
  contentEnglish: string;
  sentences: StorySentence[];
  targetNewWordIds: string[];
  targetGrammarIds: string[];
  topic?: string;
  difficultyLevel: CEFRLevel;
  wordCount: number;
  generationPrompt: string;
  llmModel: string;
  rating?: number;
  createdAt: string;
  completedAt?: string;
}

export interface StorySentence {
  index: number;
  hindi: string;
  romanized: string;
  english: string;
  words: SentenceWord[];
  grammarNotes?: string[];
}

export interface SentenceWord {
  hindi: string;
  romanized: string;
  english: string;
  wordId?: string;
  rootWordId?: string;
  isNew: boolean;
  partOfSpeech?: PartOfSpeech;
  grammarNote?: string;
}

// ============================================
// EXERCISE TYPES
// ============================================

export interface Exercise {
  id: string;
  storyId: string;
  type: ExerciseType;
  question: ExerciseQuestion;
  correctAnswer: string;
  options?: string[];
  targetWordId?: string;
  targetGrammarId?: string;
  createdAt: string;
}

export interface ExerciseQuestion {
  prompt: string;
  context?: string;
  sentenceIndex?: number;
}

export interface ExerciseAttempt {
  id: string;
  userId: string;
  exerciseId: string;
  userAnswer: string;
  isCorrect: boolean;
  feedback?: string;
  timeSpentSeconds?: number;
  createdAt: string;
}

// ============================================
// SESSION TYPES
// ============================================

export interface LearningSession {
  id: string;
  userId: string;
  sessionType: SessionType;
  storyId?: string;
  wordsIntroduced: number;
  wordsReviewed: number;
  exercisesCompleted: number;
  exercisesCorrect: number;
  durationSeconds: number;
  startedAt: string;
  endedAt?: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================
// USER TYPES
// ============================================

export interface User {
  id: string;
  email?: string;
  name?: string;
  createdAt: string;
}

export interface UserProgress {
  wordsKnown: number;
  wordsLearning: number;
  grammarLearned: number;
  currentLevel: CEFRLevel;
  currentStreak: number;
  totalStoriesCompleted: number;
  totalExercisesCompleted: number;
}

export interface UserStats {
  wordsKnown: number;
  level: CEFRLevel;
  streakDays: number;
  reviewsDue: number;
}

// ============================================
// CONSTANTS
// ============================================

export const CEFR_LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2"];

export const PARTS_OF_SPEECH: PartOfSpeech[] = [
  "NOUN",
  "VERB",
  "ADJECTIVE",
  "ADVERB",
  "POSTPOSITION",
  "PARTICLE",
  "PRONOUN",
  "CONJUNCTION",
];

export const DEFAULT_SRS_EASE_FACTOR = 2.5;
export const DEFAULT_SRS_INTERVAL = 1;

export const NEW_WORDS_PER_STORY = { min: 1, max: 8 };
export const DEFAULT_NEW_WORDS_PER_STORY = 3;
export const STORY_SENTENCE_COUNT = { min: 8, max: 15 };

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function parseDate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * SM-2 SRS algorithm implementation
 * Returns new interval and ease factor based on quality (0-5)
 */
export function calculateSrsUpdate(
  quality: number,
  previousInterval: number,
  previousEaseFactor: number,
): { interval: number; easeFactor: number } {
  // Quality: 0-2 = incorrect, 3 = hard, 4 = good, 5 = easy
  let easeFactor = previousEaseFactor;
  let interval = previousInterval;

  if (quality < 3) {
    // Reset interval on failure
    interval = 1;
  } else {
    // Update ease factor
    easeFactor = Math.max(
      1.3,
      previousEaseFactor +
        (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
    );

    // Calculate new interval
    if (previousInterval === 0) {
      interval = 1;
    } else if (previousInterval === 1) {
      interval = 6;
    } else {
      interval = Math.round(previousInterval * easeFactor);
    }
  }

  return { interval, easeFactor };
}
