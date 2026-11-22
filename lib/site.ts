/**
 * Public contact details used on marketing pages (contact, support, footer).
 * Set these in .env.local / Vercel env. WhatsApp and phone are hidden when unset.
 */
export const site = {
  name: "FixAm",
  tagline: "The garage operating system for Ghana",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@fixam.app",
  salesEmail: process.env.NEXT_PUBLIC_SALES_EMAIL ?? process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@fixam.app",
  /** E.164 without "+", e.g. 233241234567 */
  whatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "",
  /** Display phone, e.g. +233 24 123 4567 */
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "",
  city: "Accra, Ghana",
  supportHours: "Monday to Saturday, 8:00 am – 6:00 pm GMT",
}

export const whatsappLink = (text?: string) =>
  site.whatsapp ? `https://wa.me/${site.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null
