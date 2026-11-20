"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/auth/supabase/client"
import { Button } from "@/components/brand/button"
import { LogOut } from "lucide-react"

export function SignOutButton() {
  const router = useRouter()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await createClient().auth.signOut()
        router.push("/login")
        router.refresh()
      }}
    >
      <LogOut />
      Sign out
    </Button>
  )
}
