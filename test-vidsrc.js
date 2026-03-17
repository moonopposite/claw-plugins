/**
 * vidsrc spider 本地测试脚本
 * 在 Node.js 环境运行，模拟 FongMi/TV 的 QuickJS 调用
 */

// ── 模拟 QuickJS fetch ──────────────────────────────────────────────────────
const https = require('https');
const http  = require('http');
const zlib  = require('zlib');

global.fetch = function (url, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch(e) { return reject(e); }

    const headers = Object.assign({
      'User-Agent': 'Mozilla/5.0',
      'Accept-Encoding': 'gzip, deflate',
    }, opts.headers || {});

    const mod = u.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   opts.method || 'GET',
      headers:  headers,
    };

    function doReq(resolvedUrl, redirectCount) {
      if (redirectCount > 8) return reject(new Error('too many redirects'));
      let ru;
      try { ru = new URL(resolvedUrl); } catch(e) { return reject(e); }
      const m = ru.protocol === 'https:' ? https : http;
      const rOpts = { hostname: ru.hostname, path: ru.pathname + ru.search, method: opts.method || 'GET', headers };

      const req = m.request(rOpts, (res) => {
        if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
          const loc = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${ru.protocol}//${ru.hostname}${res.headers.location}`;
          return doReq(loc, redirectCount + 1);
        }
        let chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const enc = res.headers['content-encoding'];
          function done(buf) {
            const text = buf.toString('utf8');
            resolve({ status: res.statusCode, text: () => Promise.resolve(text), json: () => Promise.resolve(JSON.parse(text)) });
          }
          if (enc === 'gzip') zlib.gunzip(raw, (e, d) => e ? reject(e) : done(d));
          else if (enc === 'deflate') zlib.inflate(raw, (e, d) => e ? reject(e) : done(d));
          else done(raw);
        });
      });
      req.on('error', reject);
      req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout: ' + resolvedUrl)); });
      if (opts.body) req.write(opts.body);
      req.end();
    }

    doReq(url, 0);
  });
};

// ── 模拟 pako ──────────────────────────────────────────────────────────────
global.pako = require('pako');
global.atob = (s) => Buffer.from(s, 'base64').toString('binary');

// ── 加载 spider ────────────────────────────────────────────────────────────
const Spider = require('./vidsrc.js');

// ── 测试入口 ───────────────────────────────────────────────────────────────
async function run() {
  console.log('━'.repeat(60));
  console.log(' vidsrc Spider 测试');
  console.log('━'.repeat(60));

  // 1. 首页分类
  console.log('\n[1] homeContent()');
  const home = JSON.parse(Spider.homeContent(true));
  console.log('分类数:', home.class.length, '→', home.class.map(c => c.type_name).join(', '));

  // 2. 搜索
  console.log('\n[2] searchContent("shawshank")');
  const search = JSON.parse(await Spider.searchContent('shawshank', false, 1));
  console.log('搜索结果数:', search.list.length);
  if (search.list[0]) {
    const s = search.list[0];
    console.log(' 第1条:', s.vod_name, s.vod_year, s.vod_remarks, '| id:', s.vod_id);
  }

  // 3. 电影详情
  console.log('\n[3] detailContent("movie:278") — 肖申克的救赎');
  const detail = JSON.parse(await Spider.detailContent(['movie:278']));
  const vod = detail.list[0];
  console.log('名称:', vod.vod_name);
  console.log('导演:', vod.vod_director);
  console.log('主演:', vod.vod_actor);
  console.log('简介:', vod.vod_content.slice(0, 80) + '...');
  console.log('播放URL格式:', vod.vod_play_url.slice(0, 60));

  // 4. 分类列表
  console.log('\n[4] categoryContent("movie_top", 1)');
  const cat = JSON.parse(await Spider.categoryContent('movie_top', 1, false, {}));
  console.log('列表数:', cat.list.length, '总页数:', cat.pagecount);
  if (cat.list[0]) console.log(' 第1条:', cat.list[0].vod_name, cat.list[0].vod_remarks);

  // 5. 播放解析（核心！）
  console.log('\n[5] playerContent("vidsrc", "movie:278") — 解析播放地址');
  const startTime = Date.now();
  const player = JSON.parse(await Spider.playerContent('vidsrc', 'movie:278', []));
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('耗时:', elapsed + 's');
  if (player.url) {
    console.log('✅ 播放URL:', player.url.slice(0, 100));
    console.log('字幕URL:', player.subf || '(无)');
  } else {
    console.log('❌ 未获取到播放地址');
  }

  // 6. 剧集详情（绝命毒师 tmdb:1396）
  console.log('\n[6] detailContent("tv:1396") — 绝命毒师');
  const tvDetail = JSON.parse(await Spider.detailContent(['tv:1396']));
  const tvVod = tvDetail.list[0];
  console.log('名称:', tvVod.vod_name);
  const seasons = tvVod.vod_play_from.split('$$$');
  console.log('季数:', seasons.length);
  const s1Episodes = (tvVod.vod_play_url.split('$$$')[0] || '').split('#');
  console.log('第1季集数:', s1Episodes.length);
  if (s1Episodes[0]) console.log('第1集 id:', s1Episodes[0].split('$')[1]);

  // 7. 剧集播放（绝命毒师 S01E01）
  console.log('\n[7] playerContent("vidsrc", "tv:1396:1:1") — 绝命毒师 S01E01');
  const startTime2 = Date.now();
  const tvPlayer = JSON.parse(await Spider.playerContent('vidsrc', 'tv:1396:1:1', []));
  const elapsed2 = ((Date.now() - startTime2) / 1000).toFixed(1);
  console.log('耗时:', elapsed2 + 's');
  if (tvPlayer.url) {
    console.log('✅ 播放URL:', tvPlayer.url.slice(0, 100));
  } else {
    console.log('❌ 未获取到播放地址');
  }

  console.log('\n' + '━'.repeat(60));
  console.log(' 测试完成');
  console.log('━'.repeat(60));
}

run().catch(e => {
  console.error('\n💥 测试失败:', e.message);
  console.error(e.stack);
  process.exit(1);
});
