/**
 * OK影视 / FongMi TV — YouTube Spider  v2.2.0
 *
 * 格式：ES Module（export default）
 * 运行环境：FongMi/TV 内置 QuickJS（com.fongmi.quickjs）
 *
 * 工作原理：
 *   FongMi/TV 加载 JS spider 时，用 spider.js 包装器执行：
 *     import * as spider from '<url>'
 *     globalThis.__JS_SPIDER__ = spider.default
 *   然后调用 __JS_SPIDER__.home() / .category() / .detail() / .search() / .play()
 *
 * 播放：ANDROID_VR 客户端（Oculus Quest 3）无 poToken，直接返回直链
 * 搜索：WEB 客户端（gl=HK）
 */

// ── 常量 ──────────────────────────────────────────────────────
var YT_BASE   = 'https://www.youtube.com';
var YT_API    = YT_BASE + '/youtubei/v1';

var AVR_VERSION = '1.65.10';
var AVR_UA      = 'com.google.android.apps.youtube.vr.oculus/' + AVR_VERSION
    + ' (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';

var CLIENT_SEARCH = {
    clientName:    'WEB',
    clientVersion: '2.20240726.00.00',
    hl: 'zh-TW',
    gl: 'HK',
};

var CLIENT_PLAYER = {
    clientName:        'ANDROID_VR',
    clientVersion:     AVR_VERSION,
    androidSdkVersion: 32,
    deviceMake:        'Oculus',
    deviceModel:       'Quest 3',
    osName:            'Android',
    osVersion:         '12L',
    hl: 'en',
    gl: 'US',
};

var HEADERS_SEARCH = {
    'Content-Type':             'application/json',
    'X-YouTube-Client-Name':    '1',
    'X-YouTube-Client-Version': CLIENT_SEARCH.clientVersion,
    'User-Agent':               'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language':          'zh-TW,zh;q=0.9,en;q=0.8',
};

var HEADERS_PLAYER = {
    'Content-Type':             'application/json',
    'X-YouTube-Client-Name':    '28',
    'X-YouTube-Client-Version': AVR_VERSION,
    'User-Agent':               AVR_UA,
    'Accept':                   'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':          'en-us,en;q=0.5',
    'Origin':                   YT_BASE,
};

// 分类配置
var CATEGORIES = {
    'cat_politics': {
        name:  '政治与文化',
        query: '政治 时事 文化 评论 自媒体 2025',
    },
    'cat_economy': {
        name:  '经济与投资',
        query: '经济 投资 财经 股市 理财 自媒体 2025',
    },
    'cat_ai': {
        name:  '科技 AI',
        query: 'AI 人工智能 大模型 ChatGPT 科技 2025',
    },
    'cat_crypto': {
        name:  'Crypto 加密',
        query: 'crypto bitcoin 加密货币 比特币 2025',
    },
    'cat_film': {
        name:  '影视综艺',
        query: '影视 剧情 综艺 解说 电影 2025',
    },
};

// 访客信息缓存
var _visitorCache = null;
var _visitorCacheTs = 0;

// ── 工具函数 ──────────────────────────────────────────────────

function getVisitorInfoSync() {
    var now = Date.now ? Date.now() : new Date().getTime();
    if (_visitorCache && (now - _visitorCacheTs) < 20 * 60 * 1000) {
        return _visitorCache;
    }
    var res = req(YT_BASE, {
        method: 'GET',
        headers: {
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-us,en;q=0.5',
        },
    });
    var html = (res && res.content) ? res.content : '';
    var visitorId = '';
    var vidM = html.match(/"visitorData"\s*:\s*"([^"]+)"/);
    if (vidM) visitorId = vidM[1];
    var sts = 20522;
    var stsM = html.match(/"STS"\s*:\s*(\d+)/);
    if (stsM) sts = parseInt(stsM[1]);
    _visitorCache = { visitorId: visitorId, sts: sts };
    _visitorCacheTs = now;
    return _visitorCache;
}

function ytPost(path, body, hdrs) {
    var url = YT_API + '/' + path + '?prettyPrint=false';
    var res = req(url, {
        method:  'POST',
        headers: hdrs,
        body:    JSON.stringify(body),
    });
    if (!res || res.code < 200 || res.code >= 300) return null;
    try { return JSON.parse(res.content); } catch (e) { return null; }
}

