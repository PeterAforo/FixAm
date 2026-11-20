"use client"

import { createContext, useContext, type ReactNode } from "react"
import { can, type Permission, type Principal } from "@/lib/auth/permissions"

/**
 * Client-side permission helpers. The Principal is resolved server-side
 * (membership → role) and passed down — the client never decides access,
 * it only hides/shows UI. Enforcement stays in `action()`.
 */

const PrincipalContext = createContext<Principal | null>(null)

export function PrincipalProvider({
  principal,
  children,
}: {
  principal: Principal
  children: ReactNode
}) {
  return (
    <PrincipalContext.Provider value={principal}>
      {children}
    </PrincipalContext.Provider>
  )
}

export function usePrincipal(): Principal | null {
  return useContext(PrincipalContext)
}

export function useCan(permission: Permission | string): boolean {
  const principal = usePrincipal()
  if (!principal) return false
  return can(principal, permission)
}

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission | string
  children: ReactNode
  fallback?: ReactNode
}) {
  return useCan(permission) ? <>{children}</> : <>{fallback}</>
}
