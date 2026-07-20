import { NextRequest, NextResponse } from 'next/server';
import { getDb, getProgressSummary } from '@/utils/db';

export async function GET(request: NextRequest) {
  try {
    const userId = Number(request.nextUrl.searchParams.get('userId'));
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = getDb();
    const summary = getProgressSummary(db, userId);
    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error('❌ [PROGRESS API] Failed:', error.message);
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 });
  }
}
