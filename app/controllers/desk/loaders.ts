/**
 * Ops Desk page loader — session + library via DTO.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { listDocsDeskLibrary } from '../../services/retrieval/ask'
import { gatePage } from '../page-gate'
import type { DeskLibraryItemDto } from './dto'

export type DeskPageData =
  | { redirectTo: string }
  | {
      email: string
      library: DeskLibraryItemDto[]
    }

export async function loadDeskPage(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<DeskPageData> {
  const gate = await gatePage(req, reply, 'signedIn')
  if (!gate.ok) return gate.data

  return {
    email: gate.user.email,
    library: await listDocsDeskLibrary(gate.user.id),
  }
}
