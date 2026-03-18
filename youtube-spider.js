/**
 * OK影视 / FongMi TV — YouTube Spider  v2.4.1
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

// 订阅频道列表（按用户指定顺序）
var SUBSCRIPTIONS = [
    { id: 'ch_wenzhaoofficial', name: '文昭談古論今',          channelId: 'UCtAIPjABiQD3qjlEl1T5VpA' },
    { id: 'ch_henren778',       name: '一个狠人',              channelId: 'UCJAPsTtcJJWGk8e-_CJL8TQ' },
    { id: 'ch_torontobigface',  name: '多伦多方脸',            channelId: 'UCzYYzigb1vXR0GQXXBja2kg' },
    { id: 'ch_chaijing2023',    name: '柴静',                  channelId: 'UCjuNibFJ21MiSNpu8LZyV4w' },
    { id: 'ch_aranshu0',        name: '阿冉',                  channelId: 'UCHm2gs42CdHzq_-jrvRQuMg' },
    { id: 'ch_weizhichao',      name: '魏知超啥书都读',         channelId: 'UCFTZu3WRjMYI7euMZ5R9BbA' },
    { id: 'ch_dashengmedia',    name: 'Dasheng Community',    channelId: 'UC7FLWk8SH7UJ2zmeLXbE2LA' },
    { id: 'ch_wentingting',     name: '我是文婷',              channelId: 'UC9tu25aEyuAusxJiZNjWS4w' },
    { id: 'ch_sunlao',          name: '政經孫老師',             channelId: 'UC1Lk6WO-eKuYc6GHYbKVY2g' },
    { id: 'ch_wenzhaostudio',   name: '文昭思緒飛揚',          channelId: 'UCTu_hTaVf3DJMpMIyOAq2Ew' },
    { id: 'ch_01coder30',       name: '01Coder',              channelId: 'UCAVDRj14A9W2Zix1Y5EUm7Q' },
    { id: 'ch_macro_alpha_cn',  name: '宏观阿尔法',            channelId: 'UC9oosAco7nIVZwuGhnC0FKg' },
    { id: 'ch_anzhengming',     name: '安争鸣',                channelId: 'UCBNpk9A7simOnmlcJPkxg5w' },
    { id: 'ch_hi5hi5',          name: '李肅Hi5',              channelId: 'UCvpX0E9dK-40zwYShv186oA' },
    { id: 'ch_bumingbai',       name: '不明白播客',             channelId: 'UCAf2O_wWu1YCS9YLUqnyqDA' },
    { id: 'ch_fangfeitime',     name: '方菲時間',              channelId: 'UCNcZAhkdRR0oZegCB9u7seQ' },
    { id: 'ch_zhenguandian',    name: '真觀點',                channelId: 'UCAwVpzgGI9sEu4O4ZlB5ZWQ' },
    { id: 'ch_libertas1984',    name: 'Cao Cao日常观察',       channelId: 'UCEHllJN5YYp6R-jB-6rbnQw' },
    { id: 'ch_stboss',          name: '自说自话的总裁',         channelId: 'UCgo_-fjJxnLwwwq5dSY72rg' },
    { id: 'ch_freeharbor2022',  name: 'Anthony看世界',         channelId: 'UCxN_H2tFQD-0B4d9wGdAVuA' },
    { id: 'ch_ndwtb',           name: '脑洞乌托邦',            channelId: 'UC2tQpW0dPiyWPebwBSksJ_g' },
    { id: 'ch_vexilla01',       name: 'VEXILLA潮時務所',       channelId: 'UCpC2D7JdcB8nlfzhX08i7fg' },
    { id: 'ch_liutalks',        name: '徒步的騎手',            channelId: 'UCETfu038u78m_aOzpZ8EIcQ' },
    { id: 'ch_cui_news',        name: '小翠時政財經',           channelId: 'UCOhck8oLoIwSJzmwYMXsSnQ' },
    { id: 'ch_fanxinaozhuanjia',name: '专反洗脑',              channelId: 'UCQlxjRwTqoAwi-R1OtHau5g' },
    { id: 'ch_thevalley101',    name: '硅谷101',               channelId: 'UCKV2yWPB3wn0RTZh3cTD8YA' },
    { id: 'ch_indigo11',        name: 'INDIGO数字镜像',        channelId: 'UCXnTA5wXW0aiDWdEllZI_pQ' },
    { id: 'ch_mrbrain',         name: '脑总MrBrain',           channelId: 'UC26hLZoe-haxcuLYxzWAiNg' },
];

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
        var published = (vr.publishedTimeText && vr.publishedTimeText.simpleText) || '';
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
            published:   published,
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
        vod_year:     v.published || '',  // 发布时间（如 "3 天前"）
        vod_duration: parseSeconds(v.durationStr),
    };
}

// ── Spider 接口实现 ────────────────────────────────────────────

function _init(cfg) {
    // 无需特殊初始化
}

function _home(filter) {
    var classList = [];

    // 第一项：订阅频道（聚合入口）
    classList.push({ type_id: 'cat_subscriptions', type_name: '📺 订阅频道' });

    // 剩余关键词分类
    var keys = Object.keys(CATEGORIES);
    for (var i = 0; i < keys.length; i++) {
        classList.push({ type_id: keys[i], type_name: CATEGORIES[keys[i]].name });
    }

    // 每个订阅频道也作为独立子分类（排在最后，方便按频道浏览）
    for (var j = 0; j < SUBSCRIPTIONS.length; j++) {
        var s = SUBSCRIPTIONS[j];
        classList.push({ type_id: s.id, type_name: '  └ ' + s.name });
    }

    return JSON.stringify({ class: classList, list: [] });
}

function _homeVod() {
    return JSON.stringify({ list: [] });
}

function _category(tid, pg, filter, extend) {

    // ── 情况1：订阅频道聚合页 ──────────────────────────────────
    // 策略：每次取前 N 个频道各拉一次最新视频，按时间混排
    // 为避免 QuickJS 同步请求超时，分批处理：每页取 6 个频道，共约 5 页
    if (tid === 'cat_subscriptions') {
        var page     = parseInt(pg) || 1;
        var batchSz  = 6;                              // 每页请求几个频道
        var start    = (page - 1) * batchSz;
        var end      = Math.min(start + batchSz, SUBSCRIPTIONS.length);
        var pagecount = Math.ceil(SUBSCRIPTIONS.length / batchSz);

        var latestList = [];
        for (var si = start; si < end; si++) {
            var sub = SUBSCRIPTIONS[si];
            var chVids = getChannelVideos(sub.channelId);
            // 取该频道最新 1 条加入列表
            var take = Math.min(1, chVids.length);
            for (var vi = 0; vi < take; vi++) {
                var entry = chVids[vi];
                var parts = entry.split('$');
                var vid   = parts[parts.length - 1];
                var label = parts.slice(0, parts.length - 1).join('$');
                latestList.push({
                    vod_id:      vid,
                    vod_name:    label,
                    vod_pic:     'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg',
                    vod_remarks: sub.name,
                    vod_year:    '',
                });
            }
        }
        return JSON.stringify({
            page:      page,
            pagecount: pagecount,
            list:      latestList,
        });
    }

    // ── 情况2：单个订阅频道（ch_ 开头）→ 频道视频列表 ──────────
    if (tid.indexOf('ch_') === 0) {
        var subInfo = null;
        for (var ci = 0; ci < SUBSCRIPTIONS.length; ci++) {
            if (SUBSCRIPTIONS[ci].id === tid) { subInfo = SUBSCRIPTIONS[ci]; break; }
        }
        if (!subInfo) return JSON.stringify({ list: [], pagecount: 0 });

        var chVideos = getChannelVideos(subInfo.channelId);
        var vodList = [];
        for (var vi = 0; vi < chVideos.length; vi++) {
            var ep = chVideos[vi];
            var epParts = ep.split('$');
            var videoId = epParts[epParts.length - 1];
            var epLabel = epParts.slice(0, epParts.length - 1).join('$');
            vodList.push({
                vod_id:      videoId,
                vod_name:    epLabel,
                vod_pic:     'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
                vod_remarks: subInfo.name,
                vod_year:    '',
            });
        }
        return JSON.stringify({
            page:      1,
            pagecount: 1,
            list:      vodList,
        });
    }

    // ── 情况3：关键词搜索分类 ──────────────────────────────────
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

// 从 browse API 抓频道最近 30 条视频
function getChannelVideos(channelId) {
    var data = ytPost('browse', {
        browseId: channelId,
        params:   'EgZ2aWRlb3PyBgQKAjoA',  // 频道 Videos 标签，按最新排序
        context:  { client: CLIENT_SEARCH },
    }, HEADERS_SEARCH);
    if (!data) return [];

    var results = [];
    function findVids(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            for (var i = 0; i < obj.length; i++) findVids(obj[i]);
            return;
        }
        // richItemRenderer（频道主页新版布局）
        var rvr = obj.richItemRenderer && obj.richItemRenderer.content && obj.richItemRenderer.content.videoRenderer;
        if (rvr && rvr.videoId) {
            var t = (rvr.title && rvr.title.runs && rvr.title.runs[0] && rvr.title.runs[0].text) || rvr.videoId;
            var pub = (rvr.publishedTimeText && rvr.publishedTimeText.simpleText) || '';
            var dur = (rvr.lengthText && rvr.lengthText.simpleText) || '';
            var ep = t + (pub ? '  ' + pub : '') + (dur ? '  ' + dur : '');
            results.push(ep + '$' + rvr.videoId);
            return;
        }
        // gridVideoRenderer（旧版布局）
        if (obj.gridVideoRenderer && obj.gridVideoRenderer.videoId) {
            var gvr = obj.gridVideoRenderer;
            var t2 = (gvr.title && (gvr.title.runs ? gvr.title.runs[0].text : gvr.title.simpleText)) || gvr.videoId;
            var pub2 = (gvr.publishedTimeText && gvr.publishedTimeText.simpleText) || '';
            var dur2 = (gvr.lengthText && gvr.lengthText.simpleText) || '';
            var ep2 = t2 + (pub2 ? '  ' + pub2 : '') + (dur2 ? '  ' + dur2 : '');
            results.push(ep2 + '$' + gvr.videoId);
            return;
        }
        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; j++) findVids(obj[keys[j]]);
    }
    findVids(data);
    return results.slice(0, 30);
}

function _detail(ids) {
    var videoId = Array.isArray(ids) ? ids[0] : String(ids);

    // ── 1. next API：拿标题、发布日期、频道名、channelId ──────────
    var data = ytPost('next', {
        videoId: videoId,
        context: { client: CLIENT_SEARCH },
    }, HEADERS_SEARCH);

    var title     = videoId;
    var desc      = '';
    var channel   = 'YouTube';   // 线路名 = 频道名
    var channelId = '';
    var pubDate   = '';          // 发布日期
    var thumb     = 'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg';

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
                    // 标题
                    var titleRuns = pc.title && pc.title.runs;
                    if (titleRuns && titleRuns[0]) title = titleRuns[0].text;
                    // 发布日期（dateText = "2026年3月16日"）
                    if (pc.dateText && pc.dateText.simpleText) pubDate = pc.dateText.simpleText;
                    break;
                }
            }
            for (var j = 0; j < results.length; j++) {
                var sc = results[j].videoSecondaryInfoRenderer;
                if (sc) {
                    var owner = sc.owner && sc.owner.videoOwnerRenderer;
                    // 频道名
                    var ownerRuns = owner && owner.title && owner.title.runs;
                    if (ownerRuns && ownerRuns[0]) channel = ownerRuns[0].text;
                    // channelId（用于查频道视频列表）
                    var browseEp = owner && owner.navigationEndpoint && owner.navigationEndpoint.browseEndpoint;
                    if (browseEp && browseEp.browseId) channelId = browseEp.browseId;
                    // 简介
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

    // ── 2. 当前视频条目 ───────────────────────────────────────────
    var currentEntry = title + '$' + videoId;

    // ── 3. browse API：频道最近视频列表作为选集 ────────────────────
    var playList = [currentEntry];   // 默认至少有当前视频
    if (channelId) {
        var chVideos = getChannelVideos(channelId);
        if (chVideos.length > 0) {
            // 如果频道列表里包含当前视频就直接用，否则把当前视频插到最前
            var found = false;
            for (var m = 0; m < chVideos.length; m++) {
                if (chVideos[m].indexOf('$' + videoId) >= 0) { found = true; break; }
            }
            playList = found ? chVideos : [currentEntry].concat(chVideos);
        }
    }

    return JSON.stringify({
        list: [{
            vod_id:        videoId,
            vod_name:      title,
            vod_pic:       thumb,
            vod_content:   desc,
            vod_year:      pubDate,           // 年份 → 发布日期
            vod_play_from: channel,           // 线路 → 频道名
            vod_play_url:  playList.join('#'), // 选集 → 频道视频列表
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

    // ── 优先策略1：从 adaptiveFormats 提取高分辨率视频 + 音频（音视频分离）──
    var videoTracks = [];
    var audioTracks = [];
    
    for (var idx = 0; idx < adaptive.length; idx++) {
        var af = adaptive[idx];
        if (!af.url || !af.mimeType) continue;
        
        // 视频轨道：video/mp4，有分辨率
        if (af.mimeType.indexOf('video/mp4') >= 0 && (af.width || 0) > 0 && (af.height || 0) > 0) {
            videoTracks.push(af);
        }
        
        // 音频轨道：audio/mp4
        if (af.mimeType.indexOf('audio/mp4') >= 0) {
            audioTracks.push(af);
        }
    }

    // 如果有视频轨道和音频轨道，进行音视频分离
    if (videoTracks.length > 0 && audioTracks.length > 0) {
        // 选择视频轨道：优先 1080p (1920x1080)，其次最高分辨率
        var selectedVideo = null;
        
        // 先找 1080p
        for (var v1 = 0; v1 < videoTracks.length; v1++) {
            if (videoTracks[v1].width === 1920 && videoTracks[v1].height === 1080) {
                selectedVideo = videoTracks[v1];
                break;
            }
        }
        
        // 如果没有 1080p，找最高分辨率
        if (!selectedVideo) {
            var maxRes = videoTracks[0];
            for (var v2 = 1; v2 < videoTracks.length; v2++) {
                var area1 = (maxRes.width || 0) * (maxRes.height || 0);
                var area2 = (videoTracks[v2].width || 0) * (videoTracks[v2].height || 0);
                if (area2 > area1) {
                    maxRes = videoTracks[v2];
                }
            }
            selectedVideo = maxRes;
        }
        
        // 选择音频轨道：按码率排序，选最高的
        var selectedAudio = audioTracks[0];
        for (var a1 = 1; a1 < audioTracks.length; a1++) {
            var bitrate1 = selectedAudio.bitrate || 0;
            var bitrate2 = audioTracks[a1].bitrate || 0;
            if (bitrate2 > bitrate1) {
                selectedAudio = audioTracks[a1];
            }
        }
        
        if (selectedVideo && selectedVideo.url && selectedAudio && selectedAudio.url) {
            var combinedUrl = selectedVideo.url + '|' + selectedAudio.url;
            return JSON.stringify({
                parse:  0,
                url:    combinedUrl,
                header: { 'User-Agent': AVR_UA },
            });
        }
    }

    // ── 备选策略2：如果没有音视频分离，尝试预合并的 formats ──
    if (formats && formats.length > 0) {
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
    }

    // ── 备选策略3：只有视频没有音频（不推荐，会没有声音）
    if (videoTracks.length > 0) {
        var selected = null;
        for (var v3 = 0; v3 < videoTracks.length; v3++) {
            if (videoTracks[v3].width === 1920 && videoTracks[v3].height === 1080) {
                selected = videoTracks[v3];
                break;
            }
        }
        if (!selected) {
            var maxRes2 = videoTracks[0];
            for (var v4 = 1; v4 < videoTracks.length; v4++) {
                if ((videoTracks[v4].width || 0) > (maxRes2.width || 0)) {
                    maxRes2 = videoTracks[v4];
                }
            }
            selected = maxRes2;
        }
        if (selected && selected.url) {
            return JSON.stringify({
                parse:  0,
                url:    selected.url,
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
