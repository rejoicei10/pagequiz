// Mock api-worker: fake Firecrawl scrape + Anthropic completion. Records calls.
import http from 'node:http'
const calls = []
const quiz = {
  title: 'Octopus Facts',
  questions: Array.from({ length: 5 }, (_, i) => ({
    prompt: `Mock question ${i + 1}?`,
    options: [`Right ${i}`, `Wrong A ${i}`, `Wrong B ${i}`, `Wrong C ${i}`],
    correctIndex: 0,
    explanation: `Because mock ${i}.`,
  })),
}
http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    calls.push({ path: req.url, auth: (req.headers.authorization || '').slice(0, 20), body: body.slice(0, 200) })
    res.setHeader('content-type', 'application/json')
    if (req.url === '/__calls') return res.end(JSON.stringify(calls))
    if (req.url.includes('firecrawl')) {
      return res.end(JSON.stringify({ success: true, data: { data: { markdown: 'Octopus text. '.repeat(60), metadata: { title: 'Octopus - Wikipedia' } } } }))
    }
    if (req.url.includes('anthropic')) {
      return res.end(JSON.stringify({ success: true, data: { content: [{ type: 'text', text: 'Here you go:\n```json\n' + JSON.stringify(quiz) + '\n```' }] } }))
    }
    res.statusCode = 404; res.end(JSON.stringify({ success: false, error: 'mock: unknown ' + req.url }))
  })
}).listen(4600, () => console.log('mock api on 4600'))
