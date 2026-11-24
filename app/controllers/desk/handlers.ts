/**
 * Thin HTTP handlers — parse → service → JSON.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ValidationError } from '../../errors'
import { askDocsDesk, listDocsDeskLibrary } from '../../services/retrieval/ask'
import { sessionUser } from '../auth'
import type { DeskAskDto, DeskLibraryItemDto } from './dto'

export async function library(
  req: FastifyRequest,
  _reply: FastifyReply,
): Promise<DeskLibraryItemDto[]> {
  return listDocsDeskLibrary(sessionUser(req).id)
}

export async function ask(
  req: FastifyRequest,
  _reply: FastifyReply,
): Promise<DeskAskDto> {
  const body =
    typeof req.body === 'object' && req.body !== null
      ? (req.body as { question?: unknown })
      : {}
  const question = String(body.question ?? '')
  const outcome = await askDocsDesk(sessionUser(req).id, question)

  if (!outcome.ok && outcome.error === 'question_required') {
    throw new ValidationError('Question required')
  }
  if (!outcome.ok && outcome.error === 'not_configured') {
    throw new AppError(503, outcome.answer, 'not_configured')
  }

  return {
    ok: outcome.ok,
    answer: outcome.answer,
    citations: outcome.citations,
    refused: !outcome.ok && outcome.error === 'no_hits',
  }
}
