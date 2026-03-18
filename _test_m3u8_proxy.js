/**
 * 调试脚本：测试 HLS M3U8 生成和 proxy URL 处理
 */

// Base64 编码/解码工具
function _btoa(str) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var buf = [];
    for (var i = 0; i < str.length; i += 3) {
        var a = str.charCodeAt(i);
        var b = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
        var c = i + 2 < str.length ? str.charCodeAt(i + 2) : 0;
        var bitmap = (a << 16) | (b << 8) | c;
        for (var j = 0; j < 4; j++) {
            if (i * 8 + j * 6 <= str.length * 8) {
                buf.push(chars.charAt((bitmap >>> (18 - j * 6)) & 0x3F));
            } else {
                buf.push('=');
            }
        }
    }
    return buf.join('');
}

function _atob(str) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var buf = [];
    for (var i = 0; i < str.length; i += 4) {
        var b1 = chars.indexOf(str.charAt(i));
        var b2 = chars.indexOf(str.charAt(i + 1));
        var b3 = chars.indexOf(str.charAt(i + 2));
        var b4 = chars.indexOf(str.charAt(i + 3));
        buf.push(String.fromCharCode(((b1 << 2) | (b2 >> 4)) & 0xFF));
        if (b3 < 64) buf.push(String.fromCharCode(((b2 << 4) | (b3 >> 2)) & 0xFF));
        if (b4 < 64) buf.push(String.fromCharCode(((b3 << 6) | b4) & 0xFF));
    }
    return buf.join('');
}

// M3U8 生成函数（复制自 youtube-spider.js）
function _generateM3U8(videoUrl, audioUrl, width, height) {
    var m3u8 = '#EXTM3U\r\n';
    m3u8 += '#EXT-X-VERSION:3\r\n';
    m3u8 += '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=' + width + 'x' + height + ',AUDIO="audio"\r\n';
    m3u8 += videoUrl + '\r\n';
    m3u8 += '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="und",NAME="audio",URI="' + audioUrl + '"\r\n';
    return m3u8;
}

// 模拟 proxy 方法
function _proxy(params) {
    try {
        var url = params.url || '';
        
        if (url.indexOf('proxy://youtube/m3u8/') === 0) {
            var encoded = url.substring('proxy://youtube/m3u8/'.length);
            var jsonStr = _atob(encoded);
            var data = JSON.parse(jsonStr);
            
            var videoUrl = data.video;
            var audioUrl = data.audio;
            var width = data.width || 1920;
            var height = data.height || 1080;
            
            var m3u8Content = _generateM3U8(videoUrl, audioUrl, width, height);
            
            return JSON.stringify([
                200,
                'application/vnd.apple.mpegurl',
                m3u8Content
            ]);
        }
        
        return JSON.stringify([404, 'text/plain', 'Not Found']);
    } catch (e) {
        return JSON.stringify([500, 'text/plain', 'Error: ' + e.message]);
    }
}

// 测试
console.log('='.repeat(70));
console.log('HLS M3U8 生成测试（使用 BASE64 编码）');
console.log('='.repeat(70));

const testVideoUrl = 'https://example.com/video/1080p.mp4?param=value&other=123';
const testAudioUrl = 'https://example.com/audio/audio.m4a?lang=en';
const testWidth = 1920;
const testHeight = 1080;

// 生成 proxy URL（使用 BASE64 编码）
var params = {
    video: testVideoUrl,
    audio: testAudioUrl,
    width: testWidth,
    height: testHeight
};
var encoded = _btoa(JSON.stringify(params));
var proxyUrl = 'proxy://youtube/m3u8/' + encoded;

console.log('\n📌 生成的 Proxy URL：');
console.log('参数对象:', JSON.stringify(params));
console.log('编码长度:', encoded.length);
console.log('Proxy URL 长度:', proxyUrl.length);
console.log('Proxy URL 开头:', proxyUrl.substring(0, 50) + '...');

// 模拟 FongMi/TV 回调 proxy 方法
console.log('\n📞 模拟 FongMi/TV 请求 M3U8...');
var response = JSON.parse(_proxy({ url: proxyUrl }));

console.log('\n✅ Proxy 方法返回：');
console.log('HTTP 状态码:', response[0]);
console.log('Content-Type:', response[1]);
console.log('\n📄 M3U8 清单内容：');
console.log(response[2]);

// 验证 M3U8 格式
console.log('\n🔍 M3U8 格式验证：');
console.log('✓ 包含 #EXTM3U 头:', response[2].indexOf('#EXTM3U') === 0);
console.log('✓ 包含 #EXT-X-VERSION:', response[2].indexOf('#EXT-X-VERSION') > -1);
console.log('✓ 包含 #EXT-X-STREAM-INF:', response[2].indexOf('#EXT-X-STREAM-INF') > -1);
console.log('✓ 包含 #EXT-X-MEDIA:', response[2].indexOf('#EXT-X-MEDIA') > -1);
console.log('✓ 包含视频 URL:', response[2].indexOf(testVideoUrl) > -1);
console.log('✓ 包含音频 URL:', response[2].indexOf(testAudioUrl) > -1);
console.log('✓ 包含分辨率:', response[2].indexOf('1920x1080') > -1);

console.log('\n✨ M3U8 生成测试完成！');
console.log('='.repeat(70));
