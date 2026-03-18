/**
 * 调试脚本：查看最终返回给 FongMi/TV 的 URL 格式
 */

const https = require('https');

const YT_BASE   = 'https://www.youtube.com';
const YT_API    = YT_BASE + '/youtubei/v1';

const AVR_VERSION = '1.65.10';
const AVR_UA      = 'com.google.android.apps.youtube.vr.oculus/' + AVR_VERSION
    + ' (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';

const CLIENT_PLAYER = {
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

const HEADERS_PLAYER = {
    'Content-Type':             'application/json',
    'X-YouTube-Client-Name':    '28',
    'X-YouTube-Client-Version': AVR_VERSION,
    'User-Agent':               AVR_UA,
    'Accept':                   'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':          'en-us,en;q=0.5',
    'Origin':                   YT_BASE,
};

function ytPost(path, body, hdrs) {
    return new Promise((resolve, reject) => {
        const url = YT_API + '/' + path + '?prettyPrint=false';
        const postData = JSON.stringify(body);

        const options = {
            hostname: 'www.youtube.com',
            path: `/youtubei/v1/${path}?prettyPrint=false`,
            method: 'POST',
            headers: {
                ...hdrs,
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function getVisitorInfo() {
    return new Promise((resolve, reject) => {
        https.get(YT_BASE, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        }, (res) => {
            let html = '';
            res.on('data', (chunk) => { html += chunk; });
            res.on('end', () => {
                const vidM = html.match(/"visitorData"\s*:\s*"([^"]+)"/);
                const stsM = html.match(/"STS"\s*:\s*(\d+)/);
                resolve({
                    visitorId: vidM ? vidM[1] : '',
                    sts: stsM ? parseInt(stsM[1]) : 20522,
                });
            });
        }).on('error', reject);
    });
}

async function debugPlayUrl(videoId) {
    try {
        console.log('🔍 正在获取 visitor info...');
        const visitor = await getVisitorInfo();

        console.log('\n🔍 正在调用 player API...');
        const data = await ytPost('player', {
            videoId: videoId,
            context: { client: CLIENT_PLAYER },
            playbackContext: {
                contentPlaybackContext: {
                    html5Preference: 'HTML5_PREF_WANTS',
                    signatureTimestamp: visitor.sts,
                },
            },
            contentCheckOk: true,
            racyCheckOk: true,
        }, HEADERS_PLAYER);

        if (!data) {
            console.log('❌ 无法获取数据');
            return;
        }

        const status = data.playabilityStatus && data.playabilityStatus.status;
        if (status !== 'OK') {
            console.log('❌ 播放状态不是 OK');
            return;
        }

        const streamingData = data.streamingData || {};
        const adaptive = streamingData.adaptiveFormats || [];

        // 找视频和音频
        var videoTracks = [];
        var audioTracks = [];
        
        for (var idx = 0; idx < adaptive.length; idx++) {
            var af = adaptive[idx];
            if (!af.url || !af.mimeType) continue;
            
            if (af.mimeType.indexOf('video/') === 0 && (af.width || 0) > 0 && (af.height || 0) > 0) {
                videoTracks.push(af);
            }
            else if (af.mimeType.indexOf('audio/') === 0) {
                audioTracks.push(af);
            }
        }

        // 找最好的视频
        var selectedVideo = null;
        for (var v1 = 0; v1 < videoTracks.length; v1++) {
            var vt1 = videoTracks[v1];
            if (vt1.width === 1920 && vt1.height === 1080 && vt1.mimeType.indexOf('video/mp4') >= 0) {
                selectedVideo = vt1;
                break;
            }
        }
        
        if (!selectedVideo) {
            var maxRes = null;
            for (var v2 = 0; v2 < videoTracks.length; v2++) {
                var vt2 = videoTracks[v2];
                if (vt2.mimeType.indexOf('video/mp4') >= 0) {
                    if (!maxRes || vt2.width > (maxRes.width || 0)) {
                        maxRes = vt2;
                    }
                }
            }
            selectedVideo = maxRes;
        }

        // 找最好的音频
        var selectedAudio = null;
        var maxAudioBitrate = 0;
        for (var a = 0; a < audioTracks.length; a++) {
            var at = audioTracks[a];
            if (at.mimeType.indexOf('audio/mp4') >= 0 && (at.bitrate || 0) > maxAudioBitrate) {
                selectedAudio = at;
                maxAudioBitrate = at.bitrate || 0;
            }
        }

        console.log('\n📊 === 选中的轨道 ===');
        if (selectedVideo) {
            console.log('视频:', selectedVideo.width + 'x' + selectedVideo.height, selectedVideo.mimeType);
            console.log('视频 URL 长度:', selectedVideo.url.length);
            console.log('视频 URL 开头:', selectedVideo.url.substring(0, 100));
        } else {
            console.log('❌ 没有找到视频轨道');
        }

        if (selectedAudio) {
            console.log('\n音频:', selectedAudio.mimeType);
            console.log('音频 URL 长度:', selectedAudio.url.length);
            console.log('音频 URL 开头:', selectedAudio.url.substring(0, 100));
        } else {
            console.log('\n❌ 没有找到音频轨道');
        }

        // 测试管道符URL
        if (selectedVideo && selectedAudio) {
            // 构造标准的 FongMi/TV 多轨道格式
            const finalResult = {
                parse: 0,
                url: {
                    values: [
                        {
                            n: selectedVideo.width + 'x' + selectedVideo.height + ' 视频',
                            v: selectedVideo.url
                        },
                        {
                            n: '音频',
                            v: selectedAudio.url
                        }
                    ],
                    position: 0
                },
                header: {
                    'User-Agent': AVR_UA,
                    'Range': 'bytes=0-',
                },
            };
            
            console.log('\n✅ === 最终返回给 FongMi/TV 的标准多轨道 JSON ===');
            const jsonStr = JSON.stringify(finalResult, null, 2);
            
            // 显示结构摘要
            console.log('\n📊 结构验证：');
            console.log('✓ parse: ' + finalResult.parse);
            console.log('✓ url.values.length: ' + finalResult.url.values.length + ' 个轨道');
            console.log('✓ url.position: ' + finalResult.url.position);
            
            console.log('\n📌 轨道详情：');
            finalResult.url.values.forEach((val, idx) => {
                console.log('  [' + idx + '] ' + val.n + ' => URL长度: ' + val.v.length + ' 字符');
                console.log('      开头: ' + val.v.substring(0, 80) + '...');
            });
            
            console.log('\n✨ FongMi/TV 播放器将识别到：');
            console.log('  ✓ 视轨菜单：' + finalResult.url.values[0].n);
            console.log('  ✓ 音轨菜单：' + finalResult.url.values[1].n);
            console.log('\n🎉 一切就绪！');
        }

    } catch (err) {
        console.error('❌ 错误:', err.message);
    }
}

const TEST_VIDEO_ID = 'dQw4w9WgXcQ';
console.log('='.repeat(70));
console.log('YouTube 播放 URL 调试工具');
console.log('='.repeat(70));
console.log('Video ID:', TEST_VIDEO_ID);
console.log('='.repeat(70) + '\n');

debugPlayUrl(TEST_VIDEO_ID);
