import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, lte, sql, inArray } from "drizzle-orm";
import { requireAuth, type AuthContext } from "../lib/middleware.js";
import { db } from "../db/index.js";
import { words, userWords } from "../db/schema.js";
import { calculateSrsUpdate } from "@monke-say/shared";

export const reviewsRoutes = new Hono<{ Variables: AuthContext }>();

// All routes require authentication
reviewsRoutes.use("*", requireAuth);

/**
 * GET /api/reviews/due
 * Get words due for review
 */
reviewsRoutes.get("/due", async (c) => {
  try {
    const user = c.get("user");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);

    const now = new Date();

    const dueWords = await db
      .select({
        userWord: userWords,
        word: words,
      })
      .from(userWords)
      .innerJoin(words, eq(userWords.wordId, words.id))
      .where(
        and(
          eq(userWords.userId, user.id),
          inArray(userWords.status, ["LEARNING", "KNOWN"]),
          lte(userWords.nextReviewAt, now)
        )
      )
      .limit(limit);

    return c.json({
      success: true,
      data: dueWords.map(({ userWord, word }) => ({
        id: userWord.id,
        wordId: word.id,
        hindi: word.hindi,
        romanized: word.romanized,
        english: word.english,
        partOfSpeech: word.partOfSpeech,
        status: userWord.status,
        familiarity: userWord.familiarity,
        srsIntervalDays: userWord.srsIntervalDays,
        nextReviewAt: userWord.nextReviewAt?.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/reviews/count
 * Get count of words due for review
 */
reviewsRoutes.get("/count", async (c) => {
  try {
    const user = c.get("user");
    const now = new Date();

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(userWords)
      .where(
        and(
          eq(userWords.userId, user.id),
          inArray(userWords.status, ["LEARNING", "KNOWN"]),
          lte(userWords.nextReviewAt, now)
        )
      );

    return c.json({
      success: true,
      data: {
        dueCount: Number(result[0]?.count || 0),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

const reviewResultSchema = z.object({
  wordId: z.string(),
  quality: z.number().min(0).max(5), // 0-2 = fail, 3 = hard, 4 = good, 5 = easy
});

/**
 * POST /api/reviews/submit
 * Submit a review result
 */
reviewsRoutes.post(
  "/submit",
  zValidator("json", reviewResultSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const { wordId, quality } = c.req.valid("json");

      const [userWord] = await db
        .select()
        .from(userWords)
        .where(and(eq(userWords.userId, user.id), eq(userWords.wordId, wordId)));

      if (!userWord) {
        return c.json({ success: false, error: "Word not found in user's vocabulary" }, 404);
      }

      // Calculate new SRS values using shared function
      const { interval, easeFactor } = calculateSrsUpdate(
        quality,
        userWord.srsIntervalDays,
        userWord.srsEaseFactor
      );

      // Calculate next review date
      const nextReviewAt = new Date();
      nextReviewAt.setDate(nextReviewAt.getDate() + interval);

      // Determine new status
      let newStatus = userWord.status;
      if (quality < 3) {
        // Failed - demote to learning
        newStatus = "LEARNING";
      } else if (quality >= 4 && userWord.familiarity >= 0.8) {
        // Easy and high familiarity - promote
        if (userWord.status === "LEARNING") newStatus = "KNOWN";
        else if (userWord.status === "KNOWN") newStatus = "MASTERED";
      }

      const isCorrect = quality >= 3;
      const newTimesReviewed = userWord.timesReviewed + 1;
      const newTimesCorrect = isCorrect
        ? userWord.timesCorrect + 1
        : userWord.timesCorrect;
      const newFamiliarity = newTimesCorrect / Math.max(1, newTimesReviewed);

      await db
        .update(userWords)
        .set({
          status: newStatus,
          srsIntervalDays: interval,
          srsEaseFactor: easeFactor,
          nextReviewAt: nextReviewAt,
          timesReviewed: newTimesReviewed,
          timesCorrect: newTimesCorrect,
          familiarity: Math.min(1, newFamiliarity),
          lastSeenAt: new Date(),
        })
        .where(eq(userWords.id, userWord.id));

      return c.json({
        success: true,
        data: {
          newStatus,
          nextReviewAt: nextReviewAt.toISOString(),
          intervalDays: interval,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ success: false, error: message }, 500);
    }
  }
);
