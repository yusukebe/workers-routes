import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.json({
    users: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ]
  })
})

app.get('/:id', (c) => {
  const id = c.req.param('id')
  return c.json({ id, name: `User ${id}` })
})

export default app
