import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, or, ilike, sql, notInArray, inArray } from "drizzle-orm";
import { requireAuth, type AuthContext } from "../lib/middleware.js";
import { db } from "../db/index.js";
import { words, userWords } from "../db/schema.js";
import type { CEFRLevel, WordStatus, PartOfSpeech } from "@monke-say/shared";

export const wordsRoutes = new Hono<{ Variables: AuthContext }>();

// All routes require authentication
wordsRoutes.use("*", requireAuth);

/**
 * GET /api/words
 * List words with optional filtering
 */
wordsRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const status = c.req.query("status") as WordStatus | undefined;
    const level = c.req.query("level") as CEFRLevel | undefined;
    const search = c.req.query("q");
    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
    const offset = parseInt(c.req.query("offset") || "0");

    // Build query
    let query = db.select().from(words);

    const conditions: any[] = [];
    if (level) {
      conditions.push(eq(words.cefrLevel, level));
    }
    if (search) {
      conditions.push(
        or(
          ilike(words.hindi, `%${search}%`),
          ilike(words.romanized, `%${search}%`),
          ilike(words.english, `%${search}%`),
        ),
      );
    }

    const wordResults =
      conditions.length > 0
        ? await db
            .select()
            .from(words)
            .where(and(...conditions))
            .limit(limit)
            .offset(offset)
        : await db.select().from(words).limit(limit).offset(offset);

    // Get user progress for these words
    const wordIds = wordResults.map((w) => w.id);
    const userWordResults =
      wordIds.length > 0
        ? await db
            .select()
            .from(userWords)
            .where(
              and(
                eq(userWords.userId, user.id),
                inArray(userWords.wordId, wordIds),
              ),
            )
        : [];

    const userWordMap = new Map(userWordResults.map((uw) => [uw.wordId, uw]));

    // Combine words with progress
    const responseWords = wordResults
      .map((word) => {
        const userWord = userWordMap.get(word.id);
        const wordStatus = userWord?.status || "NEW";

        // Apply status filter
        if (status && wordStatus !== status) {
          return null;
        }

        return {
          id: word.id,
          hindi: word.hindi,
          romanized: word.romanized,
          english: word.english,
          partOfSpeech: word.partOfSpeech as PartOfSpeech,
          gender: word.gender || null,
          rootFormId: word.rootFormId,
          cefrLevel: word.cefrLevel as CEFRLevel,
          tags: word.tags || [],
          audioUrl: word.audioUrl,
          notes: word.notes,
          createdAt: word.createdAt.toISOString(),
          updatedAt: word.updatedAt.toISOString(),
          userProgress: userWord
            ? {
                id: userWord.id,
                status: userWord.status as WordStatus,
                familiarity: userWord.familiarity,
                timesSeen: userWord.timesSeen,
                timesReviewed: userWord.timesReviewed,
                timesCorrect: userWord.timesCorrect,
                lastSeenAt: userWord.lastSeenAt?.toISOString(),
                nextReviewAt: userWord.nextReviewAt?.toISOString(),
              }
            : null,
        };
      })
      .filter((w) => w !== null);

    return c.json({ success: true, data: responseWords });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/words/search
 * Search words by query
 */
