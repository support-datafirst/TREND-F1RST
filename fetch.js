// Pulls trends from several platforms and writes trends.json, mixed 75% TH / 25% international.
// Run: node fetch.js   (YT_API_KEY env enables YouTube)   Self-check: node fetch.js --check
const { writeFileSync } = require('node:fs');
const assert = require('node:assert');

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

async function youtube(region) {
  const key = process.env.YT_API_KEY;
  if (!key) return [];
  const j = await get(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${region}&maxResults=${PER_SOURCE}&key=${key}`, true);
  return j.items.map(v => ({
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

const SOURCES = [
  ['google', 'TH', () => google('TH')],
  ['x', 'TH', () => x('thailand')],
  ['youtube', 'TH', () => youtube('TH')],
  ['wiki', 'TH', () => wiki('th')],
  ['apple', 'TH', () => apple('th'), 5], // songs matter less: keep them few
  ['google', 'US', () => google('US')],
  ['google', 'GB', () => google('GB')],
  ['x', 'US', () => x('united-states')],
  ['youtube', 'US', () => youtube('US')],
  ['wiki', 'EN', () => wiki('en')],
  ['apple', 'US', () => apple('us'), 5],
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
  const results = await Promise.allSettled(SOURCES.map(([, , fn]) => fn()));
  const lists = results.map((r, i) => {
    const [source, region, , limit = PER_SOURCE] = SOURCES[i];
    if (r.status === 'rejected') console.error(`✗ ${source} ${region}: ${r.reason.message}`);
    const items = r.status === 'fulfilled' ? r.value : [];
    if (r.status === 'fulfilled') console.log(`✓ ${source} ${region}: ${items.length}`);
    return items.slice(0, limit).map((it, n) => ({ source, region, rank: n + 1, ...it }));
  });
  const items = mix(lists);
  // Keep the last good file if nearly everything failed, so the TV never goes blank.
  if (items.length < 30) throw new Error(`only ${items.length} items, not overwriting trends.json`);
  writeFileSync(__dirname + '/trends.json', JSON.stringify({ updated: new Date().toISOString(), items }));
  console.log(`wrote ${items.length} items`);
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
  console.log('check done');
}

process.argv[2] === '--check' ? check() : main().catch(e => { console.error(e.message); process.exit(1); });
