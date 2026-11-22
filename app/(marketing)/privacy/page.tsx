import { LegalPage } from "@/components/marketing/legal-page"
import { site } from "@/lib/site"

export const metadata = {
  title: "Privacy policy",
  description: "How FixAm collects, uses and protects personal data for garages and drivers in Ghana.",
}

// DRAFT — review with a Ghanaian lawyer and complete the [bracketed] details before launch.
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="How we collect, use and protect information about garages, their staff and the drivers they serve."
      updated="[date]"
      sections={[
        {
          id: "who-we-are",
          title: "Who we are",
          body: (
            <>
              <p>
                FixAm is operated by <strong>[Company legal name]</strong>, registered in Ghana under number <strong>[registration number]</strong>, with its office in {site.city}. In this policy, &ldquo;FixAm&rdquo;, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean that company.
              </p>
              <p>
                We comply with Ghana&apos;s Data Protection Act, 2012 (Act 843). Where a garage uses FixAm to manage its own customers, the garage decides how that customer information is used and we process it on the garage&apos;s behalf.
              </p>
            </>
          ),
        },
        {
          id: "what-we-collect",
          title: "Information we collect",
          body: (
            <ul>
              <li><strong>Account details</strong> — names, phone numbers, email addresses and roles of garage owners and staff.</li>
              <li><strong>Customer and vehicle records</strong> — names, phone numbers, vehicle details, odometer readings, service history, photos and documents that garages record or that drivers upload.</li>
              <li><strong>Payment information</strong> — amounts, references and status of payments. Card and Mobile Money details are handled by our payment provider; we don&apos;t store full card numbers.</li>
              <li><strong>Messages</strong> — records of reminders and notifications sent by SMS, WhatsApp, email or push, and replies such as mileage updates.</li>
              <li><strong>Usage data</strong> — device, browser and log information used to keep the service secure and working well.</li>
            </ul>
          ),
        },
        {
          id: "how-we-use",
          title: "How we use information",
          body: (
            <ul>
              <li>To provide FixAm: running jobs, estimates, invoices, payments, reminders and renewals.</li>
              <li>To send service messages such as tracker links, receipts and reminders the driver or garage has asked for.</li>
              <li>To keep accounts secure, prevent fraud and meet our legal obligations.</li>
              <li>To improve the product using aggregated, de-identified data.</li>
            </ul>
          ),
        },
        {
          id: "sharing",
          title: "Who we share it with",
          body: (
            <>
              <p>We never sell personal data. We share it only where needed to run the service:</p>
              <ul>
                <li><strong>The garage you deal with</strong> — each garage sees only its own customers and visits.</li>
                <li><strong>Service providers</strong> — hosting, payments, SMS, WhatsApp and email providers that process data on our instructions.</li>
                <li><strong>Insurers and DVLA</strong> — only when a driver asks their garage to process a renewal on their behalf.</li>
                <li><strong>Authorities</strong> — where the law requires it.</li>
              </ul>
            </>
          ),
        },
        {
          id: "retention",
          title: "How long we keep it",
          body: <p>We keep information for as long as the garage&apos;s account is active and for <strong>[period]</strong> afterwards, or longer where financial records must be kept by law.</p>,
        },
        {
          id: "your-rights",
          title: "Your rights",
          body: (
            <>
              <p>You can ask to see, correct or delete your personal data, and you can turn off reminder messages at any time by replying STOP or changing your settings in the customer portal.</p>
              <p>To make a request, email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>. You can also contact the Data Protection Commission of Ghana.</p>
            </>
          ),
        },
        {
          id: "security",
          title: "Security",
          body: <p>Data is encrypted in transit, access is restricted by role, each garage&apos;s data is isolated from every other garage, and sensitive actions are recorded in an audit log.</p>,
        },
        {
          id: "changes",
          title: "Changes to this policy",
          body: <p>We&apos;ll post any changes on this page and update the date above. For significant changes we&apos;ll let account owners know by email or in the app.</p>,
        },
      ]}
    />
  )
}
