import Link from "next/link"
import { LegalPage } from "@/components/marketing/legal-page"
import { site } from "@/lib/site"

export const metadata = {
  title: "Terms of service",
  description: "The terms that apply when garages, staff, drivers and vendors use FixAm.",
}

// DRAFT — review with a Ghanaian lawyer and complete the [bracketed] details before launch.
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro="The agreement between FixAm and the garages, staff, drivers and vendors who use it."
      updated="[date]"
      sections={[
        {
          id: "agreement",
          title: "Agreement",
          body: <p>By creating an account or using FixAm you agree to these terms. If you use FixAm on behalf of a garage or business, you confirm you have authority to accept them for that business. FixAm is provided by <strong>[Company legal name]</strong>.</p>,
        },
        {
          id: "accounts",
          title: "Accounts",
          body: (
            <ul>
              <li>Keep your login details safe and tell us straight away if you think your account has been accessed without permission.</li>
              <li>Garage owners are responsible for the staff they invite and the roles they give them.</li>
              <li>You must give accurate information and keep it up to date.</li>
            </ul>
          ),
        },
        {
          id: "subscriptions",
          title: "Plans, trials and billing",
          body: (
            <>
              <p>New garages get a 14-day free trial. After that, plans are billed monthly in Ghana cedis by Mobile Money or card, as shown on our <Link href="/pricing">pricing page</Link>.</p>
              <p>If a payment fails, the account may become read-only after a grace period until the subscription is paid. You can cancel at any time; cancellation takes effect at the end of the current billing period.</p>
            </>
          ),
        },
        {
          id: "payments",
          title: "Customer payments",
          body: <p>Payments from drivers to garages are processed by our payment provider and paid out to the garage. The garage is responsible for its prices, the work it carries out, refunds and any taxes due on its sales.</p>,
        },
        {
          id: "messages",
          title: "Messages and reminders",
          body: <p>Garages must only send reminders to customers who have a relationship with them, and must respect opt-outs. Each plan includes a monthly message allowance; extra messages can be purchased as bundles.</p>,
        },
        {
          id: "renewals",
          title: "Insurance and DVLA renewals",
          body: <p>Garages that offer renewals act on the driver&apos;s behalf. Insurance renewals are provided through licensed partner insurers or brokers. FixAm provides the tools to manage these requests and is not itself an insurer or a government agency.</p>,
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          body: (
            <ul>
              <li>Don&apos;t use FixAm for anything unlawful, fraudulent or misleading.</li>
              <li>Don&apos;t try to access another garage&apos;s data or interfere with the service.</li>
              <li>Don&apos;t upload content you don&apos;t have the right to share.</li>
            </ul>
          ),
        },
        {
          id: "data",
          title: "Your data",
          body: <p>Garages own the data they put into FixAm. We use it only to provide the service, as described in our <Link href="/privacy">privacy policy</Link>. You can export your data at any time.</p>,
        },
        {
          id: "liability",
          title: "Liability",
          body: <p>We work hard to keep FixAm available and accurate, but the service is provided &ldquo;as is&rdquo;. To the extent permitted by law, our total liability is limited to <strong>[the fees paid in the previous 12 months]</strong>. Garages remain responsible for the repairs and services they provide.</p>,
        },
        {
          id: "law",
          title: "Governing law and contact",
          body: <p>These terms are governed by the laws of the Republic of Ghana. Questions? Email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.</p>,
        },
      ]}
    />
  )
}