function extractVideos(obj, results) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length; i++) extractVideos(obj[i], results);
        return;
    }
    if (obj.videoRenderer && obj.videoRenderer.videoId) {
        var vr = obj.videoRenderer;
        var title = '';
        if (vr.title && vr.title.runs && vr.title.runs[0]) title = vr.title.runs[0].text;
        else if (vr.title && vr.title.simpleText) title = vr.title.simpleText;
        var channel = '';
        if (vr.ownerText && vr.ownerText.runs && vr.ownerText.runs[0]) channel = vr.ownerText.runs[0].text;
        else if (vr.shortBylineText && vr.shortBylineText.runs && vr.shortBylineText.runs[0]) channel = vr.shortBylineText.runs[0].text;
        var durationStr = '';
        if (vr.lengthText) {
            durationStr = vr.lengthText.simpleText || '';
            if (!durationStr && vr.lengthText.runs && vr.lengthText.runs[0]) durationStr = vr.lengthText.runs[0].text;
        }
        var viewCount = '';
        if (vr.viewCountText) {
            viewCount = vr.viewCountText.simpleText || '';
            if (!viewCount && vr.viewCountText.runs && vr.viewCountText.runs[0]) viewCount = vr.viewCountText.runs[0].text;
        }
        var thumb = 'https://i.ytimg.com/vi/' + vr.videoId + '/hqdefault.jpg';
        var thumbs = (vr.thumbnail && vr.thumbnail.thumbnails) ? vr.thumbnail.thumbnails : [];
        if (thumbs.length > 0) {
            thumbs.sort(function(a, b) { return (b.width || 0) - (a.width || 0); });
            if (thumbs[0].url) thumb = thumbs[0].url;
        }
        results.push({
            videoId:     vr.videoId,
            title:       title,
            channel:     channel,
            durationStr: durationStr,
            viewCount:   viewCount,
            thumb:       thumb,
        });
        return;
    }
    var keys = Object.keys(obj);
    for (var j = 0; j < keys.length; j++) extractVideos(obj[keys[j]], results);
}

function parseSeconds(str) {
    if (!str) return 0;
    var parts = str.split(':');
    var s = 0;
    for (var i = 0; i < parts.length; i++) s = s * 60 + (parseInt(parts[i]) || 0);
    return s;
}

function videoToVod(v) {
    var remarks = v.channel || '';
    if (v.durationStr) remarks += (remarks ? '  ' : '') + v.durationStr;
    if (v.viewCount)   remarks += (remarks ? '  ' : '') + v.viewCount;
    return {
        vod_id:       v.videoId,
        vod_name:     v.title,
        vod_pic:      v.thumb,
        vod_remarks:  remarks,
        vod_year:     v.channel,
        vod_duration: parseSeconds(v.durationStr),
    };
}

// ── Spider 接口实现 ────────────────────────────────────────────

function _init(cfg) {
    // 无需特殊初始化
}

function _home(filter) {
    var classList = [];
    var keys = Object.keys(CATEGORIES);
    for (var i = 0; i < keys.length; i++) {
        classList.push({ type_id: keys[i], type_name: CATEGORIES[keys[i]].name });
    }
    return JSON.stringify({ class: classList, list: [] });
}

function _homeVod() {
    return JSON.stringify({ list: [] });
}

function _category(tid, pg, filter, extend) {
    var cat = CATEGORIES[tid];
    if (!cat) return JSON.stringify({ list: [], pagecount: 0 });

    var data = ytPost('search', {
        query:   cat.query,
        context: { client: CLIENT_SEARCH },
        params:  'CAASAhAB',
    }, HEADERS_SEARCH);

    if (!data) return JSON.stringify({ list: [], pagecount: 1 });

    var videos = [];
    extractVideos(data.contents, videos);
    return JSON.stringify({
        page:      parseInt(pg) || 1,
        pagecount: 1,
        list:      videos.map(videoToVod),
    });
}

