import { OLLAMA_URL } from './config.ts'

export type Message = { role: 'system' | 'user'; content: string; images?: string[] }

export async function chat(
  model: string,
  messages: Message[],
  opts: { format?: unknown; think?: string } = {},
): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(opts.format ? { format: opts.format } : {}),
        ...(opts.think ? { think: opts.think } : {}),
        options: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(10 * 60_000),
    })
  } catch {
    throw new Error(`Cannot reach Ollama at ${OLLAMA_URL}. Is it running?`)
  }
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = (await res.json()) as { message?: { content?: string } }
  return body.message?.content ?? ''
}

/** Chat with a JSON schema and parse the reply (tolerating text around the JSON). */
export async function chatJson(model: string, messages: Message[], format: unknown, think?: string) {
  const out = await chat(model, messages, { format, think })
  try {
    return JSON.parse(out)
  } catch {
    const m = out.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Model did not return JSON')
    return JSON.parse(m[0])
  }
}

export const isOllamaUp = () =>
  fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false)
