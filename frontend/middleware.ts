import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Since we're using localStorage for JWT tokens (client-side only),
// this middleware is simplified. The actual auth checks are done
// client-side in the page components using useEffect hooks.

export function middleware(request: NextRequest) {
  // Allow all requests to pass through
  // Client-side pages will handle authentication checks
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
