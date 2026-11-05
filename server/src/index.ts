import { app } from './app.js'
import { startScheduler } from './scheduler.js'

// Starts the API as a long-running server (development, or hosts that keep servers on).
const port = Number(process.env.PORT ?? 4000)

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
  startScheduler()
})
