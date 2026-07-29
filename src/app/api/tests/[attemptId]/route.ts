import { NextRequest, NextResponse } from 'next/server';
import {
  deleteAttempt,
  getAttemptCategoryBreakdown,
  getAttemptDetail,
  getDb,
  getTestAttempt,
} from '@/utils/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const { attemptId: raw } = await params;
    const attemptId = Number(raw);
    if (!Number.isFinite(attemptId)) {
      return NextResponse.json({ error: 'Invalid attempt id' }, { status: 400 });
    }

    const db = getDb();
    const attempt = getTestAttempt(db, attemptId);
    if (!attempt) {
      return NextResponse.json({ error: 'Test attempt not found' }, { status: 404 });
    }

    // Answers/explanations are only included once the attempt is completed, so an
    // in-progress test's answer key never reaches the client while it's being taken.
    const includeAnswers = attempt.status === 'completed';
    const detail = getAttemptDetail(db, attemptId, { includeAnswers });
    const categoryBreakdown = includeAnswers ? getAttemptCategoryBreakdown(db, attemptId) : undefined;

    return NextResponse.json({ attempt: detail, categoryBreakdown });
  } catch (error: any) {
    console.error('❌ [TEST DETAIL API] Failed:', error.message);
    return NextResponse.json({ error: 'Failed to load test attempt' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const { attemptId: raw } = await params;
    const attemptId = Number(raw);
    if (!Number.isFinite(attemptId)) {
      return NextResponse.json({ error: 'Invalid attempt id' }, { status: 400 });
    }

    // Note the explicit null check: Number(null) is 0, so an absent userId would
    // otherwise sail past isFinite() and read as a (never-matching) user id.
    const rawUserId = request.nextUrl.searchParams.get('userId');
    const userId = Number(rawUserId);
    if (rawUserId === null || !Number.isFinite(userId)) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = getDb();
    const deleted = deleteAttempt(db, attemptId, userId);
    if (!deleted) {
      return NextResponse.json({ error: 'Test attempt not found' }, { status: 404 });
    }

    console.log(`✅ [TEST DELETE API] Deleted attempt ${attemptId} for user ${userId}`);
    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error('❌ [TEST DELETE API] Failed:', error.message);
    return NextResponse.json({ error: 'Failed to delete test attempt' }, { status: 500 });
  }
}
