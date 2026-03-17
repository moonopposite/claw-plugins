/**
 * vidsrc Spider for FongMi/TV (QuickJS / CatVodSpider)
 *
 * 数据流：
 *   搜索  → TMDB API
 *   分类  → TMDB discover（电影/剧集）
 *   播放  → vidsrc.net → cloudnestra rcp → prorcp → 解密 m3u8
 *   字幕  → yifysubtitles.ch（电影）
 *
 * 依赖：QuickJS 内置 fetch / Spider.js 全局 API
 *
 * @version 1.0.0
 */

var Spider = (function () {

  // ─────────────────────────────────────────
  // 常量
  // ─────────────────────────────────────────
  var TMDB_KEY   = '8265bd1679663a7ea12ac168da84d2e8'; // 公开 demo key
  var TMDB_BASE  = 'https://api.themoviedb.org/3';
  var TMDB_IMG   = 'https://image.tmdb.org/t/p/w500';
  var VIDSRC     = 'https://vidsrc.net';
  var CNESTRA    = 'https://cloudnestra.com';
  var YIFY       = 'https://yifysubtitles.ch';

  // 分辨率优先级（m3u8 里的 RESOLUTION 字段）
  var RES_ORDER = ['1920x1080', '1280x720', '854x480', '640x360'];

  // ─────────────────────────────────────────
  // 工具
  // ─────────────────────────────────────────

  function req(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers['User-Agent'] = opts.headers['User-Agent']
      || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120';
    return fetch(url, opts).then(function (r) { return r.text(); });
  }

  function reqJson(url, opts) {
    return req(url, opts).then(function (t) {
      try { return JSON.parse(t); } catch (e) { return {}; }
    });
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // 解析 master m3u8，返回最高质量子流完整 URL
  // baseUrl: 子流路径是相对路径时拼上（如 "https://tmstr5.cloudnestra.com"）
  function parseMasterM3u8(m3u8Text, baseUrl) {
    var lines = m3u8Text.split('\n');
    var streams = [];
    for (var i = 0; i < lines.length - 1; i++) {
      var line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        var resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
        var bwMatch  = line.match(/BANDWIDTH=(\d+)/);
        var url      = lines[i + 1].trim();
        if (!url || url.startsWith('#')) continue;
        if (!url.startsWith('http')) {
          url = baseUrl + (url.startsWith('/') ? '' : '/') + url;
        }
        streams.push({
          res: resMatch ? resMatch[1] : '0x0',
          bw:  bwMatch  ? parseInt(bwMatch[1]) : 0,
          url: url
        });
      }
    }
    if (streams.length === 0) return null;
    streams.sort(function (a, b) {
      var ai = RES_ORDER.indexOf(a.res), bi = RES_ORDER.indexOf(b.res);
      if (ai === -1) ai = 99; if (bi === -1) bi = 99;
      if (ai !== bi) return ai - bi;
      return b.bw - a.bw;
    });
    return streams[0].url;
  }

  // ─────────────────────────────────────────
  // TMDB 工具
  // ─────────────────────────────────────────

  function tmdbUrl(path, extra) {
    var p = TMDB_BASE + path + '?api_key=' + TMDB_KEY + '&language=zh-CN';
    if (extra) p += '&' + extra;
    return p;
  }

  function formatMovie(item) {
    return {
      vod_id:     'movie:' + item.id,
      vod_name:   item.title || item.original_title || '',
      vod_pic:    item.poster_path ? TMDB_IMG + item.poster_path : '',
      vod_year:   (item.release_date || '').slice(0, 4),
      vod_remarks: item.vote_average ? item.vote_average.toFixed(1) + '分' : '',
      type_name:  '电影',
      vod_content: item.overview || ''
    };
  }

  function formatTv(item) {
    return {
      vod_id:     'tv:' + item.id,
      vod_name:   item.name || item.original_name || '',
      vod_pic:    item.poster_path ? TMDB_IMG + item.poster_path : '',
      vod_year:   (item.first_air_date || '').slice(0, 4),
      vod_remarks: item.vote_average ? item.vote_average.toFixed(1) + '分' : '',
      type_name:  '剧集',
      vod_content: item.overview || ''
    };
  }

  // ─────────────────────────────────────────
  // 播放链路核心
  // ─────────────────────────────────────────

  // {v1}~{v9} 占位符对应的 CDN 域名（探针验证可用，按优先级排列）
  var CDN_DOMAINS = [
    'neonhorizonworkshops.com',
    'orchidpixelgardens.com',
    'cloudnestra.com',
  ];

  /**
   * 根据 tmdbId 和媒体类型获取 m3u8 直链
   * 链路：vidsrc.net embed → cloudnestra rcp（取 prorcp path）
   *       → prorcp HTML（file: "https://tmstr5.{v1}/pl/H4sI..." 直接在页面里）
   *       → 替换 {vN} 为真实 CDN → 请求 master m3u8 → 取最高质量流
   */
  async function getPlayUrl(mediaType, tmdbId, season, episode) {
    try {
      // 1. embed URL
      var embedUrl = (mediaType === 'tv' && season && episode)
        ? VIDSRC + '/embed/tv?tmdb=' + tmdbId + '&season=' + season + '&episode=' + episode
        : VIDSRC + '/embed/movie?tmdb=' + tmdbId;

      // 2. embed → rcp hash
      var embedHtml = await req(embedUrl, { headers: { 'Referer': VIDSRC + '/' } });
      var rcpMatch = embedHtml.match(/cloudnestra\.com\/rcp\/([^"' \n]+)/);
      if (!rcpMatch) return null;
      var rcpUrl = CNESTRA + '/rcp/' + rcpMatch[1];

      // 3. rcp → prorcp path（在内联 JS 的 src: '/prorcp/...' 里）
      var rcpHtml = await req(rcpUrl, { headers: { 'Referer': embedUrl } });
      var proRcpMatch = rcpHtml.match(/src:\s*['"]\/prorcp\/([^'"]+)['"]/);
      if (!proRcpMatch) return null;
      var proRcpUrl = CNESTRA + '/prorcp/' + proRcpMatch[1];

      // 4. prorcp → m3u8 URL 模板（file: "https://tmstr5.{v1}/pl/..." 直接在 HTML 里）
      var proRcpHtml = await req(proRcpUrl, { headers: { 'Referer': rcpUrl } });

      // 提取 file 字段（含多个 CDN 的 "... or ..." 格式）
      var fileMatch = proRcpHtml.match(/file:\s*["']([^"']+tmstr[^"']+)["']/);
      if (!fileMatch) return null;

      // 拆分为多个 URL 模板，取第一个（后面的是备用 CDN，格式相同）
      var urlTemplates = fileMatch[1].split(' or ').map(function (s) { return s.trim(); });

      // 5. 替换 {vN} 占位符 → 依次尝试 CDN 域名
      for (var ti = 0; ti < urlTemplates.length && ti < 4; ti++) {
        var tmpl = urlTemplates[ti];
        // 提取占位符编号
        var phMatch = tmpl.match(/\{(v\d+)\}/);
        if (!phMatch) continue;

        for (var di = 0; di < CDN_DOMAINS.length; di++) {
          // tmstr5.{v1} → tmstr5.cloudnestra.com
          var m3u8Url = tmpl.replace(/\{v\d+\}/g, CDN_DOMAINS[di]);
          try {
            var m3u8Text = await req(m3u8Url, { headers: { 'Referer': proRcpUrl } });
            if (m3u8Text.includes('#EXTM3U')) {
              // master m3u8：选最高质量子流
              var cdnBase = 'https://tmstr5.' + CDN_DOMAINS[di];
              var streamUrl = parseMasterM3u8(m3u8Text, cdnBase);
              return streamUrl || m3u8Url;
            }
          } catch (e) { /* 换下一个 CDN */ }
        }
      }

      return null;
    } catch (e) {
      console.error('[vidsrc] getPlayUrl error:', e.message || e);
      return null;
    }
  }

  // ─────────────────────────────────────────
  // 字幕链路
  // ─────────────────────────────────────────

  /**
   * 从 yifysubtitles.ch 获取中文字幕 zip URL
   * 只支持电影（剧集字幕不在 yify）
   * @param {string} imdbId  格式 "tt0111161"
   * @returns {Promise<string|null>}  zip 直链
   */
  async function getSubtitleZipUrl(imdbId) {
    try {
      var listUrl = YIFY + '/movie-imdb/' + imdbId;
      var html = await req(listUrl, { headers: { 'Referer': YIFY + '/' } });

      // 找中文字幕行
      var rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
      var chiPath = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].includes('Chinese') || rows[i].includes('flag-cn')) {
          var lm = rows[i].match(/href="(\/subtitles\/[^"]+)"/);
          if (lm) { chiPath = lm[1]; break; }
        }
      }
      if (!chiPath) return null;

      // 获取详情页，找 zip 下载链接
      var detailHtml = await req(YIFY + chiPath, { headers: { 'Referer': listUrl } });
      var dlMatch = detailHtml.match(/href="(\/subtitle\/[^"]+\.zip)"/);
      if (!dlMatch) return null;

      return YIFY + dlMatch[1];
    } catch (e) {
      return null;
    }
  }

  /**
   * 获取 TMDB 条目对应的 IMDB ID
   */
  async function getImdbId(mediaType, tmdbId) {
    try {
      var data = await reqJson(tmdbUrl('/' + mediaType + '/' + tmdbId + '/external_ids'));
      return data.imdb_id || null;
    } catch (e) {
      return null;
    }
  }

  // ─────────────────────────────────────────
  // Spider 接口实现
  // ─────────────────────────────────────────

  return {

    // ── 初始化 ──────────────────────────────
    init: function () {
      return JSON.stringify({ code: 1 });
    },

    // ── 首页分类 ────────────────────────────
    homeContent: function (filter) {
      var cats = [
        { type_id: 'movie_popular',     type_name: '热门电影' },
        { type_id: 'movie_top',         type_name: '高分电影' },
        { type_id: 'movie_upcoming',    type_name: '即将上映' },
        { type_id: 'movie_nowplaying',  type_name: '正在上映' },
        { type_id: 'tv_popular',        type_name: '热门剧集' },
        { type_id: 'tv_top',            type_name: '高分剧集' },
        { type_id: 'tv_airing',         type_name: '正在播出' },
      ];

      var filters = {};
      if (filter) {
        ['movie_popular','movie_top','movie_upcoming','movie_nowplaying','tv_popular','tv_top','tv_airing'].forEach(function (id) {
          filters[id] = [
            {
              key: 'genre', name: '类型', value: [
                { n: '全部', v: '' },
                { n: '动作', v: '28' },
                { n: '喜剧', v: '35' },
                { n: '剧情', v: '18' },
                { n: '科幻', v: '878' },
                { n: '恐怖', v: '27' },
                { n: '动画', v: '16' },
                { n: '犯罪', v: '80' },
              ]
            },
            {
              key: 'year', name: '年份', value: [
                { n: '全部', v: '' },
                { n: '2025', v: '2025' },
                { n: '2024', v: '2024' },
                { n: '2023', v: '2023' },
                { n: '2022', v: '2022' },
                { n: '2020年代', v: '2020' },
                { n: '2010年代', v: '2010' },
              ]
            },
          ];
        });
      }

      return JSON.stringify({ class: cats, filters: filters });
    },

    // ── 首页推荐 ────────────────────────────
    homeVideoContent: async function () {
      var data = await reqJson(tmdbUrl('/movie/popular'));
      var list = (data.results || []).slice(0, 12).map(formatMovie);
      return JSON.stringify({ list: list });
    },

    // ── 分类列表 ────────────────────────────
    categoryContent: async function (tid, pg, filter, extend) {
      pg = parseInt(pg) || 1;
      extend = extend || {};

      var genreParam = (extend.genre && extend.genre !== '') ? '&with_genres=' + extend.genre : '';
      var yearParam  = '';
      if (extend.year && extend.year !== '') {
        var yr = extend.year;
        yearParam = yr.length === 4 ? '&primary_release_year=' + yr : '&primary_release_year.gte=' + yr;
      }

      var url, formatter;

      if (tid === 'movie_popular') {
        url = tmdbUrl('/movie/popular', 'page=' + pg + genreParam + yearParam);
        formatter = formatMovie;
      } else if (tid === 'movie_top') {
        url = tmdbUrl('/movie/top_rated', 'page=' + pg + genreParam + yearParam);
        formatter = formatMovie;
      } else if (tid === 'movie_upcoming') {
        url = tmdbUrl('/movie/upcoming', 'page=' + pg);
        formatter = formatMovie;
      } else if (tid === 'movie_nowplaying') {
        url = tmdbUrl('/movie/now_playing', 'page=' + pg);
        formatter = formatMovie;
      } else if (tid === 'tv_popular') {
        url = tmdbUrl('/tv/popular', 'page=' + pg + genreParam);
        formatter = formatTv;
      } else if (tid === 'tv_top') {
        url = tmdbUrl('/tv/top_rated', 'page=' + pg + genreParam);
        formatter = formatTv;
      } else if (tid === 'tv_airing') {
        url = tmdbUrl('/tv/on_the_air', 'page=' + pg);
        formatter = formatTv;
      } else {
        return JSON.stringify({ list: [], total: 0 });
      }

      var data = await reqJson(url);
      var list  = (data.results || []).map(formatter);
      var total = Math.min(data.total_results || 0, data.total_pages * 20 || 0);

      return JSON.stringify({ list: list, page: pg, pagecount: data.total_pages || 1, total: total });
    },

    // ── 详情页 ──────────────────────────────
    detailContent: async function (ids) {
      var id = Array.isArray(ids) ? ids[0] : ids;
      var parts     = String(id).split(':');
      var mediaType = parts[0]; // 'movie' or 'tv'
      var tmdbId    = parts[1];

      if (mediaType === 'movie') {
        var data = await reqJson(tmdbUrl('/movie/' + tmdbId, 'append_to_response=credits'));
        var directors = ((data.credits || {}).crew || [])
          .filter(function (c) { return c.job === 'Director'; })
          .map(function (c) { return c.name; }).slice(0, 3).join(' / ');
        var cast = ((data.credits || {}).cast || [])
          .slice(0, 5).map(function (c) { return c.name; }).join(' / ');
        var genres = (data.genres || []).map(function (g) { return g.name; }).join(' ');

        var vod = {
          vod_id:        id,
          vod_name:      data.title || '',
          vod_pic:       data.poster_path ? TMDB_IMG + data.poster_path : '',
          vod_year:      (data.release_date || '').slice(0, 4),
          vod_remarks:   data.vote_average ? data.vote_average.toFixed(1) + '分' : '',
          vod_director:  directors,
          vod_actor:     cast,
          vod_area:      (data.production_countries || []).map(function (c) { return c.name; }).join('/'),
          vod_lang:      (data.spoken_languages || []).map(function (l) { return l.name; }).join('/'),
          vod_content:   data.overview || '',
          type_name:     genres,
          vod_play_from: 'vidsrc',
          vod_play_url:  data.title + '$movie:' + tmdbId
        };
        return JSON.stringify({ list: [vod] });

      } else {
        // TV 剧集
        var tvData = await reqJson(tmdbUrl('/tv/' + tmdbId, 'append_to_response=credits'));
        var seasons = tvData.seasons || [];
        var playUrls = [];

        for (var si = 0; si < seasons.length; si++) {
          var season = seasons[si];
          if (season.season_number === 0) continue; // 跳过特别篇
          var epCount = season.episode_count || 0;
          var eps = [];
          for (var ep = 1; ep <= epCount; ep++) {
            eps.push('第' + ep + '集$tv:' + tmdbId + ':' + season.season_number + ':' + ep);
          }
          if (eps.length > 0) {
            playUrls.push(eps.join('#'));
          }
        }

        var tvVod = {
          vod_id:        id,
          vod_name:      tvData.name || '',
          vod_pic:       tvData.poster_path ? TMDB_IMG + tvData.poster_path : '',
          vod_year:      (tvData.first_air_date || '').slice(0, 4),
          vod_remarks:   tvData.vote_average ? tvData.vote_average.toFixed(1) + '分' : '',
          vod_content:   tvData.overview || '',
          type_name:     (tvData.genres || []).map(function (g) { return g.name; }).join(' '),
          vod_play_from: playUrls.map(function (_, i) { return '第' + (i+1) + '季'; }).join('$$$'),
          vod_play_url:  playUrls.join('$$$')
        };
        return JSON.stringify({ list: [tvVod] });
      }
    },

    // ── 播放地址解析 ─────────────────────────
    playerContent: async function (flag, id, vipFlags) {
      // id 格式:
      //   电影: "movie:278"
      //   剧集: "tv:1396:1:2"  (tmdb:season:episode)
      var parts = String(id).split(':');
      var mediaType = parts[0];
      var tmdbId    = parts[1];
      var season    = parts[2] ? parseInt(parts[2]) : undefined;
      var episode   = parts[3] ? parseInt(parts[3]) : undefined;

      // 1. 获取播放 URL
      var playUrl = await getPlayUrl(mediaType, tmdbId, season, episode);
      if (!playUrl) {
        return JSON.stringify({ parse: 0, url: '', header: {} });
      }

      // 2. 字幕（仅电影）
      var subtitle = '';
      if (mediaType === 'movie') {
        var imdbId = await getImdbId('movie', tmdbId);
        if (imdbId) {
          var subZipUrl = await getSubtitleZipUrl(imdbId);
          if (subZipUrl) subtitle = subZipUrl;
        }
      }

      var result = {
        parse:  0,
        url:    playUrl,
        header: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer':    CNESTRA + '/'
        }
      };
      if (subtitle) result.subf = subtitle; // FongMi/TV 的字幕字段

      return JSON.stringify(result);
    },

    // ── 搜索 ─────────────────────────────────
    searchContent: async function (key, quick, pg) {
      pg = parseInt(pg) || 1;
      var data = await reqJson(tmdbUrl('/search/multi', 'query=' + encodeURIComponent(key) + '&page=' + pg));
      var list = (data.results || [])
        .filter(function (item) { return item.media_type === 'movie' || item.media_type === 'tv'; })
        .map(function (item) {
          return item.media_type === 'movie' ? formatMovie(item) : formatTv(item);
        });
      return JSON.stringify({ list: list });
    },

    // ── 无需实现的接口 ───────────────────────
    manualVideoInfo: function () { return ''; },
    isVideoFormat:   function () { return false; },
    getSources:      function () { return '[]'; },
  };

})();

module.exports = Spider;
