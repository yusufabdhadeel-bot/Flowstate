import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login } from "../services/authService";
import { revokeAllUserSessions } from "../services/sessionManagementService";
import { authenticateToken, type AuthRequest } from "../middleware/auth";
import { ValidationError } from "../errors";

const router = Router();

/**
 * Strict limiter on the login endpoint only. The window/general limiter in
 * app.ts protects the API surface, but credential endpoints need a much tighter
 * budget to blunt credential stuffing.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || !email.trim()) {
      throw new ValidationError("Email and password are required");
    }
    if (typeof password !== "string" || !password) {
      throw new ValidationError("Email and password are required");
    }

    const result = await login({
      email,
      password,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/** Invalidate every active session for the signed-in user. */
router.post(
  "/logout",
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const revoked = await revokeAllUserSessions(req.user!.id);
      res.json({ revoked });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
