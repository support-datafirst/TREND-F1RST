// TREND F1RST data API on Google Apps Script. Deploy as a web app: GET returns the TV's JSON
// (trends mixed 75% TH / 25% intl, weather, nearest Air4Thai PM2.5, office rooms).
// ?lat=&lon= pick the weather point and PM2.5 station. The YouTube key lives in Script Properties as YT_API_KEY.
// Test outside Apps Script: node gas/test.js [--check]

const PER_SOURCE = 20;
const TTL = 600; // seconds a response is reused, so TV reloads don't refetch every source

const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(d))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// TV browsers have no emoji or "fancy" Unicode fonts (𝐏𝐔𝐁𝐆, ＦＵＬＬ, Ⓐ), which show up unreadable: map those to plain
// letters and drop emoji. NFKC only on those ranges, because on Thai it would split ำ into ํ + า.
const clean = (s = '') => s
  .replace(/[\u{1D400}-\u{1D7FF}！-～①-⓿]/gu, c => c.normalize('NFKC'))
  .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu, '')
  .replace(/\s+/g, ' ').trim();

const short = n => (n = +n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
const pad = n => (n < 10 ? '0' : '') + n;
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// "29 ก.ย. 09:04" in Bangkok time, whatever timezone the script runs in.
const bkk = d => { const b = new Date(d.getTime() + 7 * 36e5); return `${b.getUTCDate()} ${TH_MONTHS[b.getUTCMonth()]} ${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())}`; };

// RSS <item>s as tag readers: rss(xml)[0]('title') -> decoded text of the first item's <title>.
const rss = xml => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) =>
  t => decode((it.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || ''));

const google = xml => rss(xml).map(tag => ({
  title: tag('title'), sub: tag('ht:news_item_title'), metric: tag('ht:approx_traffic') + ' ค้นหา', img: tag('ht:picture'),
}));

// Blognone: latest Thai tech news (the feed has no images). Older posts pinned on top (sponsored) are dropped.
const blognone = xml => rss(xml).map(tag => [tag('title'), new Date(tag('pubDate'))])
  .filter(([, at]) => Date.now() - at < 2 * 864e5)
  .map(([title, at]) => ({ title, metric: 'ข่าวไอที · ' + bkk(at) }));

