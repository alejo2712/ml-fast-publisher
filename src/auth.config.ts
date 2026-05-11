/**
 * Edge-safe NextAuth v5 configuration.
 *
 * This file MUST NOT import:
 *   - bcryptjs (uses Node.js crypto)
 *   - @prisma/client or PrismaAdapter (uses Node.js APIs)
 *   - Any Node.js built-ins
 *
 * It is imported by src/middleware.ts (Edge runtime) and by src/auth.ts
 * (Node.js runtime). The full auth export in auth.ts adds the Credentials
 * provider and PrismaAdapter on top of this base config.
 */

import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt' as const },
  // No providers here — Credentials provider uses bcrypt (Node.js only)
  // and is added in auth.ts which runs only in the Node.js runtime.
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
