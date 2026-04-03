'use client'

import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail } from 'lucide-react'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-blue-900">
            BOCTOR Family Hub
          </CardTitle>
          <CardDescription>
            Sign in to manage your family tasks and emails
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="w-full"
            size="lg"
          >
            <Mail className="mr-2 h-5 w-5" />
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
