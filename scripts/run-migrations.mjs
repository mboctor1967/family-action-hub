import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUPABASE_URL = 'https://mvtxmenyyoyitpvfmbys.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12dHhtZW55eW95aXRwdmZtYnlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDcwMTYzNSwiZXhwIjoyMDkwMjc3NjM1fQ.5MD4M3Edhq-SUrHxuVj5aBe1cmrHMDjyoKi30Zc7hXI'

async function runSQL(sql, label) {
  console.log(`\nRunning: ${label}...`)

  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    // Try alternative endpoint
    const res2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    })

    if (!res2.ok) {
      const text = await res.text()
      console.error(`Failed: ${text}`)
      return false
    }
  }

  const data = await res.text()
  console.log(`Success: ${label}`)
  return true
}

async function main() {
  // Read migration files
  const migration1 = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql'), 'utf-8')
  const migration2 = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '002_seed_topics.sql'), 'utf-8')

  // Try running via pg/query endpoint first
  let success = await runSQL(migration1, '001_initial_schema')
  if (success) {
    await runSQL(migration2, '002_seed_topics')
  } else {
    console.log('\nDirect SQL endpoint not available. Trying via createClient...')

    // Fallback: use supabase-js to run individual table creates
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Split SQL into individual statements and run via rpc if available
    // Or check if tables already exist
    const { data, error } = await supabase.from('profiles').select('id').limit(1)
    if (error && error.code === '42P01') {
      console.log('Tables do not exist yet. Please run migrations via Supabase SQL Editor.')
      console.log('Migration files are at:')
      console.log('  supabase/migrations/001_initial_schema.sql')
      console.log('  supabase/migrations/002_seed_topics.sql')
    } else if (error) {
      console.log('Error checking tables:', error.message)
    } else {
      console.log('Tables already exist!')
    }
  }
}

main().catch(console.error)
