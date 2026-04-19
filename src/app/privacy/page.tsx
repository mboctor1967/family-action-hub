import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — BOCTOR Family Hub',
  description: 'Privacy policy for the BOCTOR Family Hub personal family portal.',
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-6">
      <h1 className="text-2xl font-semibold mb-6">Privacy Policy</h1>
      <p className="text-muted-foreground mb-4">Last updated: 19 April 2026</p>

      <section className="space-y-4">
        <p>
          BOCTOR Family Hub (&quot;the app&quot;) is a private, single-household application operated by
          Maged Boctor for personal use by the Boctor family. This policy explains what data
          the app stores, how it is used, and who can access it.
        </p>

        <h2 className="text-lg font-semibold mt-8">Who this policy applies to</h2>
        <p>
          Only members of the Boctor family, explicitly invited via Google OAuth, can sign into
          and use the app. The app is not intended for, nor made available to, the general public.
        </p>

        <h2 className="text-lg font-semibold mt-8">What data the app collects</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Google OAuth profile details: name, email, avatar URL.</li>
          <li>Gmail messages the user chooses to scan (subjects, senders, snippets, AI-derived classifications).</li>
          <li>Financial statements and transactions the user imports (CSV/QFX/QIF files from personal bank accounts).</li>
          <li>Tasks, comments, and subtasks the user creates.</li>
          <li>WhatsApp messages sent to the family bot, stored only as message IDs for idempotency.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-8">How data is used</h2>
        <p>
          All data stays within the app for the user&apos;s own household management. No analytics,
          no ad networks, no third-party sharing beyond the infrastructure providers listed below.
        </p>

        <h2 className="text-lg font-semibold mt-8">Where data is stored</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Neon</strong> (Postgres, hosted in Sydney) — primary database.</li>
          <li><strong>Vercel</strong> — application hosting.</li>
          <li><strong>Google</strong> — OAuth + Gmail API (when user chooses to scan).</li>
          <li><strong>Anthropic (Claude)</strong> — optional AI categorization and triage; only invoked when the user explicitly enables it in Settings.</li>
          <li><strong>Meta WhatsApp Cloud API</strong> — inbound/outbound messages for the family bot.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-8">Data retention</h2>
        <p>
          Data is retained until the user deletes it from the app or until the app is
          decommissioned. On decommissioning, the database will be destroyed.
        </p>

        <h2 className="text-lg font-semibold mt-8">Your rights</h2>
        <p>
          As the sole administrator, the user has full control to view, export, or delete any
          data from the database at any time. For family members, the admin fulfils these
          requests directly.
        </p>

        <h2 className="text-lg font-semibold mt-8">Contact</h2>
        <p>
          For questions or concerns: <a href="mailto:mboctor@gmail.com" className="text-blue-600 hover:underline">mboctor@gmail.com</a>.
        </p>
      </section>
    </main>
  )
}
