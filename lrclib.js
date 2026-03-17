/**
 * MusicFree 插件：LrcLib 歌词
 * 版本：1.0.0
 *
 * 功能：歌词搜索（supportedSearchType: ['lyric']）
 *
 * 数据来源：lrclib.net（免费，无需认证）
 *
 * 使用方式：
 *   在 MusicFree 的插件管理里安装本插件，然后在"搜索歌词"时
 *   就能通过本插件搜索带时间轴的 LRC 歌词。
 *
 * 搜索技巧（中文歌）：
 *   - 输入纯歌名，不要带括号里的补充说明，例如：
 *     "晴天" 而不是 "晴天 (周杰伦/Jay Chou)"
 *   - 可以加艺人名，例如："晴天 周杰伦"
 */

'use strict';

const axios = require('axios');

const BASE_URL   = 'https://lrclib.net';
const USER_AGENT = 'MusicFree-LrcLib-Plugin/1.0 (https://github.com)';

// ── 搜索歌词 ──────────────────────────────────────────────────
// MusicFree 会传入用户在搜索框里输入的关键字，类型为 'lyric'
// 返回格式：{ isEnd: boolean, data: LyricItem[] }
// LyricItem 必须包含：id, platform, title（歌名）, artist（艺人）
// 以及可选的 rawLrc（已知直接有歌词时直接放进去）

async function search(keyword, page, type) {
    if (type !== 'lyric') return { isEnd: true, data: [] };

    const q = (keyword || '').trim();
    if (!q) return { isEnd: true, data: [] };

    // lrclib 不分页，最多返回 20 条，直接标记第一页后没有更多
    if (page > 1) return { isEnd: true, data: [] };

    const r = await axios.get(`${BASE_URL}/api/search`, {
        params:  { q },
        headers: { 'User-Agent': USER_AGENT },
        timeout: 10000,
    });

    const results = r.data || [];

    const data = results
        .filter(item => !item.instrumental)   // 过滤纯音乐（无歌词）
        .map(item => ({
            id:       String(item.id),
            platform: 'LrcLib',
            title:    item.trackName  || '',
            artist:   item.artistName || '',
            album:    item.albumName  || '',
            duration: item.duration   || 0,
            // 直接把歌词也带上，getLyric 时就不用再请求一次
            rawLrc:   item.syncedLyrics || item.plainLyrics || '',
        }));

    return { isEnd: true, data };
}

// ── 获取歌词 ──────────────────────────────────────────────────
// 当 musicItem 已经有 rawLrc（来自 search 结果）就直接返回
// 否则用 id 再请求一次

async function getLyric(musicItem) {
    // 如果 search 时已经拿到歌词，直接复用
    if (musicItem.rawLrc) {
        return { rawLrc: musicItem.rawLrc };
    }

    const id = musicItem.id;
    if (!id) return { rawLrc: '' };

    try {
        const r = await axios.get(`${BASE_URL}/api/get/${id}`, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000,
        });
        const lrc = r.data?.syncedLyrics || r.data?.plainLyrics || '';
        return { rawLrc: lrc };
    } catch (e) {
        console.warn('[LrcLib getLyric] 获取歌词失败:', e?.message || e);
        return { rawLrc: '' };
    }
}

// ── 插件导出 ──────────────────────────────────────────────────
module.exports = {
    platform:            'LrcLib',
    version:             '1.0.0',
    author:              '猫头猫',
    description:         '通过 lrclib.net 搜索 LRC 同步歌词。免费无需账号，支持中英文歌曲。',
    cacheControl:        'no-cache',
    supportedSearchType: ['lyric'],

    search,
    getLyric,
};
