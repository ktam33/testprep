import { NextResponse } from 'next/server';
import { getPregenStatus, triggerPregeneration } from '@/utils/pregenManager';

// Returns the current pre-generation pool status and opportunistically kicks off a
// background fill (no-op if one is already running or the pool is full).
export async function GET() {
  const status = getPregenStatus();
  void triggerPregeneration();
  return NextResponse.json(status);
}
