/**
 * VidSrc Spider for FongMi/TV (QuickJS)
 *
 * 规范（参照 youtube-spider.js）：
 *   - ES Module：export default { init, home, homeVod, category, detail, search, play }
 *   - 全部同步：req(url, opts) → { code, content }，不用 async/await
 *
 * 数据流：
 *   搜索/分类  → TMDB API
 *   播放       → vidsrc embed → cloudnestra rcp → prorcp → m3u8 直链
 *   字幕       → OpenSubtitles.com REST API（电影+剧集，返回 .srt 直链）
 *              需在 Spider 配置 JSON 里填写 osub_key / osub_user / osub_pass
 */

var TMDB_KEY  = '8265bd1679663a7ea12ac168da84d2e8';
var TMDB_BASE = 'https://api.themoviedb.org/3';
var TMDB_IMG  = 'https://image.tmdb.org/t/p/w500';
var VIDSRC    = 'https://vidsrc.net';
var CNESTRA   = 'https://cloudnestra.com';
var UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120';

// ── OpenSubtitles 配置（可在 init 里覆盖）────────────────────
var OSUB_KEY  = '';   // Consumer API Key
var OSUB_USER = '';   // 用户名
var OSUB_PASS = '';   // 密码
var OSUB_BASE = 'https://api.opensubtitles.com/api/v1';
var _osubToken = '';  // 运行时缓存 JWT，同一次 play 调用中复用

var CDN_DOMAINS = ['neonhorizonworkshops.com', 'orchidpixelgardens.com', 'cloudnestra.com', 'wanderlynest.com'];
var RES_ORDER   = ['1920x1080', '1280x720', '854x480', '640x360'];

// ── 工具 ──────────────────────────────────────────────────────

function get(url, referer) {
    var res = req(url, {
        method: 'GET',
        headers: {
            'User-Agent': UA,
            'Referer': referer || '',
        },
    });
    return (res && res.code >= 200 && res.code < 300) ? (res.content || '') : '';
}

