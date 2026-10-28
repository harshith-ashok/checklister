import type { Request, RequestHandler } from 'express'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
export const notFound = () => new HttpError(404, 'Not found')
export const badRequest = (message: string) => new HttpError(400, message)

/** Async route handler: thrown errors become `{ error }` JSON responses. */
export const handle =
  (fn: (req: Request, res: Parameters<RequestHandler>[1]) => unknown | Promise<unknown>): RequestHandler =>
  async (req, res) => {
    try {
      await fn(req, res)
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      res.status(status).json({ error: e instanceof Error ? e.message : String(e) })
    }
  }

export const idParam = (req: Request) => Number(req.params.id)