wordsRoutes.get("/search", async (c) => {
  try {
    const q = c.req.query("q");
    if (!q) {
      return c.json({ success: false, error: "Query required" }, 400);
    }

    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);

    const results = await db
      .select()
      .from(words)
      .where(
        or(
          ilike(words.hindi, `%${q}%`),
          ilike(words.romanized, `%${q}%`),
          ilike(words.english, `%${q}%`),
        ),
      )
      .limit(limit);

    return c.json({
      success: true,
      data: results.map((word) => ({
        id: word.id,
        hindi: word.hindi,
        romanized: word.romanized,
        english: word.english,
        partOfSpeech: word.partOfSpeech,
        gender: word.gender || null,
        cefrLevel: word.cefrLevel,
        tags: word.tags || [],
        createdAt: word.createdAt.toISOString(),
        updatedAt: word.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/words/:wordId
 * Get a specific word with user progress
 */
wordsRoutes.get("/:wordId", async (c) => {
  try {
    const user = c.get("user");
    const wordId = c.req.param("wordId");

    const [word] = await db.select().from(words).where(eq(words.id, wordId));

    if (!word) {
      return c.json({ success: false, error: "Word not found" }, 404);
    }

    const [userWord] = await db
      .select()
      .from(userWords)
      .where(and(eq(userWords.userId, user.id), eq(userWords.wordId, wordId)));

    return c.json({
      success: true,
      data: {
        id: word.id,
        hindi: word.hindi,
        romanized: word.romanized,
        english: word.english,
        partOfSpeech: word.partOfSpeech,
        gender: word.gender || null,
        rootFormId: word.rootFormId,
        cefrLevel: word.cefrLevel,
        tags: word.tags || [],
        audioUrl: word.audioUrl,
        notes: word.notes,
        createdAt: word.createdAt.toISOString(),
        updatedAt: word.updatedAt.toISOString(),
        userProgress: userWord
          ? {
              id: userWord.id,
              status: userWord.status,
              familiarity: userWord.familiarity,
              timesSeen: userWord.timesSeen,
              timesReviewed: userWord.timesReviewed,
              timesCorrect: userWord.timesCorrect,
              lastSeenAt: userWord.lastSeenAt?.toISOString(),
              nextReviewAt: userWord.nextReviewAt?.toISOString(),
            }
          : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

const createWordSchema = z.object({
  hindi: z.string(),
  romanized: z.string(),
  english: z.string(),
  partOfSpeech: z.enum([
    "NOUN",
    "VERB",
    "ADJECTIVE",
    "ADVERB",
    "POSTPOSITION",
    "PARTICLE",
    "PRONOUN",
    "CONJUNCTION",
  ]),
  gender: z.enum(["MASCULINE", "FEMININE"]).optional(),
  cefrLevel: z.enum(["A1", "A2", "B1", "B2"]),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  rootFormId: z.string().uuid().optional(),
  audioUrl: z.string().optional(),
});

/**
 * POST /api/words
 * Create a new word
 */
wordsRoutes.post("/", zValidator("json", createWordSchema), async (c) => {
  try {
    const data = c.req.valid("json");

    const [word] = await db
      .insert(words)
      .values({
        hindi: data.hindi,
        romanized: data.romanized,
        english: data.english,
        partOfSpeech: data.partOfSpeech,
        gender: data.gender,
        cefrLevel: data.cefrLevel,
        tags: data.tags || [],
        notes: data.notes,
        rootFormId: data.rootFormId,
        audioUrl: data.audioUrl,
      })
      .returning();

    return c.json(
      {
        success: true,
        data: {
          id: word.id,
          hindi: word.hindi,
          romanized: word.romanized,
          english: word.english,
          partOfSpeech: word.partOfSpeech,
          gender: word.gender || null,
          cefrLevel: word.cefrLevel,
          tags: word.tags || [],
          createdAt: word.createdAt.toISOString(),
          updatedAt: word.updatedAt.toISOString(),
        },
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/words/:wordId/mark-known
 * Mark a word as known
 */
wordsRoutes.post("/:wordId/mark-known", async (c) => {
  try {
    const user = c.get("user");
    const wordId = c.req.param("wordId");

    // Upsert user word
    const [existing] = await db
      .select()
      .from(userWords)
      .where(and(eq(userWords.userId, user.id), eq(userWords.wordId, wordId)));

    if (existing) {
      await db
        .update(userWords)
        .set({
          status: "KNOWN",
          familiarity: 1.0,
          lastSeenAt: new Date(),
        })
        .where(eq(userWords.id, existing.id));
    } else {
      await db.insert(userWords).values({
        userId: user.id,
        wordId: wordId,
        status: "KNOWN",
        familiarity: 1.0,
        source: "MANUAL",
        lastSeenAt: new Date(),
      });
    }

    return c.json({ success: true, message: "Word marked as known" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/words/:wordId/mark-learning
 * Mark a word as learning
 */
wordsRoutes.post("/:wordId/mark-learning", async (c) => {
  try {
    const user = c.get("user");
    const wordId = c.req.param("wordId");

    const [existing] = await db
      .select()
      .from(userWords)
      .where(and(eq(userWords.userId, user.id), eq(userWords.wordId, wordId)));

    if (existing) {
      await db
        .update(userWords)
        .set({
          status: "LEARNING",
          lastSeenAt: new Date(),
        })
        .where(eq(userWords.id, existing.id));
    } else {
      await db.insert(userWords).values({
        userId: user.id,
        wordId: wordId,
        status: "LEARNING",
        source: "MANUAL",
        lastSeenAt: new Date(),
      });
    }

    return c.json({ success: true, message: "Word marked as learning" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});