function post(url, body, extraHeaders) {
    var hdrs = { 'User-Agent': UA, 'Content-Type': 'application/json' };
    if (extraHeaders) {
        for (var k in extraHeaders) hdrs[k] = extraHeaders[k];
    }
    var res = req(url, {
        method: 'POST',
        headers: hdrs,
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return (res && res.code >= 200 && res.code < 300) ? (res.content || '') : '';
}

function getJson(url) {
    var text = get(url);
    if (!text) return {};
    try { return JSON.parse(text); } catch (e) { return {}; }
}

function postJson(url, body, extraHeaders) {
    var text = post(url, body, extraHeaders);
    if (!text) return {};
    try { return JSON.parse(text); } catch (e) { return {}; }
}

function tmdbUrl(path, extra) {
    var u = TMDB_BASE + path + '?api_key=' + TMDB_KEY + '&language=zh-CN';
    if (extra) u += '&' + extra;
    return u;
}

function formatMovie(item) {
    return {
        vod_id:      'movie:' + item.id,
        vod_name:    item.title || item.original_title || '',
        vod_pic:     item.poster_path ? TMDB_IMG + item.poster_path : '',
        vod_year:    (item.release_date || '').slice(0, 4),
        vod_remarks: item.vote_average ? item.vote_average.toFixed(1) + '分' : '',
        type_name:   '电影',
    };
}

function formatTv(item) {
    return {
        vod_id:      'tv:' + item.id,
        vod_name:    item.name || item.original_name || '',
        vod_pic:     item.poster_path ? TMDB_IMG + item.poster_path : '',
        vod_year:    (item.first_air_date || '').slice(0, 4),
        vod_remarks: item.vote_average ? item.vote_average.toFixed(1) + '分' : '',
        type_name:   '剧集',
    };
}

// 解析 master m3u8，返回最高质量子流 URL
function parseMaster(m3u8Text, baseUrl) {
    var lines = m3u8Text.split('\n');
    var streams = [];
    for (var i = 0; i < lines.length - 1; i++) {
        var line = lines[i].trim();
        if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
            var rm = line.match(/RESOLUTION=(\d+x\d+)/);
            var bm = line.match(/BANDWIDTH=(\d+)/);
            var url = lines[i + 1].trim();
            if (!url || url.charAt(0) === '#') continue;
            if (url.indexOf('http') !== 0) url = baseUrl + (url.charAt(0) === '/' ? '' : '/') + url;
            streams.push({ res: rm ? rm[1] : '0x0', bw: bm ? parseInt(bm[1]) : 0, url: url });
        }
    }
    if (!streams.length) return null;
    streams.sort(function (a, b) {
        var ai = RES_ORDER.indexOf(a.res), bi = RES_ORDER.indexOf(b.res);
        if (ai < 0) ai = 99; if (bi < 0) bi = 99;
        return ai !== bi ? ai - bi : b.bw - a.bw;
    });
    return streams[0].url;
}

// ── 播放链路（同步） ──────────────────────────────────────────

function getPlayUrl(mediaType, tmdbId, season, episode) {
    // 1. embed URL
    var embedUrl = (mediaType === 'tv' && season && episode)
        ? VIDSRC + '/embed/tv?tmdb=' + tmdbId + '&season=' + season + '&episode=' + episode
        : VIDSRC + '/embed/movie?tmdb=' + tmdbId;

    // 2. embed → cloudnestra rcp hash
    var embedHtml = get(embedUrl, VIDSRC + '/');
    if (!embedHtml) return '';
    var rcpM = embedHtml.match(/cloudnestra\.com\/rcp\/([^"' \n]+)/);
    if (!rcpM) return '';
    var rcpUrl = CNESTRA + '/rcp/' + rcpM[1];

    // 3. rcp → prorcp path（在内联 JS 的 src: '/prorcp/...' 里）
    var rcpHtml = get(rcpUrl, embedUrl);
    if (!rcpHtml) return '';
    var proM = rcpHtml.match(/src:\s*['"]\/prorcp\/([^'"]+)['"]/);
    if (!proM) return '';
    var proUrl = CNESTRA + '/prorcp/' + proM[1];

    // 4. prorcp HTML → file: "https://tmstr5.{v1}/pl/..." 模板
    var proHtml = get(proUrl, rcpUrl);
    if (!proHtml) return '';
    var fileM = proHtml.match(/file:\s*["']([^"']+tmstr[^"']+)["']/);
    if (!fileM) return '';

    // 5. 拆多个模板（" or " 分隔），依次尝试 CDN 域名
    var tmpls = fileM[1].split(' or ');
    for (var ti = 0; ti < tmpls.length && ti < 4; ti++) {
        var tmpl = tmpls[ti].trim();
        if (tmpl.indexOf('{v') < 0) continue;
        for (var di = 0; di < CDN_DOMAINS.length; di++) {
            var m3u8Url = tmpl.replace(/\{v\d+\}/g, CDN_DOMAINS[di]);
            var m3u8Text = get(m3u8Url, proUrl);
            if (m3u8Text && m3u8Text.indexOf('#EXTM3U') >= 0) {
                var base = 'https://tmstr5.' + CDN_DOMAINS[di];
                return parseMaster(m3u8Text, base) || m3u8Url;
            }
        }
    }
    return '';
}

// ── 字幕（OpenSubtitles REST API）────────────────────────────

// 构造 OSub 请求头
function osubHeaders() {
    var h = { 'Api-Key': OSUB_KEY, 'Content-Type': 'application/json', 'User-Agent': 'FongMiTV v2.0' };
    if (_osubToken) h['Authorization'] = 'Bearer ' + _osubToken;
    return h;
}

// 登录，返回 token；失败返回空串
function osubLogin() {
    if (!OSUB_KEY || !OSUB_USER || !OSUB_PASS) return '';
    var data = postJson(OSUB_BASE + '/login', { username: OSUB_USER, password: OSUB_PASS }, osubHeaders());
    return data.token || '';
}

// 搜索字幕，返回条目数组（已按 download_count 降序）
// type: 'movie' | 'episode'
function osubSearch(imdbId, lang, type) {
    if (!_osubToken) return [];
    var params = 'imdb_id=' + encodeURIComponent(imdbId)
        + '&languages=' + encodeURIComponent(lang)
        + '&type=' + (type || 'movie')
        + '&order_by=download_count&order_direction=desc';
    var res = req(OSUB_BASE + '/subtitles?' + params, {
        method: 'GET',
        headers: osubHeaders(),
    });
    if (!res || res.code < 200 || res.code >= 300) return [];
    try {
        var d = JSON.parse(res.content || '{}');
        return d.data || [];
    } catch (e) { return []; }
}

// 获取下载直链，返回 { url, fileName } 或 null
// 每次消耗 1 次配额（免费 5/天）
function osubDownloadLink(fileId) {
    if (!_osubToken || !fileId) return null;
    var res = req(OSUB_BASE + '/download', {
        method: 'POST',
        headers: osubHeaders(),
        body: JSON.stringify({ file_id: fileId }),
    });
    if (!res || res.code < 200 || res.code >= 300) return null;
    try {
        var d = JSON.parse(res.content || '{}');
        if (!d.link) return null;
        return { url: d.link, fileName: d.file_name || '' };
    } catch (e) { return null; }
}

// 从 OSub 条目中按语言偏好找 fileId（中文优先，其次英文）
function osubPickFileId(items, langPref) {
    for (var i = 0; i < items.length; i++) {
        var a = items[i].attributes || {};
        if (a.language === langPref && a.files && a.files[0]) {
            return a.files[0].file_id;
        }
    }
    // 宽松匹配（zh / zh-CN / zh-TW 都算中文）
    if (langPref === 'zh-CN' || langPref === 'zh') {
        for (var j = 0; j < items.length; j++) {
            var b = items[j].attributes || {};
            if ((b.language || '').indexOf('zh') === 0 && b.files && b.files[0]) {
                return b.files[0].file_id;
            }
        }
    }
    return 0;
}

// 构建 subs 数组（OpenSubtitles，电影或剧集）
// 返回 [{ name, url, lang, format }]，供 _play 使用
function getSubsOsub(imdbId, mediaType) {
    // 懒加载登录
    if (!_osubToken) {
        _osubToken = osubLogin();
        if (!_osubToken) return [];
    }

    var type = (mediaType === 'movie') ? 'movie' : 'episode';
    // 同时取中英文（一次请求，OSub 支持逗号分隔）
    var items = osubSearch(imdbId, 'zh-CN,en', type);
    if (!items.length) return [];

    var subs = [];

    // 中文字幕
    var zhFileId = osubPickFileId(items, 'zh-CN');
    if (zhFileId) {
        var zhLink = osubDownloadLink(zhFileId);
        if (zhLink) {
            // 根据文件名判断格式（srt/ass/ssa/vtt）
            var fmt = 'text/plain';
            var fn = (zhLink.fileName || '').toLowerCase();
            if (fn.indexOf('.srt') >= 0) fmt = 'text/srt';
            else if (fn.indexOf('.ass') >= 0 || fn.indexOf('.ssa') >= 0) fmt = 'text/ass';
            else if (fn.indexOf('.vtt') >= 0) fmt = 'text/vtt';
            subs.push({ name: '中文', url: zhLink.url, lang: 'zh', format: fmt });
        }
    }

    // 英文字幕（同样消耗一次配额，与中文合并搜索结果）
    var enFileId = osubPickFileId(items, 'en');
    if (enFileId) {
        var enLink = osubDownloadLink(enFileId);
        if (enLink) {
            var efmt = 'text/plain';
            var ef = (enLink.fileName || '').toLowerCase();
            if (ef.indexOf('.srt') >= 0) efmt = 'text/srt';
            else if (ef.indexOf('.ass') >= 0 || ef.indexOf('.ssa') >= 0) efmt = 'text/ass';
            else if (ef.indexOf('.vtt') >= 0) efmt = 'text/vtt';
            subs.push({ name: 'English', url: enLink.url, lang: 'en', format: efmt });
        }
    }

    return subs;
}

// ── 辅助：取 IMDB ID ─────────────────────────────────────────

function getImdbId(mediaType, tmdbId) {
    var d = getJson(tmdbUrl('/' + mediaType + '/' + tmdbId + '/external_ids'));
    return d.imdb_id || '';
}

// ── Spider 接口 ────────────────────────────────────────────────

function _init(cfg) {
    // FongMi/TV 会将 Spider 配置 JSON 传入 cfg
    // 支持在 Spider 配置里填写 OSub 凭据：
    // { "osub_key": "...", "osub_user": "...", "osub_pass": "..." }
    if (cfg) {
        try {
            var c = typeof cfg === 'string' ? JSON.parse(cfg) : cfg;
            if (c.osub_key)  OSUB_KEY  = c.osub_key;
            if (c.osub_user) OSUB_USER = c.osub_user;
            if (c.osub_pass) OSUB_PASS = c.osub_pass;
        } catch (e) {}
    }
}

function _home(filter) {
    var cats = [
        { type_id: 'movie_popular',    type_name: '热门电影' },
        { type_id: 'movie_top',        type_name: '高分电影' },
        { type_id: 'movie_nowplaying', type_name: '正在上映' },
        { type_id: 'movie_upcoming',   type_name: '即将上映' },
        { type_id: 'tv_popular',       type_name: '热门剧集' },
        { type_id: 'tv_top',           type_name: '高分剧集' },
        { type_id: 'tv_airing',        type_name: '正在播出' },
    ];
    return JSON.stringify({ class: cats, list: [] });
}

function _homeVod() {
    var d = getJson(tmdbUrl('/movie/popular'));
    var list = (d.results || []).slice(0, 12).map(formatMovie);
    return JSON.stringify({ list: list });
}

function _category(tid, pg, filter, extend) {
    pg = parseInt(pg) || 1;
    extend = extend || {};

    var genreParam = (extend.genre && extend.genre !== '') ? '&with_genres=' + extend.genre : '';
    var yearParam  = '';
    if (extend.year && extend.year !== '') {
        yearParam = '&primary_release_year=' + extend.year;
    }

    var url, formatter;
    if (tid === 'movie_popular')    { url = tmdbUrl('/movie/popular',     'page=' + pg + genreParam + yearParam); formatter = formatMovie; }
    else if (tid === 'movie_top')   { url = tmdbUrl('/movie/top_rated',   'page=' + pg + genreParam + yearParam); formatter = formatMovie; }
    else if (tid === 'movie_nowplaying') { url = tmdbUrl('/movie/now_playing', 'page=' + pg); formatter = formatMovie; }
    else if (tid === 'movie_upcoming')   { url = tmdbUrl('/movie/upcoming',    'page=' + pg); formatter = formatMovie; }
    else if (tid === 'tv_popular')  { url = tmdbUrl('/tv/popular',   'page=' + pg + genreParam); formatter = formatTv; }
    else if (tid === 'tv_top')      { url = tmdbUrl('/tv/top_rated', 'page=' + pg + genreParam); formatter = formatTv; }
    else if (tid === 'tv_airing')   { url = tmdbUrl('/tv/on_the_air','page=' + pg); formatter = formatTv; }
    else return JSON.stringify({ list: [], pagecount: 1, total: 0 });

    var d = getJson(url);
    return JSON.stringify({
        list:      (d.results || []).map(formatter),
        page:      pg,
        pagecount: d.total_pages || 1,
        total:     d.total_results || 0,
    });
}

function _detail(ids) {
    var id = Array.isArray(ids) ? ids[0] : String(ids);
    var parts = id.split(':');
    var mediaType = parts[0];
    var tmdbId    = parts[1];

    if (mediaType === 'movie') {
        var d = getJson(tmdbUrl('/movie/' + tmdbId, 'append_to_response=credits'));
        var directors = ((d.credits || {}).crew || [])
            .filter(function (c) { return c.job === 'Director'; })
            .map(function (c) { return c.name; }).slice(0, 3).join(' / ');
        var cast = ((d.credits || {}).cast || [])
            .slice(0, 5).map(function (c) { return c.name; }).join(' / ');
        return JSON.stringify({ list: [{
            vod_id:        id,
            vod_name:      d.title || '',
            vod_pic:       d.poster_path ? TMDB_IMG + d.poster_path : '',
            vod_year:      (d.release_date || '').slice(0, 4),
            vod_remarks:   d.vote_average ? d.vote_average.toFixed(1) + '分' : '',
            vod_director:  directors,
            vod_actor:     cast,
            vod_content:   d.overview || '',
            type_name:     (d.genres || []).map(function (g) { return g.name; }).join(' '),
            vod_play_from: 'VidSrc',
            vod_play_url:  (d.title || id) + '$movie:' + tmdbId,
        }]});
    } else {
        var tv = getJson(tmdbUrl('/tv/' + tmdbId, 'append_to_response=credits'));
        var seasons = tv.seasons || [];
        var playUrls = [];
        var playFroms = [];
        for (var si = 0; si < seasons.length; si++) {
            var s = seasons[si];
            if (s.season_number === 0) continue;
            var eps = [];
            for (var ep = 1; ep <= (s.episode_count || 0); ep++) {
                eps.push('第' + ep + '集$tv:' + tmdbId + ':' + s.season_number + ':' + ep);
            }
            if (eps.length) {
                playFroms.push('第' + s.season_number + '季');
                playUrls.push(eps.join('#'));
            }
        }
        return JSON.stringify({ list: [{
            vod_id:        id,
            vod_name:      tv.name || '',
            vod_pic:       tv.poster_path ? TMDB_IMG + tv.poster_path : '',
            vod_year:      (tv.first_air_date || '').slice(0, 4),
            vod_remarks:   tv.vote_average ? tv.vote_average.toFixed(1) + '分' : '',
            vod_content:   tv.overview || '',
            type_name:     (tv.genres || []).map(function (g) { return g.name; }).join(' '),
            vod_play_from: playFroms.join('$$$'),
            vod_play_url:  playUrls.join('$$$'),
        }]});
    }
}

function _search(key, quick, pg) {
    if (!key) return JSON.stringify({ list: [] });
    var d = getJson(tmdbUrl('/search/multi', 'query=' + encodeURIComponent(key) + '&page=' + (parseInt(pg) || 1)));
    var list = (d.results || [])
        .filter(function (item) { return item.media_type === 'movie' || item.media_type === 'tv'; })
        .map(function (item) { return item.media_type === 'movie' ? formatMovie(item) : formatTv(item); });
    return JSON.stringify({ list: list });
}

function _play(flag, id, vipFlags) {
    // id 格式：movie:278 / tv:1396:1:2
    var parts     = String(id).split(':');
    var mediaType = parts[0];
    var tmdbId    = parts[1];
    var season    = parts[2] ? parseInt(parts[2]) : 0;
    var episode   = parts[3] ? parseInt(parts[3]) : 0;

    var playUrl = getPlayUrl(mediaType, tmdbId, season, episode);
    if (!playUrl) return JSON.stringify({ parse: 0, url: '' });

    var result = {
        parse:  0,
        url:    playUrl,
        header: { 'User-Agent': UA, 'Referer': CNESTRA + '/' },
    };

    // 字幕：OpenSubtitles（需配置 osub_key / osub_user / osub_pass）
    if (OSUB_KEY && OSUB_USER && OSUB_PASS) {
        var imdbId = getImdbId(mediaType, tmdbId);
        if (imdbId) {
            var subsArr = getSubsOsub(imdbId, mediaType);
            if (subsArr.length > 0) result.subs = subsArr;
        }
    }

    return JSON.stringify(result);
}

// ── ES Module 导出（FongMi QuickJS 必须）──────────────────────
export default {
    init:     _init,
    home:     _home,
    homeVod:  _homeVod,
    category: _category,
    detail:   _detail,
    search:   _search,
    play:     _play,
};