// trends24.in scrape (no official free X API). First <ol> = latest hour.
const x = html => {
  const list = (html.match(/<ol class=trend-card__list>([\s\S]*?)<\/ol>/) || [])[1] || '';
  return [...list.matchAll(/class=trend-link>([^<]+)<\/a><span class=tweet-count data-count="?(\d*)/g)]
    .map(([, t, n]) => ({ title: decode(t), metric: n ? short(n) + ' โพสต์' : '' }));
};

// The trending chart is mostly music videos: keep at most 2 (category 10). category 25 = News & Politics.
const youtube = text => {
  let music = 0;
  return JSON.parse(text).items.filter(v => v.snippet.categoryId !== '10' || music++ < 2).map(v => ({
    title: v.snippet.title, sub: v.snippet.channelTitle,
    metric: short(v.statistics.viewCount) + ' วิว', img: v.snippet.thumbnails.medium.url,
  }));
};

const apple = text => JSON.parse(text).feed.results.map(s => ({
  title: s.name, sub: s.artistName, metric: 'เพลงฮิต', img: s.artworkUrl100.replace('100x100bb', '400x400bb'),
}));

// Pantip Realtime (most-read topics right now), taken from the homepage's server-rendered data.
const pantip = html => {
  const next = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
  return next.props.initialProps.pageProps.realtime.data.filter(t => t.title).map(t => ({
    title: decode(t.title), metric: t.comments_count ? short(t.comments_count) + ' ความเห็น' : '', img: t.thumbnail_url || '',
  }));
};

// [source, region, url, parser, how many to keep]. No YouTube key -> no YouTube.
function sources(ytKey) {
  const yt = (region, cat) => ytKey && `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${region}${cat ? '&videoCategoryId=' + cat : ''}&maxResults=50&key=${ytKey}`;
  const itunes = cc => `https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/${PER_SOURCE}/songs.json`;
  return [
    ['google', 'TH', 'https://trends.google.com/trending/rss?geo=TH', google],
    ['x', 'TH', 'https://trends24.in/thailand/', x],
    ['youtube', 'TH', yt('TH'), youtube, 15],
    ['ytnews', 'TH', yt('TH', 25), youtube, 8],
    ['pantip', 'TH', 'https://pantip.com/', pantip],
    ['blognone', 'TH', 'https://www.blognone.com/atom.xml', blognone, 8],
    ['apple', 'TH', itunes('th'), apple, 2], // songs matter less: keep them few
    ['google', 'US', 'https://trends.google.com/trending/rss?geo=US', google],
    ['google', 'GB', 'https://trends.google.com/trending/rss?geo=GB', google],
    ['x', 'US', 'https://trends24.in/united-states/', x],
    ['youtube', 'US', yt('US'), youtube],
    ['apple', 'US', itunes('us'), apple, 2],
  ].filter(s => s[2]);
}

// Thai labels for WMO weather codes used by Open-Meteo.
const sky = c => c === 0 ? 'ท้องฟ้าแจ่มใส' : c <= 2 ? 'มีเมฆบางส่วน' : c === 3 ? 'เมฆมาก' : c <= 48 ? 'มีหมอก'
  : c <= 57 ? 'ฝนปรอย' : c <= 67 ? 'ฝนตก' : c <= 79 ? 'หิมะ' : c <= 82 ? 'ฝนตกเป็นช่วง' : c <= 86 ? 'หิมะ' : 'พายุฝนฟ้าคะนอง';

const weatherUrl = (lat, lon) => `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,precipitation&hourly=precipitation_probability&forecast_hours=6&timezone=Asia/Bangkok`;
const weather = text => {
  const j = JSON.parse(text), c = j.current, h = j.hourly;
  return {
    temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), sky: sky(c.weather_code),
    // Hourly chance of rain for the next 6 h (local time, from the current hour), drawn as a step chart on the TV.
    rain: { now: c.precipitation > 0, hours: h.time.map((t, i) => ({ t: t.slice(11, 16), p: h.precipitation_probability[i] || 0 })) },
  };
};

// Pollution Control Department AQI bands, indexed by Air4Thai's color_id (1..5).
const AQI = [, ['ดีมาก', '#3bccff'], ['ดี', '#92d050'], ['ปานกลาง', '#ffd400'], ['เริ่มมีผลต่อสุขภาพ', '#ff9900'], ['มีผลต่อสุขภาพ', '#ff3b3b']];

// PM2.5 from the nearest Air4Thai station that is currently reporting.
const air = (text, lat, lon) => {
  const d2 = s => (s.lat - lat) ** 2 + ((s.long - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
  const s = JSON.parse(text).stations.filter(s => s.AQILast && s.AQILast.PM25 && +s.AQILast.PM25.value > 0).sort((a, b) => d2(a) - d2(b))[0];
  const pm = s.AQILast.PM25, [label, color] = AQI[pm.color_id] || ['', '#aab1bf'];
  return { pm25: +pm.value, label, color, station: s.nameTH.trim().replace(/^สำนักงาน/, '').replace(/\s*กรุงเทพฯ$/, ''), time: s.AQILast.time };
};

// Thai PM2.5 bands by value (µg/m³), for sensors that only report a number. Index into AQI.
const pmBand = v => v <= 15 ? 1 : v <= 25 ? 2 : v <= 37.5 ? 3 : v <= 75 ? 4 : 5;

// Office air purifiers: one entry per room. A device more than 6 h behind the newest reading has stopped
// reporting (compared to the newest, not to now, because the API's timestamps carry no timezone).
function officeRooms(data) {
  const newest = Math.max(...data.map(d => Date.parse(d.timestamp)));
  return data.filter(d => newest - Date.parse(d.timestamp) < 6 * 36e5).map(d => {
    const [room, place = ''] = d.airPurifierName.split(' - ');
    const [label, color] = AQI[pmBand(d.pM25)];
    return { room, place: place.replace(/\s*Floor\s*/i, ' · ชั้น '), pm25: Math.round(d.pM25), temp: +(+d.temp).toFixed(1), humidity: Math.round(d.humidity), label, color };
  }).sort((a, b) => a.place < b.place ? -1 : a.place > b.place ? 1 : 0);
}

// ponytail: word list, not a classifier. Short Thai words match the whole title only (หี ≠ หีบเพลง). Extend when something slips onto the TV.
const BLOCK = /^(หี|หำ|จู๋|โป๊)$|ควย|เย็ด|เงี่ยน|เซ็กส์|ร่วมเพศ|อวัยวะเพศ|หนังโป๊|ภาพโป๊|คลิปหลุด|สำเร็จความใคร่|ช่วยตัวเอง|\b(porn\w*|sex|xxx|nsfw|nude|hentai|onlyfans|xnxx|xvideos)\b/i;

// Spread each list evenly over the output, so a short list (Apple 2, Google TH ~7) isn't bunched on the first screen.
const spread = lists => lists.flatMap(l => l.map((it, i) => [(i + 0.5) / l.length, it]))
  .sort((a, b) => a[0] - b[0]).map(p => p[1]);

// Spread per region so platforms alternate, then 3 TH : 1 intl. Leftover intl is dropped to hold the ratio.
function mix(lists) {
  const th = spread(lists.filter(l => l[0] && l[0].region === 'TH'));
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

// Every URL in one parallel batch. One bad host (TLS, DNS) makes fetchAll throw for all, so then retry one by one.
// Returns the body text, or an Error, per URL.
function getAll(urls) {
  const reqs = urls.map(url => ({ url, muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrendF1rst)' } }));
  let res;
  try {
    res = UrlFetchApp.fetchAll(reqs);
  } catch (e) {
    res = reqs.map(r => { try { return UrlFetchApp.fetch(r.url, r); } catch (err) { return err; } });
  }
  return res.map((r, i) => r instanceof Error ? r
    : r.getResponseCode() < 300 ? r.getContentText() : new Error(r.getResponseCode() + ' ' + urls[i].split('?')[0]));
}

function collect(lat, lon, last) {
  const list = sources(PropertiesService.getScriptProperties().getProperty('YT_API_KEY'));
  const OFFICE = 'https://api.fareastfamelineddb.com/api/AirPurifiers/GetLatestAirPurifier';
  const AIR4THAI = 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php';
  const texts = getAll(list.map(s => s[2]).concat([weatherUrl(lat, lon), AIR4THAI, OFFICE]));
  const log = [];
  const parse = (name, fn, text) => {
    try {
      if (text instanceof Error) throw text;
      return fn(text);
    } catch (e) {
      log.push(`✗ ${name}: ${e.message.replace(/key=[^&\s]+/g, 'key=…')}`); // the log is public: never echo the YouTube key
      return null;
    }
  };
  const lists = list.map(([source, region, , fn, limit = PER_SOURCE], i) => {
    const items = parse(`${source} ${region}`, fn, texts[i]) || [];
    if (items.length) log.push(`✓ ${source} ${region}: ${items.length}`);
    return items.slice(0, limit).map((it, n) => Object.assign({ source, region, rank: n + 1 }, it, { title: clean(it.title), sub: clean(it.sub) }));
  });
  const [wx, aq, rooms] = texts.slice(list.length);
  const items = mix(lists);
  // Nearly everything failed: keep the last good trends and their timestamp, so the TV flags them as stale.
  const fresh = items.length >= 30;
  if (!fresh) log.push(`✗ only ${items.length} items, keeping previous trends`);
  return {
    updated: fresh ? new Date().toISOString() : last.updated,
    items: fresh ? items : last.items || items,
    weather: parse('weather', weather, wx) || last.weather,
    air: parse('air', t => air(t, lat, lon), aq) || last.air,
    office: parse('office', t => officeRooms(JSON.parse(t).data), rooms) || last.office || [],
    log,
  };
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const lat = +p.lat || 13.7588, lon = +p.lon || 100.533;
  const cache = CacheService.getScriptCache(), key = `trends:${lat},${lon}`;
  let json = cache.get(key);
  if (!json) {
    const last = JSON.parse(cache.get(key + ':last') || '{}');
    json = JSON.stringify(collect(lat, lon, last));
    cache.put(key, json, TTL);
    cache.put(key + ':last', json, 21600); // longest Apps Script allows (6 h): fallback when the sources fail
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// Run from the Apps Script editor (or node gas/test.js --check): throws on the first mismatch.
function check() {
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
  const mk = (source, region, n) => Array.from({ length: n }, (_, i) => ({ source, region, title: `${source}${region}${i}` }));
  const out = mix([mk('google', 'TH', 30), mk('x', 'TH', 30), mk('google', 'US', 50), mk('x', 'US', 50)]);
  eq([out.filter(i => i.region === 'TH').length, out.length], [60, 80], 'ratio should be 60 TH : 20 intl');
  eq([out[0].source, out[1].source], ['google', 'x'], 'platforms should alternate');
  eq(mix([[{ region: 'TH', title: 'Linkin Park' }], [{ region: 'TH', title: '#linkinpark' }]]).length, 1, 'dedupe');
  const few = mix([mk('google', 'TH', 10), mk('apple', 'TH', 2)]);
  eq(few.map((it, i) => it.source === 'apple' ? i : -1).filter(i => i >= 0), [3, 9], 'short list spreads out');
  eq(mix([[{ region: 'TH', title: 'หี' }, { region: 'TH', title: 'หีบเพลง' }, { region: 'TH', title: 'Pornhub' }]]).map(i => i.title), ['หีบเพลง'], 'block list');
  eq(clean('🔴Live สด! 𝐏𝐔𝐁𝐆 𝐓𝐇𝐀𝐈𝐋𝐀𝐍𝐃 𝟐𝟎𝟐𝟔 🇹🇭 ❤️'), 'Live สด! PUBG THAILAND 2026', 'fancy unicode');
  eq(clean('กำลังมาแรง'), 'กำลังมาแรง', 'Thai sara am must survive');
  eq(bkk(new Date('2026-09-29T02:04:37Z')), '29 ก.ย. 09:04', 'Bangkok time');
  eq([2, 20, 30, 50, 100].map(pmBand), [1, 2, 3, 4, 5], 'Thai PM2.5 bands');
  const rooms = officeRooms([
    { airPurifierName: 'Pizza Room - FEFLDDB Floor 5', timestamp: '2026-09-24T15:39:42', pM25: 4, temp: 25.1, humidity: 82 },
    { airPurifierName: 'Amazon - FEFLDDB Floor 4', timestamp: '2026-08-05T04:40:42', pM25: 4, temp: 27.7, humidity: 60 },
    { airPurifierName: 'Data Lab - Data First Floor 3', timestamp: '2026-09-24T15:02:14', pM25: 30, temp: 25.3, humidity: 75 },
  ]);
  eq(rooms.map(r => [r.room, r.place, r.label]), [['Data Lab', 'Data First · ชั้น 3', 'ปานกลาง'], ['Pizza Room', 'FEFLDDB · ชั้น 5', 'ดีมาก']], 'office rooms: stale dropped, sorted');
  return 'check done';
}
