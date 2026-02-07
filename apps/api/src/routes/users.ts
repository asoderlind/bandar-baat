import { Hono } from "hono";
import { eq, and, sql, inArray, gte, or, isNull, lte } from "drizzle-orm";
import { requireAuth, type AuthContext } from "../lib/middleware.js";
import { db } from "../db/index.js";
import {
  users,
  userWords,
  userGrammars,
  stories,
  exerciseAttempts,
  accounts,
} from "../db/schema.js";
import { hashPassword, verifyPassword } from "better-auth/crypto";

export const usersRoutes = new Hono<{ Variables: AuthContext }>();

/**
 * Calculate streak based on consecutive days with learning activity
 */
async function calculateStreak(userId: string): Promise<number> {
  // Get distinct dates with activity (story completions, reviews, exercises)
  // Looking back up to 365 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 365);

  // Get dates with story activity
  const storyDates = await db
    .selectDistinct({
      date: sql<string>`DATE(${stories.createdAt})`,
    })
    .from(stories)
    .where(
      and(eq(stories.userId, userId), gte(stories.createdAt, thirtyDaysAgo)),
    );

  // Get dates with review/word activity
  const wordDates = await db
    .selectDistinct({
      date: sql<string>`DATE(${userWords.lastSeenAt})`,
    })
    .from(userWords)
    .where(
      and(
        eq(userWords.userId, userId),
        gte(userWords.lastSeenAt, thirtyDaysAgo),
      ),
    );

  // Get dates with exercise activity
  const exerciseDates = await db
    .selectDistinct({
      date: sql<string>`DATE(${exerciseAttempts.createdAt})`,
    })
    .from(exerciseAttempts)
    .where(
      and(
        eq(exerciseAttempts.userId, userId),
        gte(exerciseAttempts.createdAt, thirtyDaysAgo),
      ),
    );

  // Combine all dates
  const allDates = new Set<string>();
  storyDates.forEach((d) => d.date && allDates.add(d.date));
  wordDates.forEach((d) => d.date && allDates.add(d.date));
  exerciseDates.forEach((d) => d.date && allDates.add(d.date));

  if (allDates.size === 0) return 0;

  // Sort dates descending
  const sortedDates = Array.from(allDates).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  );

  // Calculate streak from today/yesterday
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  // Must have activity today or yesterday to have an active streak
  if (sortedDates[0] !== todayStr && sortedDates[0] !== yesterdayStr) {
    return 0;
  }

  // Count consecutive days
  let streak = 0;
  let currentDate = new Date(sortedDates[0]);

  for (const dateStr of sortedDates) {
    const date = new Date(dateStr);
    const expectedDate = new Date(currentDate);

    if (date.getTime() === expectedDate.getTime()) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (date.getTime() < expectedDate.getTime()) {
      // Gap in dates, streak broken
      break;
    }
  }

  return streak;
}

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
 * PATCH /api/users/me
 * Update current user profile (name, email)
 */
usersRoutes.patch("/me", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json<{ name?: string; email?: string }>();

    const updates: Partial<{ name: string; email: string; updatedAt: Date }> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      updates.name = body.name.trim();
    }

    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return c.json({ success: false, error: "Invalid email address" }, 400);
      }
      // Check uniqueness
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email)));
      if (existing.length > 0 && existing[0].id !== user.id) {
        return c.json({ success: false, error: "Email already in use" }, 409);
      }
      updates.email = email;
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
      });

    return c.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/users/me/change-password
 * Change current user password
 */
usersRoutes.post("/me/change-password", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json<{
      currentPassword: string;
      newPassword: string;
    }>();

    if (!body.currentPassword || !body.newPassword) {
      return c.json(
        { success: false, error: "Current and new password are required" },
        400,
      );
    }

    if (body.newPassword.length < 8) {
      return c.json(
        { success: false, error: "New password must be at least 8 characters" },
        400,
      );
    }

    // Get the account with credential provider
    const [account] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, user.id),
          eq(accounts.providerId, "credential"),
        ),
      );

    if (!account || !account.password) {
      return c.json(
        { success: false, error: "No password-based account found" },
        400,
      );
    }

    // Verify current password using better-auth's crypto
    const isValid = await verifyPassword({
      hash: account.password,
      password: body.currentPassword,
    });
    if (!isValid) {
      return c.json(
        { success: false, error: "Current password is incorrect" },
        400,
      );
    }

    const hashedPassword = await hashPassword(body.newPassword);

    await db
      .update(accounts)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(accounts.id, account.id));

    return c.json({ success: true, data: { message: "Password updated" } });
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
          inArray(userWords.status, ["KNOWN", "MASTERED"]),
        ),
      );

    const wordsLearningResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userWords)
      .where(
        and(eq(userWords.userId, user.id), eq(userWords.status, "LEARNING")),
      );

    // Count learned grammar
    const grammarLearnedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userGrammars)
      .where(
        and(
          eq(userGrammars.userId, user.id),
          eq(userGrammars.status, "LEARNED"),
        ),
      );

    // Count completed stories
    const storiesCompletedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(stories)
      .where(
        and(
          eq(stories.userId, user.id),
          sql`${stories.completedAt} IS NOT NULL`,
        ),
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

    // Calculate streak
    const currentStreak = await calculateStreak(user.id);

    return c.json({
      success: true,
      data: {
        wordsKnown,
        wordsLearning,
        grammarLearned,
        currentLevel,
        currentStreak,
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
          inArray(userWords.status, ["KNOWN", "MASTERED"]),
        ),
      );

    // Count reviews due (includes words with null nextReviewAt - new words)
    const reviewsDueResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userWords)
      .where(
        and(
          eq(userWords.userId, user.id),
          inArray(userWords.status, ["LEARNING", "KNOWN"]),
          or(isNull(userWords.nextReviewAt), lte(userWords.nextReviewAt, now)),
        ),
      );

    const wordsKnown = Number(wordsKnownResult[0]?.count || 0);
    const reviewsDue = Number(reviewsDueResult[0]?.count || 0);

    // Determine level
    let level: "A1" | "A2" | "B1" | "B2";
    if (wordsKnown < 50) level = "A1";
    else if (wordsKnown < 150) level = "A2";
    else if (wordsKnown < 400) level = "B1";
    else level = "B2";

    // Calculate streak
    const streakDays = await calculateStreak(user.id);

    return c.json({
      success: true,
      data: {
        wordsKnown,
        level,
        streakDays,
        reviewsDue,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});
