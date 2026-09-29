// Runs Code.gs in Node with stand-ins for the Apps Script services (curl plays UrlFetchApp).
// node gas/test.js            -> fetch everything like the web app would, print the log and a summary
// node gas/test.js --check    -> unit checks only        (YT_API_KEY=... in the env enables YouTube)
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');

function fetch(url, opts = {}) {
  const ua = (opts.headers || {})['User-Agent'] || 'curl';
  let out;
  try {
    out = execFileSync('curl', ['-sL', '--max-time', '20', '-A', ua, '-w', '\n%{http_code}', url], { maxBuffer: 1 << 26 }).toString();
  } catch (e) {
    throw new Error(`fetch failed: ${url.split('?')[0]}`); // like UrlFetchApp on DNS/TLS/timeout errors
  }
  const cut = out.lastIndexOf('\n');
  return { getResponseCode: () => +out.slice(cut + 1), getContentText: () => out.slice(0, cut) };
}

const cache = new Map();
const ctx = vm.createContext({
  console,
  UrlFetchApp: { fetch: (url, opts) => fetch(url, opts), fetchAll: reqs => reqs.map(r => fetch(r.url, r)) },
  CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => process.env[k] || null }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType() { return this; }, getContent: () => t }) },
});
vm.runInContext(readFileSync(__dirname + '/Code.gs', 'utf8'), ctx);

if (process.argv[2] === '--check') {
  ctx.check();
} else {
  const d = JSON.parse(ctx.doGet({ parameter: { lat: '13.7588', lon: '100.533' } }).getContent());
  const bySource = {};
  d.items.forEach(i => { bySource[i.source] = (bySource[i.source] || 0) + 1; });
  console.log(d.log.join('\n'));
  console.log('items', d.items.length, bySource, 'TH', d.items.filter(i => i.region === 'TH').length);
  console.log('weather', JSON.stringify(d.weather));
  console.log('air', JSON.stringify(d.air));
  console.log('office', d.office.length, 'rooms', '| json', JSON.stringify(d).length, 'bytes');
}
