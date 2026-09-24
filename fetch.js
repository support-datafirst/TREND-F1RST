// Pulls trends from several platforms and writes trends.json, mixed 75% TH / 25% international.
// Run: node fetch.js   (YT_API_KEY env enables YouTube)   Self-check: node fetch.js --check
const { writeFileSync, readdirSync, readFileSync } = require('node:fs');
const https = require('node:https');
const tls = require('node:tls');
const assert = require('node:assert');
const config = require('./config.json'); // youtube link, slide timing, location for weather/PM2.5

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36';
const PER_SOURCE = 20;

async function get(url, json) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return json ? r.json() : r.text();
}

const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(d))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// TV browsers have no emoji or "fancy" Unicode fonts (𝐏𝐔𝐁𝐆, ＦＵＬＬ, Ⓐ), which show up unreadable: map those to plain
// letters and drop emoji. NFKC only on those ranges, because on Thai it would split ำ into ํ + า.
const clean = (s = '') => s
  .replace(/[\u{1D400}-\u{1D7FF}\uFF01-\uFF5E\u2460-\u24FF]/gu, c => c.normalize('NFKC'))
  .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D\u20E3]/gu, '')
  .replace(/\s+/g, ' ').trim();

const short = n => (n = +n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);

async function google(geo) {
  const xml = await get(`https://trends.google.com/trending/rss?geo=${geo}`);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const tag = t => decode((it.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || '');
    return { title: tag('title'), sub: tag('ht:news_item_title'), metric: tag('ht:approx_traffic') + ' ค้นหา', img: tag('ht:picture') };
  });
}

// trends24.in scrape (no official free X API). First <ol> = latest hour.
async function x(path) {
  const html = await get(`https://trends24.in/${path}/`);
  const list = (html.match(/<ol class=trend-card__list>([\s\S]*?)<\/ol>/) || [])[1] || '';
  return [...list.matchAll(/class=trend-link>([^<]+)<\/a><span class=tweet-count data-count="?(\d*)/g)]
    .map(([, t, n]) => ({ title: decode(t), metric: n ? short(n) + ' โพสต์' : '' }));
}

// The trending chart is mostly music videos: keep at most 2 (category 10). category 25 = News & Politics.
async function youtube(region, category) {
  const key = process.env.YT_API_KEY;
  if (!key) return [];
  const j = await get(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${region}${category ? '&videoCategoryId=' + category : ''}&maxResults=50&key=${key}`, true);
  let music = 0;
  return j.items.filter(v => v.snippet.categoryId !== '10' || music++ < 2).map(v => ({
    title: v.snippet.title, sub: v.snippet.channelTitle,
    metric: short(v.statistics.viewCount) + ' วิว', img: v.snippet.thumbnails.medium.url,
  }));
}

const WIKI_SKIP = /^(Main_Page|หน้าหลัก|-|(Special|Wikipedia|File|Portal|Help|Category|Template|User|Talk|พิเศษ|วิกิพีเดีย|ไฟล์|หมวดหมู่|สถานีย่อย|แม่แบบ|ผู้ใช้|วิธีใช้):.*)$/;

async function wiki(lang) {
  // Wikimedia publishes a day's top list some hours after UTC midnight: try yesterday, then the day before.
  for (const back of [1, 2]) {
    const day = new Date(Date.now() - back * 864e5).toISOString().slice(0, 10).replace(/-/g, '/');
    try {
      const j = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${day}`, true);
      return j.items[0].articles.filter(a => !WIKI_SKIP.test(a.article))
        .map(a => ({ title: a.article.replace(/_/g, ' '), metric: short(a.views) + ' อ่าน' }));
    } catch {}
  }
  throw new Error(`wiki ${lang}: no data`);
}

async function apple(cc) {
  const j = await get(`https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/${PER_SOURCE}/songs.json`, true);
  return j.feed.results.map(s => ({ title: s.name, sub: s.artistName, metric: 'เพลงฮิต', img: s.artworkUrl100.replace('100x100bb', '400x400bb') }));
}

async function hn() {
  const ids = (await get('https://hacker-news.firebaseio.com/v0/topstories.json', true)).slice(0, 10);
  const items = await Promise.all(ids.map(id => get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, true)));
  return items.map(i => ({ title: i.title, metric: i.score + ' points' }));
}

