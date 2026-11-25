/**
 * Providers an admin can configure in /admin/integrations. Safe for client
 * code (no secrets here — just field definitions). Adding a provider means:
 * an entry here plus an adapter wired in lib/integrations/router.ts.
 */
export type IntegrationCategory = "payments" | "sms"

export type ProviderField = {
  key: string
  label: string
  /** Stored encrypted and never sent back to the browser. */
  secret?: boolean
  required?: boolean
  placeholder?: string
  help?: string
  options?: { value: string; label: string }[]
  multiline?: boolean
}

export type ProviderDef = {
  category: IntegrationCategory
  provider: string
  name: string
  description: string
  docsUrl?: string
  fields: ProviderField[]
  /** What still runs elsewhere (e.g. payouts stay on theTeller). */
  note?: string
}

const SENDER: ProviderField = {
  key: "sender_id",
  label: "Sender ID",
  placeholder: "FIXAM",
  help: "Up to 11 letters, approved by the provider.",
}

export const PROVIDERS: ProviderDef[] = [
  {
    category: "payments",
    provider: "theteller",
    name: "theTeller (PaySwitch)",
    description: "MoMo and card checkout, plus payouts to garages, sellers, tow operators and riders.",
    docsUrl: "https://theteller.net/documentation",
    fields: [
      { key: "env", label: "Mode", required: true, options: [{ value: "test", label: "Test" }, { value: "live", label: "Live" }] },
      { key: "merchant_id", label: "Merchant ID", required: true },
      { key: "api_user", label: "API username", required: true },
      { key: "api_key", label: "API key", secret: true, required: true },
      { key: "pass_code", label: "Float pass code", secret: true, help: "Needed for payouts from your float account." },
    ],
  },
  {
    category: "payments",
    provider: "paystack",
    name: "Paystack",
    description: "MoMo, card and bank transfer checkout (1.95% in Ghana).",
    docsUrl: "https://paystack.com/docs",
    fields: [
      { key: "secret_key", label: "Secret key", secret: true, required: true, placeholder: "sk_live_…" },
      { key: "public_key", label: "Public key", placeholder: "pk_live_…" },
    ],
    note: "Payouts keep using theTeller (your float), so keep theTeller set up too.",
  },
  {
    category: "sms",
    provider: "arkesel",
    name: "Arkesel",
    description: "Ghana bulk SMS and sign-in codes.",
    docsUrl: "https://developers.arkesel.com",
    fields: [{ key: "api_key", label: "API key", secret: true, required: true }, SENDER],
  },
  {
    category: "sms",
    provider: "hubtel",
    name: "Hubtel",
    description: "Ghana bulk SMS (Quick Send).",
    docsUrl: "https://developers.hubtel.com",
    fields: [
      { key: "client_id", label: "Client ID", required: true },
      { key: "client_secret", label: "Client secret", secret: true, required: true },
      SENDER,
    ],
  },
  {
    category: "sms",
    provider: "mnotify",
    name: "mNotify",
    description: "Ghana bulk SMS.",
    docsUrl: "https://developer.mnotify.com",
    fields: [{ key: "api_key", label: "API key", secret: true, required: true }, SENDER],
  },
  {
    category: "sms",
    provider: "custom_http",
    name: "Other SMS API (custom)",
    description: "Any SMS gateway with an HTTP API. Fill in its address and message format.",
    fields: [
      { key: "url", label: "Send URL", required: true, placeholder: "https://api.example.com/sms/send" },
      { key: "method", label: "Method", required: true, options: [{ value: "POST", label: "POST (JSON body)" }, { value: "GET", label: "GET (query string)" }] },
      { key: "auth_header", label: "Auth header name", placeholder: "Authorization" },
      { key: "auth_value", label: "Auth header value", secret: true, placeholder: "Bearer …" },
      {
        key: "body_template",
        label: "Body / query template",
        multiline: true,
        placeholder: '{"to":"{{to}}","message":"{{message}}","sender":"{{sender}}"}',
        help: "Use {{to}} (233…), {{message}} and {{sender}}. For GET, write it as to={{to}}&text={{message}}.",
      },
      { key: "success_contains", label: "Reply must contain", placeholder: "success", help: "Optional. Leave blank to accept any 2xx reply." },
      SENDER,
    ],
  },
]

export function providerDef(category: string, provider: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.category === category && p.provider === provider)
}

export const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  payments: "Payment gateways",
  sms: "SMS",
}
