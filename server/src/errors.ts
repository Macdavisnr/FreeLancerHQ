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
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on the server.' })
}
