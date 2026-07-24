import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { User } from '@/models/User';
import { validateGitHubUsername } from '@/lib/validations';
import { z } from 'zod';

const postSchema = z.object({
  username: z.string().trim().min(1),
  vacationDates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be in YYYY-MM-DD format'))
    .max(365, 'Cannot set more than 365 vacation dates'),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username')?.trim().toLowerCase();

  if (!username) {
    return NextResponse.json({ error: 'username is required' }, { status: 400 });
  }

  if (!validateGitHubUsername(username)) {
    return NextResponse.json({ error: 'Invalid username format' }, { status: 400 });
  }

  try {
    await dbConnect();
    const user = await User.findOne({ username }).select('username vacationDates').lean();

    if (!user) {
      return NextResponse.json({ username, vacationDates: [] });
    }

    return NextResponse.json({ username: user.username, vacationDates: user.vacationDates ?? [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { username, vacationDates } = parsed.data;

  if (!validateGitHubUsername(username)) {
    return NextResponse.json({ error: 'Invalid username format' }, { status: 400 });
  }

  try {
    await dbConnect();
    const user = await User.findOneAndUpdate(
      { username: username.toLowerCase() },
      { $set: { vacationDates } },
      { new: true, upsert: true, select: 'username vacationDates' }
    ).lean();

    return NextResponse.json({
      username: user?.username,
      vacationDates: user?.vacationDates ?? [],
      message: 'Vacation dates saved successfully',
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
