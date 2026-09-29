// Builds site.json (YouTube embed, slide list, API settings) from config.json and the slides/ folder.
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

if (process.argv[2] === '--check') {
  assert.equal(youtubeEmbed('https://youtu.be/dQw4w9WgXcQ?si=abc'), `https://www.youtube.com/embed/dQw4w9WgXcQ?playlist=dQw4w9WgXcQ&${YT_Q}`);
  assert.equal(youtubeEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx_1'), `https://www.youtube.com/embed/dQw4w9WgXcQ?list=PLx_1&${YT_Q}`);
  assert.equal(youtubeEmbed('https://www.youtube.com/playlist?list=PLx_1'), `https://www.youtube.com/embed/videoseries?list=PLx_1&${YT_Q}`);
  assert.equal(youtubeEmbed('https://www.youtube.com/live/abcdefghijk'), `https://www.youtube.com/embed/abcdefghijk?playlist=abcdefghijk&${YT_Q}`);
  assert.equal(youtubeEmbed('not a link'), '');
  console.log('check done');
} else {
  const config = require('./config.json');
  let slides = [];
  try {
    slides = readdirSync(__dirname + '/slides').filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f)).sort()
      .map(f => 'slides/' + encodeURIComponent(f));
  } catch {}
  writeFileSync(__dirname + '/site.json', JSON.stringify({
    youtube: youtubeEmbed(config.youtube),
    slides,
    slideSeconds: config.slideSeconds || 10,
    api: config.api,
    apiMinutes: config.apiMinutes || 180,
    location: config.location,
  }, null, 1) + '\n');
  console.log(`site.json: ${slides.length} slides, youtube ${config.youtube ? 'on' : 'off'}`);
}
