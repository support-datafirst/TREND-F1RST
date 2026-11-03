// Builds site.json (YouTube embed, urgent notice, slide list, API settings) from config.json and the slides/ and notice/ folders.
// GitHub Actions runs it whenever someone edits either. Live data comes from the Apps Script API (gas/Code.gs).
// node site.js   |   self-check: node site.js --check
const { writeFileSync, readdirSync } = require('node:fs');
const assert = require('node:assert');

// Any YouTube link (watch, youtu.be, live, shorts, playlist) -> muted autoplay loop embed. Browsers block autoplay with sound.
const YT_Q = 'autoplay=1&mute=1&controls=0&rel=0&playsinline=1&loop=1';
function youtubeEmbed(link = '') {
  const id = (link.match(/(?:[?&]v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/) || [])[1];
  const list = (link.match(/[?&]list=([\w-]+)/) || [])[1];
  if (list) return `https://www.youtube.com/embed/${id || 'videoseries'}?list=${list}&${YT_Q}`;
  return id ? `https://www.youtube.com/embed/${id}?playlist=${id}&${YT_Q}` : '';
}

// A notice image named with its end date (Bangkok time), e.g. server-until-2026-11-08-1700.jpg, disappears after it.
// Date alone = until 23:59 that day. No date = until the file is deleted.
function until(name) {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})(?:[-_ ]?(\d{2})(\d{2}))?/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4] ? m[4] + ':' + m[5] : '23:59'}:00+07:00` : '';
}

if (process.argv[2] === '--check') {
  assert.equal(youtubeEmbed('https://youtu.be/dQw4w9WgXcQ?si=abc'), `https://www.youtube.com/embed/dQw4w9WgXcQ?playlist=dQw4w9WgXcQ&${YT_Q}`);
  assert.equal(youtubeEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx_1'), `https://www.youtube.com/embed/dQw4w9WgXcQ?list=PLx_1&${YT_Q}`);
  assert.equal(youtubeEmbed('https://www.youtube.com/playlist?list=PLx_1'), `https://www.youtube.com/embed/videoseries?list=PLx_1&${YT_Q}`);
  assert.equal(youtubeEmbed('https://www.youtube.com/live/abcdefghijk'), `https://www.youtube.com/embed/abcdefghijk?playlist=abcdefghijk&${YT_Q}`);
  assert.equal(youtubeEmbed('not a link'), '');
  assert.equal(until('server-until-2026-11-08-1700.jpg'), '2026-11-08T17:00:00+07:00');
  assert.equal(until('ประกาศ 2026-11-08.png'), '2026-11-08T23:59:00+07:00');
  assert.equal(until('notice.jpg'), '');
  console.log('check done');
} else {
  const config = require('./config.json');
  const images = dir => {
    try {
      return readdirSync(__dirname + '/' + dir).filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f)).sort().map(f => dir + '/' + encodeURIComponent(f));
    } catch { return []; }
  };
  const slides = images('slides');
  // Images in notice/ replace the YouTube video (the page shows the first one not past its end date).
  const notices = images('notice').map(src => ({ src, until: until(decodeURIComponent(src)) }));
  writeFileSync(__dirname + '/site.json', JSON.stringify({
    youtube: youtubeEmbed(config.youtube),
    notices,
    slides,
    slideSeconds: config.slideSeconds || 10,
    api: config.api,
    apiMinutes: config.apiMinutes || 180,
    location: config.location,
  }, null, 1) + '\n');
  console.log(`site.json: ${slides.length} slides, ${notices.length} notices, youtube ${config.youtube ? 'on' : 'off'}`);
}
