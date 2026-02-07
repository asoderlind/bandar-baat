import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./auth.js";
import { wordsRoutes } from "./routes/words.js";
import { grammarRoutes } from "./routes/grammar.js";
import { storiesRoutes } from "./routes/stories.js";
import { exercisesRoutes } from "./routes/exercises.js";
import { reviewsRoutes } from "./routes/reviews.js";
import { usersRoutes } from "./routes/users.js";
import { charactersRoutes } from "./routes/characters.js";
import { ttsRoutes } from "./routes/tts.js";
import { dictionaryRoutes } from "./routes/dictionary.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  }),
);

// Health check
app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth routes (handled by better-auth)
app.all("/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// API Routes
app.route("/api/words", wordsRoutes);
app.route("/api/grammar", grammarRoutes);
app.route("/api/stories", storiesRoutes);
app.route("/api/exercises", exercisesRoutes);
app.route("/api/reviews", reviewsRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/characters", charactersRoutes);
app.route("/api/tts", ttsRoutes);
app.route("/api/dictionary", dictionaryRoutes);

const port = parseInt(process.env.PORT || "8000");

console.log(`🐒 Monke-Say API running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
