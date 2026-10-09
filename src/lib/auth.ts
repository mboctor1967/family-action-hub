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
          // gmail.send added 2026-10-10 for the email digest channel. Widening the existing
          // grant rather than adding an email provider - see DEC-1 in
          // docs/features/2026-10-10-digest-channel-email.md. Takes effect only after a
          // sign-out/sign-in AND Reconnect Gmail, which copies it into gmail_accounts.
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
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

        // Always update OAuth tokens so a scope change takes effect on the next sign-in
        if (account.access_token) {
          await db.update(accounts).set({
            access_token: account.access_token,
            refresh_token: account.refresh_token || undefined,
            expires_at: account.expires_at || undefined,
            scope: account.scope || undefined,
          }).where(
            eq(accounts.providerAccountId, account.providerAccountId)
          )
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
