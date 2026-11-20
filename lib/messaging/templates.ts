import templatesSpec from "../../docs/devin-spec/specs/message-templates.json"

/**
 * Message template rendering from specs/message-templates.json.
 * Bodies use {{variable}} placeholders.
 */

type ChannelContent = {
  body?: string
  subject?: string
  template_name?: string
  category?: string
  whatsapp_params?: string[]
}

type Template = {
  key: string
  category: string
  channels: Partial<Record<"sms" | "whatsapp" | "email" | "push", ChannelContent>>
}

const templates = new Map<string, Template>(
  (templatesSpec.templates as Template[]).map((t) => [t.key, t])
)

export function getTemplate(key: string): Template | undefined {
  return templates.get(key)
}

export function templateKeys(): string[] {
  return [...templates.keys()]
}

export function renderBody(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => variables[name] ?? "")
}

export type RenderedTemplate = {
  body: string
  subject?: string
  whatsappTemplateName?: string
  whatsappParams?: string[]
}

export function renderTemplate(
  key: string,
  channel: "sms" | "whatsapp" | "email" | "push",
  variables: Record<string, string>
): RenderedTemplate {
  const tpl = templates.get(key)
  if (!tpl) throw new Error(`Unknown message template: ${key}`)

  const content = tpl.channels[channel]
  if (!content?.body && channel !== "whatsapp") {
    throw new Error(`Template ${key} has no ${channel} content`)
  }

  const body = content?.body ? renderBody(content.body, variables) : ""

  return {
    body,
    subject: content?.subject ? renderBody(content.subject, variables) : undefined,
    whatsappTemplateName: content?.template_name,
    whatsappParams: content?.whatsapp_params?.map((p) => variables[p] ?? ""),
  }
}
