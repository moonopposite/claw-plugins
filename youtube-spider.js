/**
 * OK影视 / FongMi TV — YouTube Spider
 * 版本：1.0.0
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
var YT_KEY = 'AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8';

var CLIENT_SEARCH = {
    clientName:    'WEB',
    clientVersion: '2.20240726.00.00',
    hl: 'zh-TW',
    gl: 'HK',
};

var CLIENT_PLAYER = {
    clientName:        'ANDROID_VR',
    clientVersion:     '1.65.10',
    androidSdkVersion: 30,
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
    'X-YouTube-Client-Version': CLIENT_PLAYER.clientVersion,
    'User-Agent':               'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 10; eureka-user Build/OPR1.170623.032) gzip',
    'Accept-Language':          'en-US,en;q=0.9',
};

// 分类配置（categoryContent 中的搜索关键词）
var CATEGORIES = {
    'search_cn':   { name: '中文热门',     query: '中文 热门视频 2024' },
    'search_music':{ name: '华语音乐',     query: '华语流行 歌曲 2024 非官方' },
    'search_en':   { name: '英文热门',     query: 'popular videos 2024' },
    'search_game': { name: '游戏',         query: 'gaming highlights 2024' },
    'search_tech': { name: '科技',         query: 'tech review 2024' },
    'search_learn':{ name: '学习',         query: '知识 教育 科普 中文' },
};

// ── 工具函数 ──────────────────────────────────────────────────

function ytPost(path, body, hdrs) {
    var url = 'https://www.youtube.com/youtubei/v1/' + path + '?key=' + YT_KEY;
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
        // 选最高分辨率缩略图
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
    if (v.durationStr) remarks += '  ' + v.durationStr;
    if (v.viewCount) remarks += '  ' + v.viewCount;
    return {
        vod_id:       v.videoId,
        vod_name:     v.title,
        vod_pic:      v.thumb,
        vod_remarks:  remarks,
        vod_year:     v.channel,
        vod_duration: parseSeconds(v.durationStr),
    };
}

// 提取 continuation token（用于翻页）
function extractContinuation(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length; i++) {
            var r = extractContinuation(obj[i]);
            if (r) return r;
        }
        return null;
    }
    if (obj.continuationItemRenderer && obj.continuationItemRenderer.continuationEndpoint) {
        var token = obj.continuationItemRenderer.continuationEndpoint.continuationCommand && obj.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        if (token) return token;
    }
    var keys = Object.keys(obj);
    for (var j = 0; j < keys.length; j++) {
        var res = extractContinuation(obj[keys[j]]);
        if (res) return res;
    }
    return null;
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

    var query = cat.query;
    var pgInt = parseInt(pg) || 1;

    var data = ytPost('search', {
        query:   query,
        context: { client: CLIENT_SEARCH },
        params:  'CAASAhAB', // 仅视频
    }, HEADERS_SEARCH);

    if (!data) return JSON.stringify({ list: [], pagecount: 1 });

    var videos = [];
    extractVideos(data.contents, videos);

    // 尝试拿 continuation token（备用，此版本不实现翻页以保持简单）
    // var nextToken = extractContinuation(data.contents);

    return JSON.stringify({
        page:      pgInt,
        pagecount: 1,
        list:      videos.map(videoToVod),
    });
}

function detailContent(ids) {
    var videoId = Array.isArray(ids) ? ids[0] : String(ids);

    // 用 next API 拿视频详情
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

    var vod = {
        vod_id:        videoId,
        vod_name:      title,
        vod_pic:       thumb,
        vod_content:   desc,
        vod_year:      channel,
        // 播放列表：格式为 "集名$视频ID"
        vod_play_from: 'YouTube',
        vod_play_url:  title + '$' + videoId,
    };

    return JSON.stringify({ list: [vod] });
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

// ── 播放解析（核心）─────────────────────────────────────────
function playerContent(flag, id, vipFlags) {
    // id = videoId（来自 vod_play_url 中 $ 后面的部分）
    var videoId = id;

    var data = ytPost('player', {
        videoId: videoId,
        context: { client: CLIENT_PLAYER },
        playbackContext: {
            contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' }
        },
        racyCheckOk:    true,
        contentCheckOk: true,
    }, HEADERS_PLAYER);

    if (!data) return JSON.stringify({ parse: 0, url: '' });

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
                header: { 'User-Agent': HEADERS_PLAYER['User-Agent'] },
            });
        }
    }

    // 回退：adaptive video mp4（可能无音频，取决于播放器）
    adaptive.sort(function(a, b) { return (b.width || 0) - (a.width || 0); });
    for (var j = 0; j < adaptive.length; j++) {
        var af = adaptive[j];
        if (af.url && af.mimeType && af.mimeType.indexOf('video/mp4') >= 0
            && af.mimeType.indexOf('video/') >= 0) {
            return JSON.stringify({
                parse:  0,
                url:    af.url,
                header: { 'User-Agent': HEADERS_PLAYER['User-Agent'] },
            });
        }
    }

    return JSON.stringify({ parse: 0, url: '' });
}
