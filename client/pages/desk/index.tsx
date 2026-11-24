import { useRouteContext } from '@fastify/react/client'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { DeskPageData } from '@app/controllers/desk/loaders'

import { Desk } from '@/components/screen/desk/desk'
import { pageRedirect } from '@/lib/page-navigation'

export async function getData(ctx: {
  req: FastifyRequest
  reply: FastifyReply
}) {
  const { loadDeskPage } = await import('@app/controllers/desk/loaders')
  return loadDeskPage(ctx.req, ctx.reply)
}

export function getMeta() {
  return { title: 'Ops Desk' }
}

export default function DeskPage() {
  const { data } = useRouteContext() as { data: DeskPageData }
  const redirect = pageRedirect(data)
  if (redirect) return redirect
  if (!('email' in data)) return null
  return <Desk email={data.email} library={data.library} />
}
