import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  real,
  uuid,
  uniqueIndex,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// Enums
// ============================================================================

export const partOfSpeechEnum = pgEnum("part_of_speech", [
  "NOUN",
  "VERB",
  "ADJECTIVE",
  "ADVERB",
  "POSTPOSITION",
  "PARTICLE",
  "PRONOUN",
  "CONJUNCTION",
]);

export const cefrLevelEnum = pgEnum("cefr_level", ["A1", "A2", "B1", "B2"]);

export const wordStatusEnum = pgEnum("word_status", [
  "NEW",
  "LEARNING",
  "KNOWN",
  "MASTERED",
]);

export const grammarStatusEnum = pgEnum("grammar_status", [
  "LOCKED",
  "AVAILABLE",
  "LEARNING",
  "LEARNED",
]);

export const wordSourceEnum = pgEnum("word_source", [
  "SEEDED",
  "STORY",
  "MANUAL",
  "REVIEW",
]);

export const exerciseTypeEnum = pgEnum("exercise_type", [
  "COMPREHENSION",
  "FILL_BLANK",
  "TRANSLATE_TO_HINDI",
  "TRANSLATE_TO_ENGLISH",
  "WORD_ORDER",
  "MULTIPLE_CHOICE",
]);

export const sessionTypeEnum = pgEnum("session_type", [
  "STORY",
  "REVIEW",
  "PLACEMENT",
  "FREE_PRACTICE",
]);

