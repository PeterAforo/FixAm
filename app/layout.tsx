import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { TableCardLabels } from "@/components/shell/table-card-labels"
import { NextIntlClientProvider } from "next-intl"
import { getMessages } from "next-intl/server"
import "./globals.css"
import "./table-cards.css"
import "./motion.css"

const bricolage = { variable: "", className: "" }

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: {
    default: "FixAm — Garage operating system for Ghana",
    template: "%s · FixAm",
  },
  description:
    "Repairs, parts, vendors, reminders, renewals and money — one vibrant SaaS for Ghanaian garages.",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  const messages = await getMessages()
  return (
    <html
      lang="en-GH"
      suppressHydrationWarning
      className={`${bricolage.variable} ${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          themes={["light", "dark", "sunlight"]}
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
        <TableCardLabels />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
