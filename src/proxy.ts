import { NextRequest, NextResponse } from 'next/server';

// Shared-password gate for the deployed app. There are no real accounts here —
// profiles are just names in localStorage (src/utils/session.ts) — so this exists
// mainly to stop strangers from spending the OpenAI key via /api/tests/generate.
//
// Basic auth means the browser handles the prompt and replays the credentials on
// every request, including fetches from client components. The tradeoff is there
// is no "log out" short of closing the browser.

const REALM = 'PreACT TestPrep';

function unauthorized(message = 'Authentication required') {
  return new NextResponse(message, {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
    },
  });
}

// Compares without an early return, so response time doesn't leak how many
// leading characters of a guess were right.
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export default function proxy(request: NextRequest) {
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    // Unset in production almost certainly means a missing Fly secret. Locking
    // everyone out is the safe failure: the alternative is silently serving the
    // app, and the API key behind it, to the open internet.
    if (process.env.NODE_ENV === 'production') {
      return unauthorized('APP_PASSWORD is not configured on the server.');
    }
    return NextResponse.next();
  }

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(header.slice('Basic '.length));
  } catch {
    return unauthorized();
  }

  // Everyone shares one password, so the username half is ignored — any value works.
  const separator = decoded.indexOf(':');
  const password = separator === -1 ? '' : decoded.slice(separator + 1);

  return safeEqual(password, expected) ? NextResponse.next() : unauthorized();
}

export const config = {
  // Everything except build assets. API routes are deliberately included — they
  // are the expensive surface, and the browser attaches credentials to same-origin
  // fetches automatically once the initial prompt is satisfied.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
