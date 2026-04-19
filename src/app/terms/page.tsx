import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — BOCTOR Family Hub',
  description: 'Terms of service for the BOCTOR Family Hub personal family portal.',
}

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-6">
      <h1 className="text-2xl font-semibold mb-6">Terms of Service</h1>
      <p className="text-muted-foreground mb-4">Last updated: 19 April 2026</p>

      <section className="space-y-4">
        <p>
          BOCTOR Family Hub (&quot;the app&quot;) is a private, single-household application operated by
          Maged Boctor for personal use by the Boctor family. By signing in, you agree to the
          following terms.
        </p>

        <h2 className="text-lg font-semibold mt-8">1. Eligibility</h2>
        <p>
          The app is invite-only. Only Boctor family members granted access via Google OAuth
          may use it. Any attempt to access the app by non-invited users is unauthorised.
        </p>

        <h2 className="text-lg font-semibold mt-8">2. Acceptable use</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Use the app only to manage your own household data (tasks, finances, emails).</li>
          <li>Do not attempt to extract or reverse-engineer the code or database.</li>
          <li>Do not upload content that isn&apos;t yours.</li>
        </ul>

        <h2 className="text-lg font-semibold mt-8">3. No warranty</h2>
        <p>
          The app is provided &quot;as is,&quot; without warranties of any kind. Data may be
          lost due to bugs, downtime, or infrastructure failures. Users are responsible for
          keeping their own backups of anything important.
        </p>

        <h2 className="text-lg font-semibold mt-8">4. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, the operator is not liable for any direct,
          indirect, incidental, or consequential damages arising from use of the app.
        </p>

        <h2 className="text-lg font-semibold mt-8">5. Termination</h2>
        <p>
          The operator may revoke access at any time, at sole discretion. On termination, the
          user&apos;s data will remain in the database unless the user requests deletion.
        </p>

        <h2 className="text-lg font-semibold mt-8">6. Changes to these terms</h2>
        <p>
          These terms may be updated without notice. Continued use of the app after changes
          constitutes acceptance of the new terms.
        </p>

        <h2 className="text-lg font-semibold mt-8">7. Contact</h2>
        <p>
          For questions: <a href="mailto:mboctor@gmail.com" className="text-blue-600 hover:underline">mboctor@gmail.com</a>.
        </p>
      </section>
    </main>
  )
}
