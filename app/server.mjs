import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('../dist/web/', import.meta.url)));
const configDir = resolve(process.env.ALLOT_CONFIG_DIR || fileURLToPath(new URL('../.allot/', import.meta.url)));
const port = Number(process.env.PORT || 4174);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2' };
const defaults = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: '' };
async function config() {
  let stored = {};
  try { stored = JSON.parse(await readFile(resolve(configDir, 'config.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('AI 配置读取失败'); }
  return { ...defaults, ...stored, ...(process.env.DEEPSEEK_API_KEY ? { apiKey: process.env.DEEPSEEK_API_KEY } : {}), ...(process.env.ALLOT_MODEL ? { model: process.env.ALLOT_MODEL } : {}), ...(process.env.ALLOT_API_BASE ? { baseUrl: process.env.ALLOT_API_BASE } : {}) };
}
function checkBase(base) {
  const url = new URL(base);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('API 地址须为 HTTPS');
  if (url.username || url.password || url.search || url.hash) throw new Error('API 地址格式无效');
  return url.href.replace(/\/$/, '');
}
async function storeConfig(c) {
  await mkdir(configDir, { recursive: true });
  await writeFile(resolve(configDir, 'config.json.tmp'), JSON.stringify(c), { mode: 0o600 });
  await rename(resolve(configDir, 'config.json.tmp'), resolve(configDir, 'config.json'));
}
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('请求格式无效');
  let length = 0; const chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > 24000000) throw new Error('请求过大'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const reply = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const server = createServer(async (req, res) => {
  try {
    const origin = `http://${req.headers.host}`;
    if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) return reply(res, 403, { error: '只允许本机访问' });
    if (req.headers.origin && req.headers.origin !== origin) return reply(res, 403, { error: '不允许跨站访问' });
    const path = new URL(req.url, origin).pathname;
    if (path === '/api/config' && req.method === 'GET') {
      const c = await config(); return reply(res, 200, { baseUrl: c.baseUrl, model: c.model, configured: Boolean(c.apiKey) });
    }
    if (path === '/api/key' && ['POST', 'DELETE'].includes(req.method)) {
      if (process.env.DEEPSEEK_API_KEY) throw new Error('API Key 由环境变量提供，请在环境变量中管理');
      const previous = await config();
      const apiKey = req.method === 'DELETE' ? '' : String((await body(req)).apiKey || '').trim();
      if (req.method === 'POST' && (!apiKey || apiKey.length > 500)) throw new Error('请填写有效的 API Key');
      await storeConfig({ ...previous, apiKey });
      return reply(res, 200, { configured: Boolean(apiKey) });
    }
    if (path === '/api/config' && req.method === 'POST') {
      const data = await body(req); const previous = await config();
      const c = { baseUrl: checkBase(data.baseUrl || defaults.baseUrl), model: String(data.model || defaults.model).trim(), apiKey: String(data.apiKey || previous.apiKey).trim() };
      if (!c.model || c.model.length > 100 || c.apiKey.length > 500) throw new Error('请填写有效的模型和 API Key');
      await storeConfig(c);
      return reply(res, 200, { configured: Boolean(c.apiKey), model: c.model, baseUrl: c.baseUrl });
    }
    if (path === '/api/model' && req.method === 'POST') {
      const payload = await body(req); const c = await config();
      if (!c.apiKey) return reply(res, 503, { error: '请先在 AI 设置中填写 API Key' });
      const base = checkBase(c.baseUrl);
      const upstream = await fetch(base.replace(/\/chat\/completions$/, '') + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` }, body: JSON.stringify({ ...payload, model: c.model, stream: false }), signal: AbortSignal.timeout(90000) });
      if (!upstream.ok) return reply(res, 502, { error: `模型请求失败（${upstream.status}），请检查模型、密钥或余额` });
      return reply(res, 200, await upstream.json());
    }
    if (req.method !== 'GET') return reply(res, 405, { error: '不支持该请求' });
    const file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + sep)) return reply(res, 403, { error: '禁止访问' });
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes);
  } catch (error) { reply(res, error.code === 'ENOENT' ? 404 : 400, { error: error.name === 'TimeoutError' ? '模型请求超时，请重试' : error.message }); }
}).listen(port, '127.0.0.1', () => console.log(`Allot MVP: http://127.0.0.1:${server.address().port}`));
