import { RolePicker } from "@/app/(auth)/onboarding/role-picker"

export const metadata = { title: "Create your account" }

/** Public role chooser → /signup/<role>. Signed-in visitors are sent to /onboarding by the proxy. */
export default function SignupPage() {
  return <RolePicker mode="signup" needsName={false} existing={[]} hasWorkspaces={false} />
}
