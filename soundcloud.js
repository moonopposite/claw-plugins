/**
 * MusicFree 插件：SoundCloud
 * 版本：1.2.0
 *
 * 功能：搜索（含分页）、播放链接获取
 * 歌词：由独立的 LrcLib 插件提供（在 MusicFree 插件管理里同时安装）
 *
 * 技术说明：
 *  - client_id：动态从 SoundCloud 首页的 JS 文件中提取，缓存 6 小时
 *  - search：调用 api-v2.soundcloud.com/search/tracks
 *  - getMediaSource：
 *      1. 调用 api-v2.soundcloud.com/tracks/{id} 获取 transcodings
 *      2. 优先选 progressive（直接 MP3 链接），其次 hls
 *      3. 再请求一次 transcoding.url 拿到最终直链
 */

const axios = require('axios');

const SC_BASE    = 'https://soundcloud.com';
const SC_API     = 'https://api-v2.soundcloud.com';
const SC_MOBILE  = 'https://m.soundcloud.com';

// ── client_id 缓存 ─────────────────────────────────────────────

let _clientIdCache = null;  // { id, ts }

/**
 * 从 SoundCloud 首页提取 client_id。
 * 流程：
 *   1. GET soundcloud.com 首页 HTML
 *   2. 找到所有 <script src="..."> 的外链 JS（特征：路径含版本哈希）
 *   3. 逐个下载，用正则匹配 client_id
 */
async function getClientId() {
    // 缓存 6 小时
    if (_clientIdCache && (Date.now() - _clientIdCache.ts) < 6 * 60 * 60 * 1000) {
        return _clientIdCache.id;
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    // 步骤1：获取首页 HTML
    const homeRes = await axios.get(SC_BASE, { headers, timeout: 15000 });
    const html = homeRes.data;

    // 步骤2：提取所有 JS 脚本 URL（SoundCloud 的 app chunk 格式如 /assets/app-xxx.js）
    const scriptRe = /<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g;
    const scriptUrls = [];
    let m;
    while ((m = scriptRe.exec(html)) !== null) {
        scriptUrls.push(m[1]);
    }

    // 如果上面没找到，尝试另一种 CDN 路径格式
    if (scriptUrls.length === 0) {
        const re2 = /src="(https:\/\/[^"]*sndcdn\.com[^"]+\.js)"/g;
        while ((m = re2.exec(html)) !== null) {
            scriptUrls.push(m[1]);
        }
    }

    // 步骤3：逐个下载 JS，找 client_id
    // 通常在靠后的 chunk 里，倒序搜索更快
    const clientIdRe = /client_id\s*:\s*"([a-zA-Z0-9]{20,40})"/;
    const clientIdRe2 = /,client_id="([a-zA-Z0-9]{20,40})"/;
    const clientIdRe3 = /"client_id","([a-zA-Z0-9]{20,40})"/;

    for (const url of scriptUrls.reverse()) {
        try {
            const jsRes = await axios.get(url, { headers, timeout: 10000, responseType: 'text' });
            const js = jsRes.data;
            const match = js.match(clientIdRe) || js.match(clientIdRe2) || js.match(clientIdRe3);
            if (match) {
                const id = match[1];
                _clientIdCache = { id, ts: Date.now() };
                return id;
            }
        } catch (_) {
            // 某个 JS 文件下载失败，继续尝试下一个
        }
    }

    throw new Error('无法从 SoundCloud 页面提取 client_id');
}

// ── 数据格式化 ─────────────────────────────────────────────────

function formatTrack(t) {
    // 封面：SoundCloud 提供多尺寸，large(100x100) → t500x500(500x500)
    const artwork = (t.artwork_url || t.user?.avatar_url || '')
        .replace('-large', '-t500x500');

    return {
        id:       String(t.id),
        platform: 'SoundCloud',
        title:    t.title || '',
        artist:   t.user?.username || '',
        album:    '',
        artwork,
        duration: t.duration ? Math.floor(t.duration / 1000) : undefined,
        // 保存 permalink_url 供 getMediaSource 使用
        $permalinkUrl: t.permalink_url || '',
    };
}

// ── 搜索 ──────────────────────────────────────────────────────

let _lastQuery  = null;
let _nextHref   = null;

async function search(query, page, type) {
    if (type !== 'music') return { isEnd: true, data: [] };

    const clientId = await getClientId();

    if (query !== _lastQuery || page === 1) {
        _nextHref  = null;
        _lastQuery = query;
    }

    let url;
    if (_nextHref && page > 1) {
        // SoundCloud 分页直接用 next_href，但要补上 client_id
        url = _nextHref.includes('client_id') ? _nextHref : `${_nextHref}&client_id=${clientId}`;
    } else {
        url = `${SC_API}/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=20&linked_partitioning=1`;
    }

    const res = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json',
            'Origin': SC_BASE,
            'Referer': `${SC_BASE}/search?q=${encodeURIComponent(query)}`,
        },
        timeout: 12000,
    });

    const data = res.data;
    _nextHref = data.next_href || null;

    const tracks = (data.collection || [])
        .filter(t => t.streamable || t.policy !== 'BLOCK')
        .map(formatTrack);

    return {
        isEnd: !_nextHref,
        data:  tracks,
    };
}

// ── 获取播放链接 ──────────────────────────────────────────────

const _mediaCache = new Map();

async function getMediaSource(musicItem) {
    const { id: trackId } = musicItem;

    if (_mediaCache.has(trackId)) return _mediaCache.get(trackId);

    const clientId = await getClientId();

    // 获取曲目完整信息（含 transcodings）
    const infoRes = await axios.get(`${SC_API}/tracks/${trackId}?client_id=${clientId}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json',
            'Origin': SC_BASE,
        },
        timeout: 12000,
    });

    const transcodings = infoRes.data?.media?.transcodings || [];
    if (transcodings.length === 0) {
        throw new Error('无可用音频流（transcodings 为空）');
    }

    // 过滤掉加密流（ctr-encrypted-hls / cbc-encrypted-hls），只保留标准流
    const available = transcodings.filter(
        t => t.url && (t.format?.protocol === 'progressive' || t.format?.protocol === 'hls')
    );
    if (available.length === 0) {
        throw new Error('无可用标准音频流（仅有加密格式，无法播放）');
    }
    // 优先 progressive（MP3 直链），其次 hls/audio/mpeg，最后其他 hls
    const progressive = available.find(t => t.format?.protocol === 'progressive');
    const hlsMp3      = available.find(t => t.format?.protocol === 'hls' && t.format?.mime_type?.includes('mpeg'));
    const chosen      = progressive || hlsMp3 || available[0];

    // 请求 transcoding URL 拿到最终直链
    const streamRes = await axios.get(`${chosen.url}?client_id=${clientId}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json',
            'Origin': SC_BASE,
        },
        timeout: 10000,
    });

    const finalUrl = streamRes.data?.url;
    if (!finalUrl) throw new Error('无法获取最终播放链接');

    const result = { url: finalUrl };
    _mediaCache.set(trackId, result);
    return result;
}

// ── 插件元数据 ────────────────────────────────────────────────

module.exports = {
    platform:            'SoundCloud',
    version:             '1.2.0',
    author:              '猫头猫',
    description:         'SoundCloud 音乐搜索与播放。支持分页搜索，优先 MP3 直链播放。歌词请同时安装 LrcLib 插件。',
    cacheControl:        'no-cache',
    supportedSearchType: ['music'],

    search,
    getMediaSource,
};
