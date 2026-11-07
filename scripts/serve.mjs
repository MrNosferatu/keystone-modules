// Serves dist/index.json for a debug build of the extension.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const port = Number(process.env.PORT || 4310);
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    res.setHeader('Content-Type', 'application/json');
    res.end(readFileSync('dist/index.json'));
  } catch {
    res.statusCode = 404;
    res.end('{"detail":"Run npm run build first."}');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/index.json`));