function _detail(ids) {
    var videoId = Array.isArray(ids) ? ids[0] : String(ids);

    var data = ytPost('next', {
        videoId: videoId,
        context: { client: CLIENT_SEARCH },
    }, HEADERS_SEARCH);

    var title   = videoId;
    var desc    = '';
    var channel = '';
    var thumb   = 'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg';

    if (data) {
        try {
            var results = data.contents &&
                data.contents.twoColumnWatchNextResults &&
                data.contents.twoColumnWatchNextResults.results &&
                data.contents.twoColumnWatchNextResults.results.results &&
                data.contents.twoColumnWatchNextResults.results.results.contents;
            results = results || [];
            for (var i = 0; i < results.length; i++) {
                var pc = results[i].videoPrimaryInfoRenderer;
                if (pc) {
                    var titleRuns = pc.title && pc.title.runs;
                    if (titleRuns && titleRuns[0]) title = titleRuns[0].text;
                    break;
                }
            }
            for (var j = 0; j < results.length; j++) {
                var sc = results[j].videoSecondaryInfoRenderer;
                if (sc) {
                    var owner = sc.owner && sc.owner.videoOwnerRenderer;
                    var ownerRuns = owner && owner.title && owner.title.runs;
                    if (ownerRuns && ownerRuns[0]) channel = ownerRuns[0].text;
                    var descRuns = sc.description && sc.description.runs;
                    if (descRuns) {
                        var parts = [];
                        for (var k = 0; k < descRuns.length; k++) parts.push(descRuns[k].text || '');
                        desc = parts.join('').slice(0, 300);
                    }
                    break;
                }
            }
        } catch (e) {}
    }

    return JSON.stringify({
        list: [{
            vod_id:        videoId,
            vod_name:      title,
            vod_pic:       thumb,
            vod_content:   desc,
            vod_year:      channel,
            vod_play_from: 'YouTube',
            vod_play_url:  title + '$' + videoId,
        }],
    });
}

function _search(key, quick, pg) {
    if (!key) return JSON.stringify({ list: [] });
    var data = ytPost('search', {
        query:   key,
        context: { client: CLIENT_SEARCH },
        params:  'CAASAhAB',
    }, HEADERS_SEARCH);
    if (!data) return JSON.stringify({ list: [] });
    var videos = [];
    extractVideos(data.contents, videos);
    return JSON.stringify({ list: videos.map(videoToVod) });
}

function _play(flag, id, vipFlags) {
    var videoId = id;

    var visitor = getVisitorInfoSync();

    var hdrs = {
        'Content-Type':             'application/json',
        'X-YouTube-Client-Name':    '28',
        'X-YouTube-Client-Version': AVR_VERSION,
        'User-Agent':               AVR_UA,
        'Accept':                   'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language':          'en-us,en;q=0.5',
        'Origin':                   YT_BASE,
    };
    if (visitor.visitorId) hdrs['X-Goog-Visitor-Id'] = visitor.visitorId;

    var res = req(YT_API + '/player?prettyPrint=false', {
        method:  'POST',
        headers: hdrs,
        body:    JSON.stringify({
            videoId: videoId,
            context: { client: CLIENT_PLAYER },
            playbackContext: {
                contentPlaybackContext: {
                    html5Preference:    'HTML5_PREF_WANTS',
                    signatureTimestamp: visitor.sts,
                },
            },
            contentCheckOk: true,
            racyCheckOk:    true,
        }),
    });

    if (!res || res.code < 200 || res.code >= 300) {
        return JSON.stringify({ parse: 0, url: '' });
    }

    var data;
    try { data = JSON.parse(res.content); } catch (e) {
        return JSON.stringify({ parse: 0, url: '' });
    }

    var status = data.playabilityStatus && data.playabilityStatus.status;
    if (status !== 'OK') {
        return JSON.stringify({ parse: 0, url: '' });
    }

    var streamingData = data.streamingData || {};
    var formats       = streamingData.formats || [];
    var adaptive      = streamingData.adaptiveFormats || [];

    formats.sort(function(a, b) { return (b.width || 0) - (a.width || 0); });
    for (var i = 0; i < formats.length; i++) {
        var f = formats[i];
        if (f.url && f.mimeType && f.mimeType.indexOf('video/mp4') >= 0) {
            return JSON.stringify({
                parse:  0,
                url:    f.url,
                header: { 'User-Agent': AVR_UA },
            });
        }
    }

    adaptive.sort(function(a, b) { return (b.width || 0) - (a.width || 0); });
    for (var j = 0; j < adaptive.length; j++) {
        var af = adaptive[j];
        if (af.url && af.mimeType && af.mimeType.indexOf('video/mp4') >= 0) {
            return JSON.stringify({
                parse:  0,
                url:    af.url,
                header: { 'User-Agent': AVR_UA },
            });
        }
    }

    return JSON.stringify({ parse: 0, url: '' });
}

// ── ES Module 导出（FongMi/TV QuickJS 必须）────────────────────
// spider.js 包装器会执行：
//   globalThis.__JS_SPIDER__ = spider.default
// 然后调用 __JS_SPIDER__.home() / .category() / .detail() / .search() / .play()
export default {
    init:     _init,
    home:     _home,
    homeVod:  _homeVod,
    category: _category,
    detail:   _detail,
    search:   _search,
    play:     _play,
};
