CREATE TYPE "public"."cefr_level" AS ENUM('A1', 'A2', 'B1', 'B2');--> statement-breakpoint
CREATE TYPE "public"."exercise_type" AS ENUM('COMPREHENSION', 'FILL_BLANK', 'TRANSLATE_TO_HINDI', 'TRANSLATE_TO_ENGLISH', 'WORD_ORDER', 'MULTIPLE_CHOICE');--> statement-breakpoint
CREATE TYPE "public"."grammar_status" AS ENUM('LOCKED', 'AVAILABLE', 'LEARNING', 'LEARNED');--> statement-breakpoint
CREATE TYPE "public"."part_of_speech" AS ENUM('NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'POSTPOSITION', 'PARTICLE', 'PRONOUN', 'CONJUNCTION');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('STORY', 'REVIEW', 'PLACEMENT', 'FREE_PRACTICE');--> statement-breakpoint
CREATE TYPE "public"."word_source" AS ENUM('SEEDED', 'STORY', 'MANUAL', 'REVIEW');--> statement-breakpoint
CREATE TYPE "public"."word_status" AS ENUM('NEW', 'LEARNING', 'KNOWN', 'MASTERED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"exercise_id" uuid NOT NULL,
	"user_answer" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"feedback" text,
	"time_spent_seconds" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"type" "exercise_type" NOT NULL,
	"question_json" jsonb NOT NULL,
	"correct_answer" text NOT NULL,
	"options" text[],
	"target_word_id" uuid,
	"target_grammar_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grammar_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"cefr_level" "cefr_level" NOT NULL,
	"sort_order" integer NOT NULL,
	"examples_json" jsonb DEFAULT '[]'::jsonb,
	"prerequisite_ids" uuid[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grammar_concepts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "learning_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_type" "session_type" NOT NULL,
	"story_id" uuid,
	"words_introduced" integer DEFAULT 0 NOT NULL,
	"words_reviewed" integer DEFAULT 0 NOT NULL,
	"exercises_completed" integer DEFAULT 0 NOT NULL,
	"exercises_correct" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"content_hindi" text NOT NULL,
	"content_romanized" text NOT NULL,
	"content_english" text NOT NULL,
	"sentences_json" jsonb DEFAULT '[]'::jsonb,
	"target_new_word_ids" uuid[] DEFAULT '{}',
	"target_grammar_ids" uuid[] DEFAULT '{}',
	"topic" text,
	"difficulty_level" "cefr_level" NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"generation_prompt" text DEFAULT '' NOT NULL,
	"llm_model" varchar(100) DEFAULT 'claude-sonnet-4-20250514',
	"llm_response_raw" jsonb,
	"rating" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_grammars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"grammar_concept_id" uuid NOT NULL,
	"status" "grammar_status" DEFAULT 'LOCKED' NOT NULL,
	"introduced_at" timestamp,
	"comfort_score" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"word_id" uuid NOT NULL,
	"status" "word_status" DEFAULT 'NEW' NOT NULL,
	"familiarity" real DEFAULT 0 NOT NULL,
	"times_seen" integer DEFAULT 0 NOT NULL,
	"times_reviewed" integer DEFAULT 0 NOT NULL,
	"times_correct" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp,
	"next_review_at" timestamp,
	"srs_interval_days" real DEFAULT 1 NOT NULL,
	"srs_ease_factor" real DEFAULT 2.5 NOT NULL,
	"source" "word_source" DEFAULT 'SEEDED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hindi" text NOT NULL,
	"romanized" text NOT NULL,
	"english" text NOT NULL,
	"part_of_speech" "part_of_speech" NOT NULL,
	"root_form_id" uuid,
	"cefr_level" "cefr_level" NOT NULL,
	"tags" text[] DEFAULT '{}',
	"audio_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_attempts" ADD CONSTRAINT "exercise_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_attempts" ADD CONSTRAINT "exercise_attempts_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_target_word_id_words_id_fk" FOREIGN KEY ("target_word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_target_grammar_id_grammar_concepts_id_fk" FOREIGN KEY ("target_grammar_id") REFERENCES "public"."grammar_concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_grammars" ADD CONSTRAINT "user_grammars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_grammars" ADD CONSTRAINT "user_grammars_grammar_concept_id_grammar_concepts_id_fk" FOREIGN KEY ("grammar_concept_id") REFERENCES "public"."grammar_concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_words" ADD CONSTRAINT "user_words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_words" ADD CONSTRAINT "user_words_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_grammar_unique_idx" ON "user_grammars" USING btree ("user_id","grammar_concept_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_word_unique_idx" ON "user_words" USING btree ("user_id","word_id");