// Pantip Realtime (most-read topics right now), taken from the homepage's server-rendered data.
async function pantip() {
  const html = await get('https://pantip.com/');
  const next = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
  return next.props.initialProps.pageProps.realtime.data.filter(t => t.title).map(t => ({
    title: decode(t.title), metric: t.comments_count ? short(t.comments_count) + ' ความเห็น' : '', img: t.thumbnail_url || '',
  }));
}

// Thai labels for WMO weather codes used by Open-Meteo.
const sky = c => c === 0 ? 'ท้องฟ้าแจ่มใส' : c <= 2 ? 'มีเมฆบางส่วน' : c === 3 ? 'เมฆมาก' : c <= 48 ? 'มีหมอก'
  : c <= 57 ? 'ฝนปรอย' : c <= 67 ? 'ฝนตก' : c <= 79 ? 'หิมะ' : c <= 82 ? 'ฝนตกเป็นช่วง' : c <= 86 ? 'หิมะ' : 'พายุฝนฟ้าคะนอง';

// When will it rain? Hourly data starts at the current (local) hour. 50% chance counts as "expected".
function rainOutlook(times, probs, mm, rainingNow) {
  const at = i => times[i].slice(11, 16);
  if (rainingNow) {
    const stop = mm.findIndex((m, i) => i > 0 && m < 0.1);
    return { big: 'กำลังตก', small: stop > 0 ? `คาดว่าหยุดราว ${at(stop)} น.` : 'ตกต่อเนื่องอีกหลายชั่วโมง', wet: true };
  }
  const i = probs.findIndex(p => p >= 50);
  if (i < 0) return { big: 'ไม่ตก', small: 'ใน 12 ชม. ข้างหน้า', wet: false };
  return { big: i === 0 ? 'เร็วๆ นี้' : at(i), small: `คาดว่าฝนจะตก · โอกาส ${probs[i]}%`, wet: true };
}

async function weather({ lat, lon }) {
  const j = await get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,precipitation&hourly=precipitation_probability,precipitation&forecast_hours=12&timezone=Asia/Bangkok`, true);
  const c = j.current, h = j.hourly;
  return {
    temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), sky: sky(c.weather_code),
    rain: rainOutlook(h.time, h.precipitation_probability, h.precipitation, c.precipitation > 0),
  };
}

// Pollution Control Department AQI bands, indexed by Air4Thai's color_id (1..5).
const AQI = [, ['ดีมาก', '#3bccff'], ['ดี', '#92d050'], ['ปานกลาง', '#ffd400'], ['เริ่มมีผลต่อสุขภาพ', '#ff9900'], ['มีผลต่อสุขภาพ', '#ff3b3b']];

// air4thai.pcd.go.th sends its certificate without the Let's Encrypt intermediates, and Node won't fetch missing ones.
// ponytail: bundled gen-Y RSA intermediates (YR1-3, Root YR cross-signed by ISRG Root X1, which Node trusts). If Air4Thai
// fails with a certificate error, check the issuer with `openssl s_client` and add it from http://<issuer>.i.lencr.org/.
const AIR4THAI_CA = [...tls.rootCertificates, readFileSync(__dirname + '/certs/letsencrypt-gen-y.pem', 'utf8')];
const getJSON = (url, ca) => new Promise((ok, fail) => https.get(url, { ca, timeout: 15000 }, r => {
  let s = '';
  r.setEncoding('utf8').on('data', d => s += d).on('end', () => { try { ok(JSON.parse(s)); } catch (e) { fail(e); } });
}).on('timeout', function () { this.destroy(new Error('timeout')); }).on('error', fail));

// PM2.5 from the nearest Air4Thai station that is currently reporting.
async function air({ lat, lon }) {
  const j = await getJSON('https://air4thai.pcd.go.th/services/getNewAQI_JSON.php', AIR4THAI_CA);
  const d2 = s => (s.lat - lat) ** 2 + ((s.long - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
  const s = j.stations.filter(s => +s.AQILast?.PM25?.value > 0).sort((a, b) => d2(a) - d2(b))[0];
  const pm = s.AQILast.PM25, [label, color] = AQI[pm.color_id] || ['', '#aab1bf'];
  return { pm25: +pm.value, label, color, station: s.nameTH.trim(), time: s.AQILast.time };
}

// Any YouTube link (watch, youtu.be, live, shorts, playlist) -> muted autoplay loop embed. Browsers block autoplay with sound.
const YT_Q = 'autoplay=1&mute=1&controls=0&rel=0&playsinline=1&loop=1';
function youtubeEmbed(link = '') {
  const id = (link.match(/(?:[?&]v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/) || [])[1];
  const list = (link.match(/[?&]list=([\w-]+)/) || [])[1];
  if (list) return `https://www.youtube.com/embed/${id || 'videoseries'}?list=${list}&${YT_Q}`;
  return id ? `https://www.youtube.com/embed/${id}?playlist=${id}&${YT_Q}` : '';
}

