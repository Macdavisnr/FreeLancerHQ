import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'

/** Throw this from a route to send a specific status + message to the client. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** One place that turns any thrown error into a JSON response: { error: "message" } */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  if (err instanceof ZodError) {
    // Use the first validation problem, e.g. "Invalid email address"
    res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid input.' })
    return
  }
  // Errors from Express's body readers (express.json / express.raw) for a bad REQUEST:
  // broken JSON, a body over the size limit... That's the caller's mistake (4xx), not a server error.
  if (err?.type?.startsWith?.('entity.') && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: err.status === 413 ? 'The request is too large.' : 'The request could not be read.' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on the server.' })
}
