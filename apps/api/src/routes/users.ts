import { Hono } from "hono";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, type AuthContext } from "../lib/middleware.js";
import { db } from "../db/index.js";
import {
  users,
  userWords,
  userGrammars,
  stories,
  exerciseAttempts,
} from "../db/schema.js";

export const usersRoutes = new Hono<{ Variables: AuthContext }>();

// All routes require authentication
usersRoutes.use("*", requireAuth);

/**
 * GET /api/users/me
 * Get current user profile
 */
usersRoutes.get("/me", async (c) => {
  try {
    const user = c.get("user");

    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id));

    if (!dbUser) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    return c.json({
      success: true,
      data: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        image: dbUser.image,
        createdAt: dbUser.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/users/me/progress
 * Get user learning progress
 */
usersRoutes.get("/me/progress", async (c) => {
  try {
    const user = c.get("user");

    // Count words by status
    const wordsKnownResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userWords)
      .where(
        and(
          eq(userWords.userId, user.id),
          inArray(userWords.status, ["KNOWN", "MASTERED"])
        )
      );

    const wordsLearningResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userWords)
      .where(
        and(eq(userWords.userId, user.id), eq(userWords.status, "LEARNING"))
      );

    // Count learned grammar
    const grammarLearnedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userGrammars)
      .where(
        and(eq(userGrammars.userId, user.id), eq(userGrammars.status, "LEARNED"))
      );

    // Count completed stories
    const storiesCompletedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(stories)
      .where(
        and(eq(stories.userId, user.id), sql`${stories.completedAt} IS NOT NULL`)
      );

    // Count exercise attempts
    const exercisesResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(exerciseAttempts)
      .where(eq(exerciseAttempts.userId, user.id));

    const wordsKnown = Number(wordsKnownResult[0]?.count || 0);
    const wordsLearning = Number(wordsLearningResult[0]?.count || 0);
    const grammarLearned = Number(grammarLearnedResult[0]?.count || 0);
    const storiesCompleted = Number(storiesCompletedResult[0]?.count || 0);
    const exercisesCompleted = Number(exercisesResult[0]?.count || 0);

    // Determine level
    let currentLevel: "A1" | "A2" | "B1" | "B2";
    if (wordsKnown < 50) currentLevel = "A1";
    else if (wordsKnown < 150) currentLevel = "A2";
    else if (wordsKnown < 400) currentLevel = "B1";
    else currentLevel = "B2";

    return c.json({
      success: true,
      data: {
        wordsKnown,
        wordsLearning,
        grammarLearned,
        currentLevel,
        currentStreak: 0, // TODO: Calculate streak
        totalStoriesCompleted: storiesCompleted,
        totalExercisesCompleted: exercisesCompleted,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/users/me/stats
 * Get user stats (for dashboard)
 */
usersRoutes.get("/me/stats", async (c) => {
  try {
    const user = c.get("user");
    const now = new Date();

    // Count known words
    const wordsKnownResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userWords)
      .where(
        and(
          eq(userWords.userId, user.id),
          inArray(userWords.status, ["KNOWN", "MASTERED"])
        )
      );

    // Count reviews due
    const reviewsDueResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userWords)
      .where(
        and(
          eq(userWords.userId, user.id),
          inArray(userWords.status, ["LEARNING", "KNOWN"]),
          sql`${userWords.nextReviewAt} <= ${now}`
        )
      );

    const wordsKnown = Number(wordsKnownResult[0]?.count || 0);
    const reviewsDue = Number(reviewsDueResult[0]?.count || 0);

    // Determine level
    let level: "A1" | "A2" | "B1" | "B2";
    if (wordsKnown < 50) level = "A1";
    else if (wordsKnown < 150) level = "A2";
    else if (wordsKnown < 400) level = "B1";
    else level = "B2";

    return c.json({
      success: true,
      data: {
        wordsKnown,
        level,
        streakDays: 0, // TODO: Calculate streak
        reviewsDue,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});
