CREATE TYPE "public"."gender" AS ENUM('MASCULINE', 'FEMININE');--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "gender" "gender";
