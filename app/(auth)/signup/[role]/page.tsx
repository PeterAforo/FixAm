import { notFound } from "next/navigation"
import { ROLE_OPTIONS, roleBySlug } from "@/app/(auth)/onboarding/roles"
import { SignupRole } from "./signup-role"

type Params = Promise<{ role: string }>

export function generateStaticParams() {
  return ROLE_OPTIONS.map((r) => ({ role: r.slug }))
}

export async function generateMetadata({ params }: { params: Params }) {
  const role = roleBySlug((await params).role)
  return { title: role ? `Sign up — ${role.title}` : "Sign up" }
}

/** /signup/garage, /signup/driver, /signup/parts-seller, /signup/insurance-broker, /signup/dvla-agent */
export default async function SignupRolePage({ params }: { params: Params }) {
  const role = roleBySlug((await params).role)
  if (!role) notFound()
  return <SignupRole slug={role.slug} />
}
