import { pgEnum } from "drizzle-orm/pg-core"

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "manager",
  "service_advisor",
  "mechanic",
  "storekeeper",
  "accountant",
])

export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
])

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "paused",
])

export const notificationKindEnum = pgEnum("notification_kind", [
  "booking_new",
  "estimate_approved",
  "estimate_declined",
  "part_arrived",
  "payment_received",
  "low_stock",
  "vendor_order_update",
  "renewal_update",
  "job_assigned",
  "qc_required",
  "system",
])

export const valuationMethodEnum = pgEnum("valuation_method", [
  "weighted_average",
  "fifo",
])

export const customerTypeEnum = pgEnum("customer_type", [
  "individual",
  "business",
  "fleet",
])

export const contactChannelEnum = pgEnum("contact_channel", [
  "sms",
  "whatsapp",
  "email",
  "push",
])

export const vehicleBodyTypeEnum = pgEnum("vehicle_body_type", [
  "sedan",
  "hatchback",
  "suv",
  "pickup",
  "van",
  "bus",
  "truck",
  "motorbike",
  "other",
])

export const fuelTypeEnum = pgEnum("fuel_type", [
  "petrol",
  "diesel",
  "hybrid",
  "electric",
  "lpg",
  "cng",
])

export const transmissionEnum = pgEnum("transmission", [
  "manual",
  "automatic",
  "cvt",
  "other",
])

export const vehicleUsageEnum = pgEnum("vehicle_usage", [
  "private",
  "commercial",
  "taxi",
  "ride_hailing",
  "fleet",
])

export const odometerSourceEnum = pgEnum("odometer_source", [
  "check_in",
  "service_record",
  "customer_update",
  "staff_update",
  "import",
])

export const odometerStatusEnum = pgEnum("odometer_status", [
  "valid",
  "flagged",
  "rejected",
])

export const documentTypeEnum = pgEnum("document_type", [
  "insurance_policy",
  "insurance_sticker",
  "roadworthy_certificate",
  "vehicle_registration",
  "drivers_licence",
  "national_id",
  "vehicle_photo",
  "invoice_pdf",
  "receipt_pdf",
  "other",
])

export const bookingStatusEnum = pgEnum("booking_status", [
  "requested",
  "confirmed",
  "checked_in",
  "no_show",
  "cancelled",
])

export const jobStatusEnum = pgEnum("job_status", [
  "booked",
  "checked_in",
  "diagnosing",
  "estimate_sent",
  "approved",
  "declined",
  "in_progress",
  "waiting_parts",
  "quality_check",
  "ready",
  "delivered",
  "closed",
  "cancelled",
])

export const jobPriorityEnum = pgEnum("job_priority", [
  "low",
  "normal",
  "high",
  "urgent",
])

export const jobItemTypeEnum = pgEnum("job_item_type", [
  "labour",
  "part",
  "sundry",
  "service_fee",
])

export const findingSeverityEnum = pgEnum("finding_severity", [
  "urgent",
  "recommended",
  "can_wait",
])

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "declined",
])

export const approvalMethodEnum = pgEnum("approval_method", [
  "magic_link",
  "portal",
  "on_behalf_phone",
  "on_behalf_in_person",
])

export const estimateStatusEnum = pgEnum("estimate_status", [
  "draft",
  "sent",
  "partially_approved",
  "approved",
  "declined",
  "expired",
  "superseded",
])

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "purchase_receipt",
  "job_issue",
  "job_return",
  "pos_sale",
  "pos_return",
  "transfer_out",
  "transfer_in",
  "adjustment",
  "vendor_return",
  "opening_balance",
])

export const vendorStatusEnum = pgEnum("vendor_status", [
  "pending",
  "approved",
  "suspended",
])

export const vendorOrderStatusEnum = pgEnum("vendor_order_status", [
  "placed",
  "accepted",
  "rejected",
  "packed",
  "out_for_delivery",
  "delivered",
  "received",
  "cancelled",
  "returned",
])

export const vendorOrderOriginEnum = pgEnum("vendor_order_origin", [
  "garage_manual",
  "garage_auto_reorder",
  "job_linked",
  "customer_to_garage",
  "customer_direct",
])

export const insurancePolicyTypeEnum = pgEnum("insurance_policy_type", [
  "third_party",
  "third_party_fire_theft",
  "comprehensive",
])

export const dvlaRecordTypeEnum = pgEnum("dvla_record_type", [
  "roadworthy",
  "registration_licence",
  "drivers_licence",
])

export const renewalKindEnum = pgEnum("renewal_kind", [
  "insurance",
  "dvla",
])

export const renewalStatusEnum = pgEnum("renewal_status", [
  "requested",
  "documents_pending",
  "quote_pending",
  "quote_sent",
  "awaiting_payment",
  "paid",
  "processing",
  "completed",
  "cancelled",
  "failed",
])

export const dueItemTypeEnum = pgEnum("due_item_type", [
  "oil_change",
  "general_service",
  "insurance",
  "roadworthy",
  "registration_licence",
  "drivers_licence",
  "instalment",
  "credit_statement",
  "custom",
])

export const dueItemStatusEnum = pgEnum("due_item_status", [
  "scheduled",
  "due_soon",
  "due",
  "overdue",
  "completed",
  "dismissed",
])

export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "suppressed_quiet_hours",
  "sent",
  "delivered",
  "read",
  "failed",
  "clicked",
])

export const messageCategoryEnum = pgEnum("message_category", [
  "transactional",
  "reminder",
  "otp",
  "marketing",
  "staff",
])

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "void",
  "written_off",
])

export const invoiceSourceEnum = pgEnum("invoice_source", [
  "job",
  "pos_sale",
  "renewal",
  "vendor_fitting",
  "manual",
  "subscription",
])

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "momo",
  "card",
  "bank_transfer",
  "cheque",
  "credit_account",
  "other",
])

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
  "partially_refunded",
])

export const paymentPlanStatusEnum = pgEnum("payment_plan_status", [
  "active",
  "completed",
  "defaulted",
  "cancelled",
])

export const instalmentStatusEnum = pgEnum("instalment_status", [
  "upcoming",
  "due",
  "paid",
  "overdue",
  "waived",
])

export const creditAccountStatusEnum = pgEnum("credit_account_status", [
  "active",
  "on_hold",
  "closed",
])

export const poStatusEnum = pgEnum("po_status", [
  "draft",
  "pending_approval",
  "sent",
  "accepted",
  "partially_delivered",
  "delivered",
  "received",
  "cancelled",
])
