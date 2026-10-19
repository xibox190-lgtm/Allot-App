import { assertState, emptyState } from './domain.mjs';
const key = 'allot.state.v1';
const native = globalThis.AllotNative;
const pending = new Map();

export function lightHaptic() {
  globalThis.AllotNative?.lightHaptic?.();
}
globalThis.allotNativeResult = (id, result) => {
  const request = pending.get(id);
  if (!request) return;
  pending.delete(id); clearTimeout(request.timer);
  result.error ? request.reject(new Error(result.error)) : request.resolve(result.data);
};
export function readState() {
  const text = native ? native.loadState() : localStorage.getItem(key);
  return text ? assertState(JSON.parse(text)) : emptyState();
}
export function writeState(state) {
  assertState(state);
  const text = JSON.stringify(state);
  if (text.length > 10000000) throw new Error('本地数据过大，请开启新对话');
  if (native) { const result = JSON.parse(native.saveState(text)); if (result.error) throw new Error(result.error); }
  else localStorage.setItem(key, text);
}
export async function clearData() {
  if (native) { const result = JSON.parse(native.clearData()); if (result.error) throw new Error(result.error); }
  else localStorage.removeItem(key);
}
export async function copyText(text) {
  if (native) return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('复制超时，请重试')); }, 10000);
    pending.set(id, { resolve, reject, timer });
    try { native.copyText(id, text); }
    catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
  });
  if (!globalThis.navigator?.clipboard?.writeText) throw new Error('当前环境无法复制，请使用 HTTPS 或本地浏览器访问');
  await navigator.clipboard.writeText(text);
}
async function jsonRequest(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || '连接失败');
  return data;
}
export async function getConfig() {
  return native ? JSON.parse(native.getConfig()) : jsonRequest('/api/config');
}
export async function saveConfig(config) {
  if (native) { const data = JSON.parse(native.saveConfig(JSON.stringify(config))); if (data.error) throw new Error(data.error); return data; }
  return jsonRequest('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
}
export async function saveApiKey(apiKey) {
  if (native) { const result = JSON.parse(native.saveApiKey(apiKey)); if (result.error) throw new Error(result.error); return result; }
  return jsonRequest('/api/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }) });
}
export async function clearApiKey() {
  if (native) { const result = JSON.parse(native.clearApiKey()); if (result.error) throw new Error(result.error); return result; }
  return jsonRequest('/api/key', { method: 'DELETE' });
}
export async function transport(payload, signal) {
  if (native) return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('模型请求超时，请重试')); }, 95000);
    pending.set(id, { resolve, reject, timer });
    signal?.addEventListener('abort', () => { clearTimeout(timer); pending.delete(id); reject(new Error('已取消')); }, { once: true });
    native.modelRequest(id, JSON.stringify(payload));
  });
  return jsonRequest('/api/model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal });
}
