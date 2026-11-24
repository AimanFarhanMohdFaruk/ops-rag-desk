import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './app/models/schema.ts',
  out: './db/migrate',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/ops_rag_desk',
  },
})
