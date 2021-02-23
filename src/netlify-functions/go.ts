import http from 'http'
import https from 'https'

import { APIGatewayEvent } from 'aws-lambda'
import { parse } from 'node-html-parser'

const processChunks = (chunks: Uint8Array[]) => {
  const result = Buffer.concat(chunks).toString()
  const headEndIndex = result.indexOf('</head>')
  if (headEndIndex > 0) {
    const headStartIndex = result.indexOf('<head')
    return result.slice(headStartIndex, headEndIndex)
  }
  return null
}

async function httpGetHead(url: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    let client: typeof http | typeof https = http

    if (url.toString().indexOf('https') === 0) {
      client = https
    }

    const request = client
      .get(url, (res) => {
        const chunks: Uint8Array[] = []

        res.on('data', (chunk) => {
          chunks.push(chunk)
          const result = processChunks(chunks)
          if (result) {
            request.abort()
            resolve(result)
          }
        })

        res.on('end', () => {
          const result = processChunks(chunks)
          if (result) {
            resolve(result)
          } else {
            reject(new Error('Malformed HTML'))
          }
        })
      })
      .on('error', (err) => {
        reject(err)
      })
  })
}

export const handler = async function (event: APIGatewayEvent) {
  const url = event.path.slice(1)
  const isOrg = Boolean(new URL(url).hostname.match(/\.org(?:\.au)?$/))

  if (!isOrg) {
    return {
      body:
        'This service is only available for domains ending in <strong>".org"</strong> or <strong>".org.au"</strong>',
      headers: { 'Content-Type': 'text/html' },
      statusCode: 403,
    }
  }

  try {
    const head = await httpGetHead(url)
    const html = parse(head)

    const tags = html
      .querySelectorAll('meta, title')
      .map((elem) => elem.outerHTML)

    return {
      body: `
<html>
  <head>
    ${tags.join('\n')}
    <script>
      window.location.href = '${url}';
    </script>
  </head>
</html>
    `,
      headers: { 'Content-Type': 'text/html' },
      statusCode: 200,
    }
  } catch (err) {
    return {
      body: err.toString(),
      headers: { 'Content-Type': 'text/html' },
      statusCode: 500,
    }
  }
}
