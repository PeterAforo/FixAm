import "server-only"
import type { DeliveryBooking, DeliveryProvider } from "./delivery/types"

/**
 * DELIVERY_PROVIDER=manual|mock (default manual). "manual" asks the FixAm ops
 * team to book a partner courier (SMS to DELIVERY_OPS_PHONE or ADMIN_ALERT_PHONE)
 * and returns a reference; a real courier API can slot in here later.
 */

function manualProvider(): DeliveryProvider {
  return {
    name: "manual",
    async book(input): Promise<DeliveryBooking> {
      const reference = `CR-${input.orderNumber}`
      const to = process.env.DELIVERY_OPS_PHONE || process.env.ADMIN_ALERT_PHONE
      if (to) {
        const { messagingProvider } = await import("./index")
        await messagingProvider("sms")
          .send({
            channel: "sms",
            to,
            templateKey: "ops.courier_request",
            variables: {},
            rendered: {
              body: `Courier needed ${reference}: pick up from ${input.pickup.name} ${input.pickup.phone}${input.pickup.city ? ` (${input.pickup.city})` : ""} → ${input.dropoff.name}${input.dropoff.city ? `, ${input.dropoff.city}` : ""}${input.dropoff.phone ? ` ${input.dropoff.phone}` : ""}.`.slice(0, 300),
            },
            idempotencyKey: `courier:${reference}`,
          })
          .catch(() => undefined)
      }
      return { reference, status: "requested" }
    },
  }
}

function mockProvider(): DeliveryProvider {
  return {
    name: "mock",
    async book(input) {
      return { reference: `MOCK-${input.orderNumber}`, status: "assigned", riderName: "Kwame (mock courier)", riderPhone: "+233240000000" }
    },
  }
}

let cached: DeliveryProvider | undefined

export function deliveryProvider(): DeliveryProvider {
  if (cached) return cached
  cached = process.env.DELIVERY_PROVIDER === "mock" ? mockProvider() : manualProvider()
  return cached
}

export type { DeliveryProvider }
