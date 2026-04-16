import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isOnLogin = req.nextUrl.pathname === '/login'
  const isAuthApi = req.nextUrl.pathname.startsWith('/api/auth')
  const isCronApi = req.nextUrl.pathname.startsWith('/api/cron')
  const isPublicAsset = req.nextUrl.pathname.startsWith('/_next') ||
    req.nextUrl.pathname.startsWith('/icons') ||
    req.nextUrl.pathname === '/favicon.ico' ||
    req.nextUrl.pathname === '/manifest.json' ||
    req.nextUrl.pathname === '/sw.js'

  if (isAuthApi || isCronApi || isPublicAsset) {
    return NextResponse.next()
  }

  if (!isLoggedIn && !isOnLogin) {
    // API routes: return JSON 401 instead of an HTML login redirect so fetch/XHR callers get a parseable error.
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (isLoggedIn && isOnLogin) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
