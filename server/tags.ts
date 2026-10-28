// Tags are stored on a doc as one comma-separated string; these helpers are pure (no DB).

export function same(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function parseTags(s: unknown): string[] {
  const out: string[] = []
  for (const t of String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    if (!out.some((o) => same(o, t))) out.push(t)
  }
  return out
}

export const joinTags = (tags: string[]) => parseTags(tags.join(',')).join(',')
