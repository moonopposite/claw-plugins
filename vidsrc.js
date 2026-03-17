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
 *   字幕       → yifysubtitles.ch (电影, zip)
 */

var TMDB_KEY  = '8265bd1679663a7ea12ac168da84d2e8';
var TMDB_BASE = 'https://api.themoviedb.org/3';
var TMDB_IMG  = 'https://image.tmdb.org/t/p/w500';
var VIDSRC    = 'https://vidsrc.net';
var CNESTRA   = 'https://cloudnestra.com';
var YIFY      = 'https://yifysubtitles.ch';
var UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120';

var CDN_DOMAINS = ['neonhorizonworkshops.com', 'orchidpixelgardens.com', 'cloudnestra.com'];
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

function getJson(url) {
    var text = get(url);
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

// ── 字幕（电影，yifysubtitles） ────────────────────────────────

function getImdbId(mediaType, tmdbId) {
    var d = getJson(tmdbUrl('/' + mediaType + '/' + tmdbId + '/external_ids'));
    return d.imdb_id || '';
}

// 从 yify 列表页提取某语言的第一条字幕 zip URL
// langKeywords: 匹配 tr 行的关键字数组（如 ['Chinese', 'flag-cn']）
function yifyFindSubZip(rows, langKeywords) {
    var subPath = '';
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var matched = false;
        for (var k = 0; k < langKeywords.length; k++) {
            if (row.indexOf(langKeywords[k]) >= 0) { matched = true; break; }
        }
        if (matched) {
            var lm = row.match(/href="(\/subtitles\/[^"]+)"/);
            if (lm) { subPath = lm[1]; break; }
        }
    }
    if (!subPath) return '';
    var detail = get(YIFY + subPath, YIFY + '/');
    var dm = detail && detail.match(/href="(\/subtitle\/[^"]+\.zip)"/);
    return dm ? YIFY + dm[1] : '';
}

// 返回 subs 数组：中文 + 英文（有则加，无则跳过）
function getSubsArray(imdbId) {
    var html = get(YIFY + '/movie-imdb/' + imdbId, YIFY + '/');
    if (!html) return [];
    var rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];

    var subs = [];

    // 中文字幕
    var zhUrl = yifyFindSubZip(rows, ['Chinese', 'flag-cn']);
    if (zhUrl) {
        subs.push({ name: '中文', url: zhUrl, lang: 'zh', format: 'zip' });
    }

    // 英文字幕
    var enUrl = yifyFindSubZip(rows, ['English', 'flag-en']);
    if (enUrl) {
        subs.push({ name: 'English', url: enUrl, lang: 'en', format: 'zip' });
    }

    return subs;
}

// ── Spider 接口 ────────────────────────────────────────────────

function _init(cfg) {}

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

    // 字幕（仅电影，中文 + 英文可选）
    if (mediaType === 'movie') {
        var imdbId = getImdbId('movie', tmdbId);
        if (imdbId) {
            var subsArr = getSubsArray(imdbId);
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
