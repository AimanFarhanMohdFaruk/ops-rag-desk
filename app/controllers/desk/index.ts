/**
 * API index — scan this file.
 */
import type { FastifyInstance } from 'fastify'
import { requireSession } from '../auth'
import {
  answerAsk,
  createRun,
  listRuns,
  listThreads,
  showRun,
  showThread,
} from './agent-handlers'
import { ask, library } from './handlers'

export async function registerDeskRoutes(app: FastifyInstance) {
  app.get('/api/desk/library', { preHandler: requireSession }, library)
  app.post('/api/desk/ask', { preHandler: requireSession }, ask)

  app.get('/api/desk/threads', { preHandler: requireSession }, listThreads)
  app.get('/api/desk/threads/:id', { preHandler: requireSession }, showThread)
  app.post('/api/desk/runs', { preHandler: requireSession }, createRun)
  app.get('/api/desk/runs', { preHandler: requireSession }, listRuns)
  app.get('/api/desk/runs/:id', { preHandler: requireSession }, showRun)
  app.post('/api/desk/asks/:id/answer', { preHandler: requireSession }, answerAsk)
}
