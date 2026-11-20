import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { sendMessageFn } from "@/lib/inngest/functions/send-message"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendMessageFn],
})
