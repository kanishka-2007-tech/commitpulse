import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateCSRF } from '@/lib/security/csrf';
import dbConnect from '@/lib/mongodb';
import { User } from '@/models/User';
import { getClientIp } from '@/utils/getClientIp';
import { getRateLimitHeaders, RateLimiter } from '@/lib/rate-limit';
import { githubUsernameSchema } from '@/lib/validations';
import { sanitizeMongoPayload } from '@/utils/sanitize';
import logger from '@/lib/logger';

// GET  — 20 req / min per IP (read-heavy, cheap)
const goalsReadLimiter = new RateLimiter(20, 60_000, 1);

// PATCH — 10 req / min per IP (write-side, slightly stricter)
const goalsWriteLimiter = new RateLimiter(10, 60_000, 1);

const DEFAULT_GOALS = { monthly: 100, yearly: 1000 };

const patchBodySchema = z.object({
  username: githubUsernameSchema,
  monthly: z.number().int().min(1).max(99_999),
  yearly: z.number().int().min(1).max(9_999_999),
});

// ---------------------------------------------------------------------------
// GET /api/user/goals?username=<user>
// Returns the stored goals for the user, or defaults when none are saved yet.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rateLimitKey =
    ip && ip !== 'unknown' ? ip : `unknown:${request.headers.get('user-agent') ?? 'no-agent'}`;

  const rateLimitResult = await goalsReadLimiter.checkWithResult(rateLimitKey);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawUsername = searchParams.get('username')?.trim();

  if (!rawUsername) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const parsed = githubUsernameSchema.safeParse(rawUsername);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid GitHub username' }, { status: 400 });
  }

  const username = parsed.data.toLowerCase();

  // When DB is not configured, return defaults so the client degrades gracefully.
  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ goals: DEFAULT_GOALS, source: 'default' });
  }

  try {
    await dbConnect();
    const user = await User.findOne({ username }).select('goals').lean();

    if (!user || !user.goals) {
      return NextResponse.json({ goals: DEFAULT_GOALS, source: 'default' });
    }

    return NextResponse.json({
      goals: {
        monthly: user.goals.monthly ?? DEFAULT_GOALS.monthly,
        yearly: user.goals.yearly ?? DEFAULT_GOALS.yearly,
      },
      source: 'db',
    });
  } catch (error) {
    logger.error('Failed to fetch user goals', { route: '/api/user/goals', error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/user/goals
// Body: { username, monthly, yearly }
// Upserts the goals sub-document on the user record.
// ---------------------------------------------------------------------------
export async function PATCH(request: Request) {
  const ip = getClientIp(request);
  const rateLimitKey =
    ip && ip !== 'unknown' ? ip : `unknown:${request.headers.get('user-agent') ?? 'no-agent'}`;

  const rateLimitResult = await goalsWriteLimiter.checkWithResult(rateLimitKey);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
    );
  }

  // CSRF validation — mirrors track-user route
  const csrfError = validateCSRF(request);
  if (csrfError) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON request body' }, { status: 400 });
  }

  // Sanitize MongoDB operators from body
  sanitizeMongoPayload(body);

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { username, monthly, yearly } = parsed.data;
  const trimmedUsername = username.toLowerCase();

  // Graceful bypass when DB is not configured (dev / CI without MongoDB)
  if (!process.env.MONGODB_URI) {
    logger.warn('Goals save bypassed: MONGODB_URI is not set', {
      environment: process.env.NODE_ENV,
    });
    return NextResponse.json({ success: true, bypassed: true });
  }

  try {
    await dbConnect();
    await User.updateOne(
      { username: trimmedUsername },
      {
        $setOnInsert: { username: trimmedUsername },
        $set: { 'goals.monthly': monthly, 'goals.yearly': yearly },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to save user goals', { route: '/api/user/goals', error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
