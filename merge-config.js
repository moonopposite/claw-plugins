const https = require('https');
const fs = require('fs');

const MEOW_URL = 'https://raw.githubusercontent.com/YuanHsing/freed/master/TVBox/meow.json';

const YOUTUBE_SITE = {
  key: "youtube_claw",
  name: "▶️ YouTube",
  type: 3,
  api: "https://raw.githubusercontent.com/moonopposite/claw-plugins/master/youtube-spider.js",
  searchable: 1,
  quickSearch: 1,
  filterable: 0
};

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.log('下载 meow.json ...');
  const raw = await fetchText(MEOW_URL);

  // meow.json 有注释行（// 或 # 开头），需要去掉才能 JSON.parse
  const cleaned = raw
    .split('\n')
    .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('#'))
    .join('\n');

  const config = JSON.parse(cleaned);
  console.log('原始 sites 数量:', config.sites.length);

  // 追加 YouTube 到 sites 末尾
  config.sites.push(YOUTUBE_SITE);
  console.log('合并后 sites 数量:', config.sites.length);

  const output = JSON.stringify(config, null, 2);
  fs.writeFileSync('tv-config.json', output, 'utf8');
  console.log('已写入 tv-config.json，字节数:', output.length);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