const SOURCES = [
  ['google', 'TH', () => google('TH')],
  ['x', 'TH', () => x('thailand')],
  ['youtube', 'TH', () => youtube('TH'), 15],
  ['ytnews', 'TH', () => youtube('TH', 25), 8],
  ['pantip', 'TH', pantip],
  ['wiki', 'TH', () => wiki('th'), 3],
  ['apple', 'TH', () => apple('th'), 2], // wiki and songs matter less: keep them few
  ['google', 'US', () => google('US')],
  ['google', 'GB', () => google('GB')],
  ['x', 'US', () => x('united-states')],
  ['youtube', 'US', () => youtube('US')],
  ['wiki', 'EN', () => wiki('en'), 3],
  ['apple', 'US', () => apple('us'), 2],
  ['hn', 'TECH', hn],
];

// ponytail: word list, not a classifier. Short Thai words match the whole title only (หี ≠ หีบเพลง). Extend when something slips onto the TV.
const BLOCK = /^(หี|หำ|จู๋|โป๊)$|ควย|เย็ด|เงี่ยน|เซ็กส์|ร่วมเพศ|อวัยวะเพศ|หนังโป๊|ภาพโป๊|คลิปหลุด|สำเร็จความใคร่|ช่วยตัวเอง|\b(porn\w*|sex|xxx|nsfw|nude|hentai|onlyfans|xnxx|xvideos)\b/i;

// Spread each list evenly over the output, so a short list (Apple 5, Google TH ~7) isn't bunched on the first screen.
const spread = lists => lists.flatMap(l => l.map((it, i) => [(i + 0.5) / l.length, it]))
  .sort((a, b) => a[0] - b[0]).map(p => p[1]);

// Spread per region so platforms alternate, then 3 TH : 1 intl. Leftover intl is dropped to hold the ratio.
function mix(lists) {
  const th = spread(lists.filter(l => l[0]?.region === 'TH'));
  const intl = spread(lists.filter(l => l[0] && l[0].region !== 'TH'));
  const out = [], seen = new Set();
  th.forEach((t, i) => {
    out.push(t);
    if (i % 3 === 2 && intl.length) out.push(intl.shift());
  });
  return out.filter(it => {
    const k = it.title.toLowerCase().replace(/[#\s]/g, '');
    return k && !BLOCK.test(it.title) && !seen.has(k) && seen.add(k);
  });
}

async function main() {
  let old = {};
  try { old = require('./trends.json'); } catch {}
  const [results, wx, aq] = await Promise.all([
    Promise.allSettled(SOURCES.map(([, , fn]) => fn())),
    weather(config.location).catch(e => console.error(`✗ weather: ${e.message}`)),
    air(config.location).catch(e => console.error(`✗ air: ${e.message}`)),
  ]);
  const lists = results.map((r, i) => {
    const [source, region, , limit = PER_SOURCE] = SOURCES[i];
    if (r.status === 'rejected') console.error(`✗ ${source} ${region}: ${r.reason.message}`);
    const items = r.status === 'fulfilled' ? r.value : [];
    if (r.status === 'fulfilled') console.log(`✓ ${source} ${region}: ${items.length}`);
    return items.slice(0, limit).map((it, n) => ({ source, region, rank: n + 1, ...it, title: clean(it.title), sub: clean(it.sub) }));
  });
  const items = mix(lists);
  // Nearly everything failed: keep the previous trends and their timestamp, so the TV flags them as stale
  // while weather, slides and the YouTube link still update.
  const fresh = items.length >= 30;
  if (!fresh) console.error(`✗ only ${items.length} items, keeping previous trends`);
  let slides = [];
  try {
    slides = readdirSync(__dirname + '/slides').filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f)).sort()
      .map(f => 'slides/' + encodeURIComponent(f));
  } catch {}
  writeFileSync(__dirname + '/trends.json', JSON.stringify({
    updated: fresh ? new Date().toISOString() : old.updated,
    items: fresh ? items : old.items || items,
    weather: wx || old.weather,
    air: aq || old.air,
    youtube: youtubeEmbed(config.youtube),
    slides,
    slideSeconds: config.slideSeconds || 10,
  }));
  console.log(`wrote ${items.length} items, ${slides.length} slides, youtube ${config.youtube ? 'on' : 'off'}`);
}

