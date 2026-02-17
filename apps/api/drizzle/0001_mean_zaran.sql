CREATE TYPE "public"."gender" AS ENUM('MASCULINE', 'FEMININE');--> statement-breakpoint
CREATE TABLE "character_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"related_character_id" uuid NOT NULL,
	"relationship_type" varchar(50) NOT NULL,
	"relationship_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name_hindi" text NOT NULL,
	"name_romanized" text NOT NULL,
	"name_english" text,
	"age" integer,
	"gender" varchar(20),
	"occupation" text,
	"occupation_hindi" text,
	"hobbies" text[] DEFAULT '{}',
	"personality_traits" text[] DEFAULT '{}',
	"backstory" text,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"appearance_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"role_in_story" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "gender" "gender";--> statement-breakpoint
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_related_character_id_characters_id_fk" FOREIGN KEY ("related_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_relationship_unique_idx" ON "character_relationships" USING btree ("character_id","related_character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_character_unique_idx" ON "story_characters" USING btree ("story_id","character_id");