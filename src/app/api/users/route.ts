import { NextRequest, NextResponse } from 'next/server';
import { getDb, listUsers, createUser } from '@/utils/db';

export async function GET() {
  try {
    const db = getDb();
    const users = listUsers(db);
    return NextResponse.json({ users });
  } catch (error: any) {
    console.error('❌ [USERS API] Failed to list users:', error.message);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const db = getDb();
    const user = createUser(db, name);
    console.log('✅ [USERS API] Created profile:', user.name);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error: any) {
    console.error('❌ [USERS API] Failed to create user:', error.message);
    if (typeof error.message === 'string' && error.message.includes('UNIQUE')) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
