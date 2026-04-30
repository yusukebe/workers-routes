import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello from flare!')
})

export default app
