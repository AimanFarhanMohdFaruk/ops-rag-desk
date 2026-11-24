import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core'

/** Better Auth core tables + kit domain tables. Fat models import from here. */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Better Auth admin plugin fields (manual — CLI generate omits them)
  role: text('role').notNull().default('user'),
  banned: boolean('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  impersonatedBy: text('impersonated_by'),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

/** Simple user-owned Post — kit CRUD demo (not tied to the queue). */
export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/** Uploaded ops corpus docs — bytes in object store, metadata + extracted text here. */
export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  key: text('key').notNull().unique(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  status: text('status').notNull().default('uploaded'),
  extractedText: text('extracted_text'),
  indexedAt: timestamp('indexed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/** Chunks for user-scoped RAG — replaced on re-embed. */
export const documentChunks = pgTable('document_chunks', {
  id: text('id').primaryKey(),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  ordinal: integer('ordinal').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

/** Ops Desk agent thread (one per conversation). */
export const deskThreads = pgTable('desk_threads', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('Ops desk'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const deskMessages = pgTable('desk_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => deskThreads.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

/** One agent turn — accept ≠ execute (worker owns the loop). */
export const agentRuns = pgTable('agent_runs', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => deskThreads.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('queued'),
  input: text('input').notNull(),
  output: text('output'),
  stopReason: text('stop_reason'),
  error: text('error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  finishedAt: timestamp('finished_at'),
})

export const agentRunSteps = pgTable('agent_run_steps', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  type: text('type').notNull(),
  name: text('name'),
  payload: text('payload'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

/** Conversational HITL — one pending ask per thread. */
export const agentAsks = pgTable(
  'agent_asks',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => deskThreads.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    questions: text('questions').notNull(),
    status: text('status').notNull().default('pending'),
    answer: text('answer'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
  },
  (t) => [
    uniqueIndex('agent_asks_one_pending_per_thread_uidx')
      .on(t.threadId)
      .where(sql`${t.status} = 'pending'`),
  ],
)

export type Post = typeof posts.$inferSelect
export type Document = typeof documents.$inferSelect
export type DocumentChunk = typeof documentChunks.$inferSelect
export type DeskThread = typeof deskThreads.$inferSelect
export type DeskMessage = typeof deskMessages.$inferSelect
export type AgentRun = typeof agentRuns.$inferSelect
export type AgentRunStep = typeof agentRunSteps.$inferSelect
export type AgentAsk = typeof agentAsks.$inferSelect
