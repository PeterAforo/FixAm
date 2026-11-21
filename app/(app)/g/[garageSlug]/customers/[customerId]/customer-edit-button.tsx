"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { Button } from "@/components/brand/button"
import { CustomerFormDrawer, type CustomerFormValues } from "../customer-form-drawer"

type Customer = {
  id: string
  type: "individual" | "business" | "fleet"
  fullName: string
  companyName: string | null
  phone: string
  altPhone: string | null
  email: string | null
  whatsappOptIn: boolean | null
  marketingOptIn: boolean | null
  preferredChannels: string[] | null
  tags: string[] | null
  notes: string | null
  address: string | null
}

export function CustomerEditButton({
  garageId,
  garageSlug,
  customer,
}: {
  garageId: string
  garageSlug: string
  customer: Customer
}) {
  const [open, setOpen] = useState(false)

  const initial: CustomerFormValues = {
    id: customer.id,
    type: customer.type,
    fullName: customer.fullName,
    companyName: customer.companyName ?? "",
    phone: customer.phone,
    altPhone: customer.altPhone ?? "",
    email: customer.email ?? "",
    whatsappOptIn: customer.whatsappOptIn ?? true,
    marketingOptIn: customer.marketingOptIn ?? false,
    preferredChannels: customer.preferredChannels ?? ["whatsapp", "sms"],
    tags: customer.tags ?? [],
    notes: customer.notes ?? "",
    address: customer.address ?? "",
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="size-4" /> Edit
      </Button>
      <CustomerFormDrawer
        garageId={garageId}
        garageSlug={garageSlug}
        open={open}
        onClose={() => setOpen(false)}
        initial={initial}
        onSaved={() => setOpen(false)}
      />
    </>
  )
}
