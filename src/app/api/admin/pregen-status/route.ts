import { NextRequest, NextResponse } from 'next/server';
import { getPregenStatus, triggerPregeneration } from '@/utils/pregenManager';

// Returns the current user's pre-generation pool status and opportunistically kicks off a
// background fill (no-op if one is already running or all pools are full).
export async function GET(request: NextRequest) {
  const userId = Number(request.nextUrl.searchParams.get('userId'));
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'A valid userId query parameter is required' }, { status: 400 });
  }
  const status = getPregenStatus(userId);
  void triggerPregeneration();
  return NextResponse.json(status);
}
