/**
 * OK影视 / FongMi TV — YouTube Spider
 * 版本：1.1.0
 *
 * 已验证（2026-03）：
 *   搜索  ：WEB 客户端（gl=HK）—— 可正常搜索中英文视频
 *   播放  ：ANDROID_VR 客户端（Oculus Quest 3）—— 无 poToken，直接返回直链
 *
 * 播放限制说明：
 *   - 一般视频（个人上传、非官方版权内容）：✅ 直接可播
 *   - 大版权方的官方 MV（索尼/华纳/环球）：❌ LOGIN_REQUIRED（bot 检测）
 *     → 这类视频在 YouTube 无法绕过，属于平台限制，与插件无关
 *     → 可搜索到这些视频，但点击会无法播放
 *
 * QuickJS 环境限制：
 *   - 只能使用同步 req() 函数，不能用 Promise/async/await
 *   - 不能使用 require/module.exports
 *   - req() 参数：{ url, method, header, body }，返回 { code, content }
 */

// ── 常量 ──────────────────────────────────────────────────────
var YT_BASE   = 'https://www.youtube.com';
var YT_API    = YT_BASE + '/youtubei/v1';

var AVR_VERSION = '1.65.10';
var AVR_UA      = 'com.google.android.apps.youtube.vr.oculus/' + AVR_VERSION + ' (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';

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

// 分类配置（categoryContent 中的搜索关键词）
var CATEGORIES = {
    'search_cn':   { name: '中文热门',  query: '中文 热门视频 2025' },
    'search_music':{ name: '华语音乐',  query: '华语流行 歌曲 2025 非官方' },
    'search_en':   { name: '英文热门',  query: 'popular videos 2025' },
    'search_game': { name: '游戏',      query: 'gaming highlights 2025' },
    'search_tech': { name: '科技',      query: 'tech review 2025' },
    'search_learn':{ name: '学习',      query: '知识 教育 科普 中文' },
};

// ── 访客信息缓存（每次 playerContent 调用时获取一次）──────────
var _visitorCache = null;
var _visitorCacheTs = 0;

/**
 * 同步访问 YouTube 首页，提取 visitorId、sts、Cookie
 * 缓存 20 分钟
 */
function getVisitorInfoSync() {
    var now = Date.now ? Date.now() : new Date().getTime();
    if (_visitorCache && (now - _visitorCacheTs) < 20 * 60 * 1000) {
        return _visitorCache;
    }

    var res = req({
        url:    YT_BASE,
        method: 'GET',
        header: {
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-us,en;q=0.5',
        },
    });

    var html = (res && res.content) ? res.content : '';

    // 提取 visitorId
    var visitorId = '';
    var vidM = html.match(/"visitorData"\s*:\s*"([^"]+)"/);
    if (vidM) visitorId = vidM[1];

    // 提取 sts (signatureTimestamp)
    var sts = 20522;
    var stsM = html.match(/"STS"\s*:\s*(\d+)/);
    if (stsM) sts = parseInt(stsM[1]);

    _visitorCache = { visitorId: visitorId, sts: sts };
    _visitorCacheTs = now;
    return _visitorCache;
}

// ── 工具函数 ──────────────────────────────────────────────────

function ytPost(path, body, hdrs) {
    var url = YT_API + '/' + path + '?prettyPrint=false';
    var res = req({
        url:    url,
        method: 'POST',
        header: hdrs,
        body:   JSON.stringify(body),
    });
    if (!res || res.code < 200 || res.code >= 300) return null;
    try { return JSON.parse(res.content); } catch (e) { return null; }
}

// 递归提取所有 videoRenderer
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

        var thumbs = (vr.thumbnail && vr.thumbnail.thumbnails) ? vr.thumbnail.thumbnails : [];
        var thumb = 'https://i.ytimg.com/vi/' + vr.videoId + '/hqdefault.jpg';
        if (thumbs.length > 0) {
            thumbs.sort(function(a, b) { return (b.width || 0) - (a.width || 0); });
            thumb = thumbs[0].url || thumb;
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

// 将 "MM:SS" 或 "HH:MM:SS" 转为秒数
function parseSeconds(str) {
    if (!str) return 0;
    var parts = str.split(':');
    var s = 0;
    for (var i = 0; i < parts.length; i++) s = s * 60 + (parseInt(parts[i]) || 0);
    return s;
}

// video 数据 → VOD item
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

// ── Spider 接口 ────────────────────────────────────────────────

function homeContent(filter) {
    var classList = [];
    var keys = Object.keys(CATEGORIES);
    for (var i = 0; i < keys.length; i++) {
        classList.push({ type_id: keys[i], type_name: CATEGORIES[keys[i]].name });
    }
    return JSON.stringify({ class: classList, list: [] });
}

function categoryContent(tid, pg, filter, extend) {
    var cat = CATEGORIES[tid];
    if (!cat) return JSON.stringify({ list: [], pagecount: 0 });

    var data = ytPost('search', {
        query:   cat.query,
        context: { client: CLIENT_SEARCH },
        params:  'CAASAhAB',  // 仅视频
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

function detailContent(ids) {
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

function searchContent(key, quick, pg) {
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

// ── 播放解析（核心）─────────────────────────────────────────────
/**
 * 关键：必须先访问 YouTube 首页获取 Cookie/visitorId/sts，
 * 才能用 ANDROID_VR 客户端拿到真实直链 URL（adaptiveFormats）。
 * signatureTimestamp (sts) 用于 playbackContext。
 */
function playerContent(flag, id, vipFlags) {
    var videoId = id;

    // 1. 获取访客信息（Cookie + visitorId + sts）
    var visitor = getVisitorInfoSync();

    // 2. 构建带访客信息的请求头
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

    // 3. 调用 player API（ANDROID_VR 客户端，无需 poToken）
    var res = req({
        url:    YT_API + '/player?prettyPrint=false',
        method: 'POST',
        header: hdrs,
        body:   JSON.stringify({
            videoId: videoId,
            context: { client: CLIENT_PLAYER },
            playbackContext: {
                contentPlaybackContext: {
                    html5Preference:     'HTML5_PREF_WANTS',
                    signatureTimestamp:  visitor.sts,
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
    try { data = JSON.parse(res.content); } catch (e) { return JSON.stringify({ parse: 0, url: '' }); }

    var status = data.playabilityStatus && data.playabilityStatus.status;
    if (status !== 'OK') {
        // LOGIN_REQUIRED 通常是官方版权 MV，无法绕过
        return JSON.stringify({ parse: 0, url: '' });
    }

    var streamingData = data.streamingData || {};
    var formats       = streamingData.formats || [];
    var adaptive      = streamingData.adaptiveFormats || [];

    // 优先：combined formats（音视频合流 mp4），按分辨率降序
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

    // 回退：adaptive video mp4（纯视频流，部分播放器支持）
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

// ── init（FongMi/TV 加载 spider 时调用一次）──────────────────
function init(context, extend) {
    // 无需初始化，保留空实现
}

// ── 短函数名别名（兼容 FongMi/TV 内置 QuickJS 调用规范）────────
// FongMi/TV 新版内置 QuickJS 在 type=3 无 JAR 时，
// 调用的是 home / category / detail / search / play
// 而 JAR 体系调用的是 homeContent / categoryContent 等
// 这里同时提供两套，两种环境都能正常工作

var home     = homeContent;
var category = categoryContent;
var detail   = detailContent;
var search   = searchContent;
var play     = playerContent;
