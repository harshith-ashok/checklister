import type { Doc, Item } from './api'

/** A ready-to-paste prompt for Claude (or any chat model) to teach one topic. */
export function topicPrompt(doc: Pick<Doc, 'subject' | 'name'>, item: Pick<Item, 'topic' | 'page' | 'description'>) {
  return `I'm studying "${doc.subject || doc.name}" (from "${doc.name}", page ${item.page}). Please teach me this topic:

**${item.topic}**
${item.description ? `Context from my notes: ${item.description}\n` : ''}
Please:
1. Start with a short intuitive overview, then build up to the details.
2. Include at least one diagram (Mermaid or ASCII) that shows how the pieces relate.
3. Use LaTeX for any math ($inline$ and $$display$$).
4. Give a worked example, the common mistakes, and 3 practice questions with answers.
5. Return everything as ONE well-structured Markdown file (.md) I can save as a note.`
}
