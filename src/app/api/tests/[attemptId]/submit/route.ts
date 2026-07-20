import { NextRequest, NextResponse } from 'next/server';
import { getDb, getTestAttempt, submitAttempt } from '@/utils/db';
import { SubmitResponsePayload } from '@/types';

export async function POST(request: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const { attemptId: raw } = await params;
    const attemptId = Number(raw);
    if (!Number.isFinite(attemptId)) {
      return NextResponse.json({ error: 'Invalid attempt id' }, { status: 400 });
    }

    const { responses } = await request.json();
    if (!Array.isArray(responses)) {
      return NextResponse.json({ error: 'responses must be an array' }, { status: 400 });
    }

    const db = getDb();
    const attempt = getTestAttempt(db, attemptId);
    if (!attempt) {
      return NextResponse.json({ error: 'Test attempt not found' }, { status: 404 });
    }
    if (attempt.status === 'completed') {
      return NextResponse.json({ error: 'This test has already been submitted' }, { status: 409 });
    }

    const payload: SubmitResponsePayload[] = responses.map((r: any) => ({
      questionId: Number(r.questionId),
      selectedAnswerIndex:
        r.selectedAnswerIndex === null || r.selectedAnswerIndex === undefined
          ? null
          : Number(r.selectedAnswerIndex),
    }));

    const { scoreCorrect, scoreTotal } = submitAttempt(db, attemptId, payload);
    console.log(`✅ [SUBMIT API] Attempt ${attemptId} graded: ${scoreCorrect}/${scoreTotal}`);

    return NextResponse.json({ scoreCorrect, scoreTotal });
  } catch (error: any) {
    console.error('❌ [SUBMIT API] Failed:', error.message);
    return NextResponse.json({ error: 'Failed to submit test' }, { status: 500 });
  }
}
