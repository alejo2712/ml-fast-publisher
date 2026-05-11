/**
 * Edge-safe middleware for route protection.
 *
 * Uses NextAuth(authConfig) — the edge-safe config that has no Node.js
 * dependencies (no bcrypt, no Prisma, no PrismaAdapter).
 *
 * JWT verification is done entirely via Web Crypto, which IS available
 * in the Edge runtime. The full auth.ts (Node.js only) is NOT imported here.
 */
import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

// Protected path prefixes — redirect to /login if unauthenticated
const PROTECTED = ['/dashboard', '/drafts', '/templates', '/history', '/settings'];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));

  if (isProtected && !req.auth) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
