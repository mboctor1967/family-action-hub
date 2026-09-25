import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDeliveryHealth } from '@/lib/whatsapp/outbound-log'
import { digestRecipients } from '@/lib/whatsapp/daily-digest'

/** Per-recipient WhatsApp delivery health for the Settings card. AC-007. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(await getDeliveryHealth(digestRecipients()))
}
