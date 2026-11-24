import { and, asc, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db'
import { ValidationError } from '../errors'
import {
  deskMessages,
  deskThreads,
  type DeskMessage,
  type DeskThread,
} from './schema'

export async function createDeskThread(
  userId: string,
  title = 'Ops desk',
): Promise<DeskThread> {
  const id = randomUUID()
  const [row] = await db
    .insert(deskThreads)
    .values({ id, userId, title: title.trim() || 'Ops desk' })
    .returning()
  return row
}

export async function getDeskThreadForUser(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(deskThreads)
    .where(and(eq(deskThreads.id, id), eq(deskThreads.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function listDeskThreadsForUser(userId: string) {
  return db
    .select()
    .from(deskThreads)
    .where(eq(deskThreads.userId, userId))
    .orderBy(desc(deskThreads.updatedAt))
    .limit(20)
}

export async function touchDeskThread(id: string) {
  await db
    .update(deskThreads)
    .set({ updatedAt: new Date() })
    .where(eq(deskThreads.id, id))
}

export async function appendDeskMessage(
  threadId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<DeskMessage> {
  const trimmed = content.trim()
  if (!trimmed) throw new ValidationError('Message content required')
  const id = randomUUID()
  const [row] = await db
    .insert(deskMessages)
    .values({ id, threadId, role, content: trimmed })
    .returning()
  await touchDeskThread(threadId)
  return row
}

export async function listDeskMessages(threadId: string) {
  return db
    .select()
    .from(deskMessages)
    .where(eq(deskMessages.threadId, threadId))
    .orderBy(asc(deskMessages.createdAt))
    .limit(200)
}

export function toModelMessages(
  messages: DeskMessage[],
): { role: 'user' | 'assistant'; content: string }[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
}
