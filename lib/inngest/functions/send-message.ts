import { inngest } from "../client"
import { sendMessage } from "@/lib/messaging/send"
import type { MessageChannel } from "@/lib/integrations/types"

/**
 * send-message — renders a template and dispatches via the messaging
 * provider selected by env (mock locally). Quiet hours defer to 07:00.
 */
export const sendMessageFn = inngest.createFunction(
  {
    id: "send-message",
    retries: 3,
    triggers: [{ event: "message/send" }],
  },
  async ({ event, step }) => {
    const data = event.data as {
      garageId: string
      channel: MessageChannel
      to: string
      templateKey: string
      variables: Record<string, string>
      idempotencyKey?: string
    }

    return step.run("dispatch", () =>
      sendMessage({
        garageId: data.garageId,
        channel: data.channel,
        to: data.to,
        templateKey: data.templateKey,
        variables: data.variables,
        idempotencyKey: data.idempotencyKey,
      })
    )
  }
)
