import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import { profiles, accounts, sessions, verificationTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: profiles,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
        // Get profile role
        const profile = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, user.id)).limit(1)
        ;(session.user as any).role = profile[0]?.role || 'member'
      }
      return session
    },
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.id) {
        // Set first user as admin
        const allProfiles = await db.select({ id: profiles.id }).from(profiles).limit(2)
        if (allProfiles.length <= 1) {
          await db.update(profiles).set({ role: 'admin' }).where(eq(profiles.id, user.id))
        }
      }
      return true
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'database',
  },
})