function check() {
  const mk = (source, region, n) => Array.from({ length: n }, (_, i) => ({ source, region, title: `${source}${region}${i}` }));
  const out = mix([mk('google', 'TH', 30), mk('x', 'TH', 30), mk('google', 'US', 50), mk('hn', 'TECH', 50)]);
  const th = out.filter(i => i.region === 'TH').length;
  assert.deepEqual([th, out.length], [60, 80], 'ratio should be 60 TH : 20 intl');
  assert.deepEqual([out[0].source, out[1].source], ['google', 'x'], 'platforms should alternate');
  assert.equal(mix([[{ region: 'TH', title: 'Linkin Park' }], [{ region: 'TH', title: '#linkinpark' }]]).length, 1, 'dedupe');
  const few = mix([mk('google', 'TH', 10), mk('apple', 'TH', 2)]);
  assert.deepEqual(few.map((it, i) => it.source === 'apple' ? i : -1).filter(i => i >= 0), [3, 9], 'short list spreads out');
  assert.deepEqual(mix([[{ region: 'TH', title: 'หี' }, { region: 'TH', title: 'หีบเพลง' }, { region: 'TH', title: 'Pornhub' }]]).map(i => i.title), ['หีบเพลง'], 'block list');
  assert.equal(youtubeEmbed('https://youtu.be/dQw4w9WgXcQ?si=abc'), `https://www.youtube.com/embed/dQw4w9WgXcQ?playlist=dQw4w9WgXcQ&${YT_Q}`);
  assert.equal(youtubeEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx_1'), `https://www.youtube.com/embed/dQw4w9WgXcQ?list=PLx_1&${YT_Q}`);
  assert.equal(youtubeEmbed('https://www.youtube.com/playlist?list=PLx_1'), `https://www.youtube.com/embed/videoseries?list=PLx_1&${YT_Q}`);
  assert.equal(youtubeEmbed('https://www.youtube.com/live/abcdefghijk'), `https://www.youtube.com/embed/abcdefghijk?playlist=abcdefghijk&${YT_Q}`);
  assert.equal(youtubeEmbed('not a link'), '');
  assert.equal(clean('🔴Live สด! 𝐏𝐔𝐁𝐆 𝐓𝐇𝐀𝐈𝐋𝐀𝐍𝐃 𝟐𝟎𝟐𝟔 🇹🇭 ❤️'), 'Live สด! PUBG THAILAND 2026');
  assert.equal(clean('กำลังมาแรง'), 'กำลังมาแรง', 'Thai sara am must survive');
  const hrs = ['2026-09-24T12:00', '2026-09-24T13:00', '2026-09-24T14:00', '2026-09-24T15:00'];
  assert.deepEqual(rainOutlook(hrs, [10, 20, 80, 90], [0, 0, 1, 2], false), { big: '14:00', small: 'คาดว่าฝนจะตก · โอกาส 80%', wet: true });
  assert.equal(rainOutlook(hrs, [90, 90, 40, 10], [2, 1, 0, 0], true).small, 'คาดว่าหยุดราว 14:00 น.');
  assert.equal(rainOutlook(hrs, [10, 20, 30, 20], [0, 0, 0, 0], false).big, 'ไม่ตก');
  console.log('check done');
}

process.argv[2] === '--check' ? check() : main().catch(e => { console.error(e.message); process.exit(1); });
