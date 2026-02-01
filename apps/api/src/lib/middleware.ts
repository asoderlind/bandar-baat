import { createMiddleware } from "hono/factory";
import { auth } from "../auth.js";

export type AuthContext = {
  user: {
    id: string;
    email: string;
    name?: string;
    image?: string;
  };
  session: {
    id: string;
    userId: string;
  };
};

/**
 * Middleware to require authentication
 * Adds user and session to context
 */
export const requireAuth = createMiddleware<{
  Variables: AuthContext;
}>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  c.set("user", {
    ...session.user,
    image: session.user.image ?? undefined,
  });
  c.set("session", session.session);

  await next();
});
