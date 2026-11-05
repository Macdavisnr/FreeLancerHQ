/*
 * Vercel turns every file in this /api folder into a serverless function. This one is the whole
 * Express API: Vercel starts it when a request arrives and hands it the request, so there is no
 * app.listen() and no hourly timer here (Vercel Cron calls /api/cron/run instead, see vercel.json).
 *
 * It imports the COMPILED server (server/dist), which the build command creates.
 */
export { app as default } from '../server/dist/app.js'
