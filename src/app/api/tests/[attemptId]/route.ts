import { NextRequest, NextResponse } from 'next/server';
import { getAttemptCategoryBreakdown, getAttemptDetail, getDb, getTestAttempt } from '@/utils/db';

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