// ============================================================================
// Auth Tables (better-auth)
// ============================================================================

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  accountId: varchar("account_id", { length: 255 }).notNull(),
  providerId: varchar("provider_id", { length: 255 }).notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verifications = pgTable("verifications", {
  id: varchar("id", { length: 36 }).primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// Words - Core vocabulary
// ============================================================================

export const words = pgTable("words", {
  id: uuid("id").primaryKey().defaultRandom(),
  hindi: text("hindi").notNull(),
  romanized: text("romanized").notNull(),
  english: text("english").notNull(),
  partOfSpeech: partOfSpeechEnum("part_of_speech").notNull(),
  rootFormId: uuid("root_form_id"),
  cefrLevel: cefrLevelEnum("cefr_level").notNull(),
  tags: text("tags").array().default([]),
  audioUrl: text("audio_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// Grammar Concepts
// ============================================================================

export const grammarConcepts = pgTable("grammar_concepts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  description: text("description").notNull(),
  cefrLevel: cefrLevelEnum("cefr_level").notNull(),
  sortOrder: integer("sort_order").notNull(),
  examplesJson: jsonb("examples_json").default([]),
  prerequisiteIds: uuid("prerequisite_ids").array().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// User Progress - Words
// ============================================================================

export const userWords = pgTable(
  "user_words",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    wordId: uuid("word_id")
      .references(() => words.id, { onDelete: "cascade" })
      .notNull(),
    status: wordStatusEnum("status").default("NEW").notNull(),
    familiarity: real("familiarity").default(0).notNull(),
    timesSeen: integer("times_seen").default(0).notNull(),
    timesReviewed: integer("times_reviewed").default(0).notNull(),
    timesCorrect: integer("times_correct").default(0).notNull(),
    lastSeenAt: timestamp("last_seen_at"),
    nextReviewAt: timestamp("next_review_at"),
    srsIntervalDays: real("srs_interval_days").default(1).notNull(),
    srsEaseFactor: real("srs_ease_factor").default(2.5).notNull(),
    source: wordSourceEnum("source").default("SEEDED").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_word_unique_idx").on(table.userId, table.wordId),
  ],
);

// ============================================================================
// User Progress - Grammar
// ============================================================================

export const userGrammars = pgTable(
  "user_grammars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    grammarConceptId: uuid("grammar_concept_id")
      .references(() => grammarConcepts.id, { onDelete: "cascade" })
      .notNull(),
    status: grammarStatusEnum("status").default("LOCKED").notNull(),
    introducedAt: timestamp("introduced_at"),
    comfortScore: real("comfort_score").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_grammar_unique_idx").on(
      table.userId,
      table.grammarConceptId,
    ),
  ],
);

// ============================================================================
// Stories
// ============================================================================

export const stories = pgTable("stories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  contentHindi: text("content_hindi").notNull(),
  contentRomanized: text("content_romanized").notNull(),
  contentEnglish: text("content_english").notNull(),
  sentencesJson: jsonb("sentences_json").default([]),
  targetNewWordIds: uuid("target_new_word_ids").array().default([]),
  targetGrammarIds: uuid("target_grammar_ids").array().default([]),
  topic: text("topic"),
  difficultyLevel: cefrLevelEnum("difficulty_level").notNull(),
  wordCount: integer("word_count").default(0).notNull(),
  generationPrompt: text("generation_prompt").default("").notNull(),
  llmModel: varchar("llm_model", { length: 100 }).default(
    "claude-sonnet-4-20250514",
  ),
  llmResponseRaw: jsonb("llm_response_raw"),
  rating: integer("rating"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ============================================================================
// Characters - Recurring story characters for continuity
// ============================================================================

export const characters = pgTable("characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  nameHindi: text("name_hindi").notNull(),
  nameRomanized: text("name_romanized").notNull(),
  nameEnglish: text("name_english"),
  age: integer("age"),
  gender: varchar("gender", { length: 20 }),
  occupation: text("occupation"),
  occupationHindi: text("occupation_hindi"),
  hobbies: text("hobbies").array().default([]),
  personalityTraits: text("personality_traits").array().default([]),
  backstory: text("backstory"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true).notNull(),
  appearanceCount: integer("appearance_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// Character Relationships - How characters relate to each other
// ============================================================================

export const characterRelationships = pgTable(
  "character_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .references(() => characters.id, { onDelete: "cascade" })
      .notNull(),
    relatedCharacterId: uuid("related_character_id")
      .references(() => characters.id, { onDelete: "cascade" })
      .notNull(),
    relationshipType: varchar("relationship_type", { length: 50 }).notNull(), // e.g., "friend", "sibling", "coworker", "neighbor"
    relationshipDescription: text("relationship_description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("character_relationship_unique_idx").on(
      table.characterId,
      table.relatedCharacterId,
    ),
  ],
);

// ============================================================================
// Story Characters - Junction table linking stories to characters used
// ============================================================================

export const storyCharacters = pgTable(
  "story_characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storyId: uuid("story_id")
      .references(() => stories.id, { onDelete: "cascade" })
      .notNull(),
    characterId: uuid("character_id")
      .references(() => characters.id, { onDelete: "cascade" })
      .notNull(),
    roleInStory: text("role_in_story"), // Brief description of their role in this specific story
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("story_character_unique_idx").on(
      table.storyId,
      table.characterId,
    ),
  ],
);

// ============================================================================
// Exercises
// ============================================================================

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  storyId: uuid("story_id")
    .references(() => stories.id, { onDelete: "cascade" })
    .notNull(),
  type: exerciseTypeEnum("type").notNull(),
  questionJson: jsonb("question_json").notNull(),
  correctAnswer: text("correct_answer").notNull(),
  options: text("options").array(),
  targetWordId: uuid("target_word_id").references(() => words.id),
  targetGrammarId: uuid("target_grammar_id").references(
    () => grammarConcepts.id,
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Exercise Attempts
// ============================================================================

export const exerciseAttempts = pgTable("exercise_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  exerciseId: uuid("exercise_id")
    .references(() => exercises.id, { onDelete: "cascade" })
    .notNull(),
  userAnswer: text("user_answer").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  feedback: text("feedback"),
  timeSpentSeconds: integer("time_spent_seconds"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Learning Sessions
// ============================================================================

export const learningSessions = pgTable("learning_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  sessionType: sessionTypeEnum("session_type").notNull(),
  storyId: uuid("story_id").references(() => stories.id),
  wordsIntroduced: integer("words_introduced").default(0).notNull(),
  wordsReviewed: integer("words_reviewed").default(0).notNull(),
  exercisesCompleted: integer("exercises_completed").default(0).notNull(),
  exercisesCorrect: integer("exercises_correct").default(0).notNull(),
  durationSeconds: integer("duration_seconds").default(0).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

// ============================================================================
// Relations
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  userWords: many(userWords),
  userGrammars: many(userGrammars),
  stories: many(stories),
  learningSessions: many(learningSessions),
  exerciseAttempts: many(exerciseAttempts),
  characters: many(characters),
}));

export const wordsRelations = relations(words, ({ one, many }) => ({
  rootForm: one(words, {
    fields: [words.rootFormId],
    references: [words.id],
    relationName: "wordConjugations",
  }),
  conjugations: many(words, { relationName: "wordConjugations" }),
  userWords: many(userWords),
}));

export const grammarConceptsRelations = relations(
  grammarConcepts,
  ({ many }) => ({
    userGrammars: many(userGrammars),
  }),
);

export const userWordsRelations = relations(userWords, ({ one }) => ({
  user: one(users, {
    fields: [userWords.userId],
    references: [users.id],
  }),
  word: one(words, {
    fields: [userWords.wordId],
    references: [words.id],
  }),
}));

export const userGrammarsRelations = relations(userGrammars, ({ one }) => ({
  user: one(users, {
    fields: [userGrammars.userId],
    references: [users.id],
  }),
  grammarConcept: one(grammarConcepts, {
    fields: [userGrammars.grammarConceptId],
    references: [grammarConcepts.id],
  }),
}));

export const storiesRelations = relations(stories, ({ one, many }) => ({
  user: one(users, {
    fields: [stories.userId],
    references: [users.id],
  }),
  exercises: many(exercises),
  learningSessions: many(learningSessions),
  storyCharacters: many(storyCharacters),
}));

export const charactersRelations = relations(characters, ({ one, many }) => ({
  user: one(users, {
    fields: [characters.userId],
    references: [users.id],
  }),
  storyCharacters: many(storyCharacters),
  relationshipsFrom: many(characterRelationships, {
    relationName: "characterFrom",
  }),
  relationshipsTo: many(characterRelationships, {
    relationName: "characterTo",
  }),
}));

export const characterRelationshipsRelations = relations(
  characterRelationships,
  ({ one }) => ({
    character: one(characters, {
      fields: [characterRelationships.characterId],
      references: [characters.id],
      relationName: "characterFrom",
    }),
    relatedCharacter: one(characters, {
      fields: [characterRelationships.relatedCharacterId],
      references: [characters.id],
      relationName: "characterTo",
    }),
  }),
);

export const storyCharactersRelations = relations(
  storyCharacters,
  ({ one }) => ({
    story: one(stories, {
      fields: [storyCharacters.storyId],
      references: [stories.id],
    }),
    character: one(characters, {
      fields: [storyCharacters.characterId],
      references: [characters.id],
    }),
  }),
);

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  story: one(stories, {
    fields: [exercises.storyId],
    references: [stories.id],
  }),
  targetWord: one(words, {
    fields: [exercises.targetWordId],
    references: [words.id],
  }),
  targetGrammar: one(grammarConcepts, {
    fields: [exercises.targetGrammarId],
    references: [grammarConcepts.id],
  }),
  attempts: many(exerciseAttempts),
}));

export const exerciseAttemptsRelations = relations(
  exerciseAttempts,
  ({ one }) => ({
    user: one(users, {
      fields: [exerciseAttempts.userId],
      references: [users.id],
    }),
    exercise: one(exercises, {
      fields: [exerciseAttempts.exerciseId],
      references: [exercises.id],
    }),
  }),
);

export const learningSessionsRelations = relations(
  learningSessions,
  ({ one }) => ({
    user: one(users, {
      fields: [learningSessions.userId],
      references: [users.id],
    }),
    story: one(stories, {
      fields: [learningSessions.storyId],
      references: [stories.id],
    }),
  }),
);
