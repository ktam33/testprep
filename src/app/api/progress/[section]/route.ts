import { NextRequest, NextResponse } from 'next/server';
import { getDb, getCategoryStats, listAttempts } from '@/utils/db';
import { Section, SECTIONS } from '@/types';

function isSection(value: string): value is Section {
  return (SECTIONS as string[]).includes(value);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  try {
    const { section } = await params;
    if (!isSection(section)) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    const userId = Number(request.nextUrl.searchParams.get('userId'));
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = getDb();
    const categoryStats = getCategoryStats(db, userId, section);
    const attempts = listAttempts(db, userId, section);

    return NextResponse.json({ categoryStats, attempts });
  } catch (error: any) {
    console.error('❌ [SECTION PROGRESS API] Failed:', error.message);
    return NextResponse.json({ error: 'Failed to load section progress' }, { status: 500 });
  }
}
