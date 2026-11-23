/** Adapter interfaces per specs/integrations.json. */

export type MessageChannel = "sms" | "whatsapp" | "email" | "push"

export type MessageSendInput = {
  channel: MessageChannel
  to: string
  templateKey: string
  variables: Record<string, string>
  rendered: { subject?: string; body: string; title?: string }
  whatsappTemplateName?: string
  whatsappParams?: string[]
  idempotencyKey: string
}

export type MessageSendResult = {
  providerMessageId: string
  costUnits: number
}

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed"

export type StatusWebhookEvent = {
  providerMessageId: string
  status: DeliveryStatus
  failedReason?: string
  at: string
}

export type InboundMessage = {
  from: string
  channel: MessageChannel
  text: string
  at: string
}

export interface MessagingProvider {
  readonly name: string
  send(input: MessageSendInput): Promise<MessageSendResult>
  parseStatusWebhook(req: Request): Promise<StatusWebhookEvent[]>
  parseInboundWebhook(req: Request): Promise<InboundMessage[]>
}

export type PaymentInitResult = { authorizationUrl: string; reference: string }
export type MoMoChargeResult = { status: string; displayText: string }
export type PaymentVerification = {
  status: "success" | "failed" | "pending"
  amountPesewas: bigint
  channel?: string
  paidAt?: string
}
export type RefundResult = { refundId: string; status: string }

export interface PaymentProvider {
  readonly name: string
  initializeCheckout(input: {
    amountPesewas: bigint
    email?: string
    phone?: string
    reference: string
    metadata?: Record<string, string>
    /** App path to return to after hosted checkout (e.g. /pay/abc). */
    returnPath?: string
    description?: string
  }): Promise<PaymentInitResult>
  chargeMobileMoney(input: {
    amountPesewas: bigint
    phone: string
    network: "mtn" | "telecel" | "airteltigo"
    reference: string
    metadata?: Record<string, string>
    description?: string
  }): Promise<MoMoChargeResult>
  verify(reference: string): Promise<PaymentVerification>
  refund(input: { reference: string; amountPesewas?: bigint }): Promise<RefundResult>
  parseWebhook(req: Request): Promise<{ event: string; data: unknown; eventId: string }>
}

export interface StorageProvider {
  readonly name: string
  put(key: string, body: Uint8Array | string, contentType?: string): Promise<{ key: string }>
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>
  delete(key: string): Promise<void>
}

export type PayoutNetwork = "mtn" | "telecel" | "airteltigo"

export type PayoutResult =
  | { status: "success"; providerReference?: string; accountName?: string }
  | { status: "pending"; providerReference?: string; accountName?: string }
  | { status: "failed"; code: string; message: string; retryable: boolean }

export interface PayoutProvider {
  readonly name: string
  /** Send money from FixAm's float to a MoMo wallet. */
  transferMomo(input: { amountPesewas: bigint; phone: string; network: PayoutNetwork; transactionId: string; description: string }): Promise<PayoutResult>
  /** Send money from FixAm's float to a Ghana bank account (name enquiry + authorize). */
  transferBank(input: { amountPesewas: bigint; accountNumber: string; bankCode: string; transactionId: string; description: string; expectedName?: string }): Promise<PayoutResult>
  /** Check a payout that came back pending. */
  verifyTransfer(transactionId: string): Promise<PayoutResult>
}
