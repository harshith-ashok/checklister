import { OLLAMA_URL } from './config.ts'

export type Message = { role: 'system' | 'user'; content: string; images?: string[] }

async function chatOnce(
  model: string,
  messages: Message[],
  opts: { format?: unknown; think?: string },
): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Streamed so headers arrive at once: Node's fetch gives up after 5 min waiting for them otherwise.
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...(opts.format ? { format: opts.format } : {}),
        ...(opts.think ? { think: opts.think } : {}),
        options: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(10 * 60_000),
    })
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause
    const detail = cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : String(e))
    throw new TransientError(`Could not get a response from Ollama at ${OLLAMA_URL} (${detail}).`)
  }
  if (!res.ok || !res.body) {
    const msg = `Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`
    throw res.status >= 500 ? new TransientError(msg) : new Error(msg)
  }

  let content = ''
  let buffer = ''
  const decoder = new TextDecoder()
  const take = (line: string) => {
    if (!line.trim()) return
    const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string }
    if (chunk.error) throw new TransientError(`Ollama: ${chunk.error}`)
    content += chunk.message?.content ?? ''
  }
  try {
    for await (const part of res.body) {
      buffer += decoder.decode(part, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(take)
    }
    take(buffer)
  } catch (e) {
    if (e instanceof TransientError) throw e
    throw new TransientError(`Ollama connection dropped mid-response (${e instanceof Error ? e.message : e}).`)
  }
  return content
}

class TransientError extends Error {}

/** One chat request; retried once if Ollama (or its cloud proxy) times out or drops the connection. */
export async function chat(
  model: string,
  messages: Message[],
  opts: { format?: unknown; think?: string } = {},
): Promise<string> {
  try {
    return await chatOnce(model, messages, opts)
  } catch (e) {
    if (!(e instanceof TransientError)) throw e
    return chatOnce(model, messages, opts)
  }
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
