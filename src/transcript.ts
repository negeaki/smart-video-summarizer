import { requestUrl } from 'obsidian';
import { YoutubeTranscript } from 'youtube-transcript';

// ========== 辅助函数 ==========
function extractYouTubeId(url: string): string | null {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function extractBiliBiliId(url: string): string | null {
    const match = url.match(/BV[0-9A-Za-z]{10}/);
    return match ? match[0] : null;
}

// ========== B站 API 响应类型 ==========
interface BiliVideoResponse {
    data: {
        title: string;
        owner: { name: string };
        cid: number;
    };
}

interface BiliSubtitleResponse {
    data: {
        subtitle: {
            subtitles: Array<{
                lan: string;
                subtitle_url: string;
            }>;
        };
    };
}

interface BiliSubtitleContent {
    body: Array<{ content: string }>;
}

// ========== YouTube 字幕 ==========
async function fetchYouTubeTranscript(videoId: string): Promise<string> {
    try {
        const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
        if (!transcriptItems || transcriptItems.length === 0) return '';
        return transcriptItems.map(item => item.text).join(' ');
    } catch (error) {
        console.warn('YouTube 字幕抓取失败:', error);
        return '';
    }
}

// ========== B站字幕 ==========
async function fetchBiliBiliTranscript(bvid: string): Promise<string> {
    try {
        // 1. 获取 cid
        const pageUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        const pageResp = await requestUrl({ url: pageUrl });
        const pageData = pageResp.json as BiliVideoResponse;
        const cid = pageData?.data?.cid;
        if (!cid) return '';

        // 2. 获取字幕列表
        const subUrl = `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`;
        const subResp = await requestUrl({ url: subUrl });
        const subData = subResp.json as BiliSubtitleResponse;
        const subtitleList = subData?.data?.subtitle?.subtitles;
        if (!subtitleList || subtitleList.length === 0) return '';

        // 优先选择中文，否则第一个
        const targetSub = subtitleList.find(s => s.lan === 'zh') || subtitleList[0];
        const subUrlFull = targetSub.subtitle_url.startsWith('http')
            ? targetSub.subtitle_url
            : `https:${targetSub.subtitle_url}`;
        const subContentResp = await requestUrl({ url: subUrlFull });
        const subContent = subContentResp.json as BiliSubtitleContent;
        if (!subContent?.body) return '';
        return subContent.body.map(item => item.content).join(' ');
    } catch (error) {
        console.warn('B站字幕抓取失败:', error);
        return '';
    }
}

// ========== 主入口 ==========
export async function fetchTranscript(url: string): Promise<string> {
    const youtubeId = extractYouTubeId(url);
    if (youtubeId) {
        return await fetchYouTubeTranscript(youtubeId);
    }
    const biliId = extractBiliBiliId(url);
    if (biliId) {
        return await fetchBiliBiliTranscript(biliId);
    }
    return '';
}

export async function fetchTranscriptFallback(url: string): Promise<string> {
    // 备选方案（可扩展：如使用 yt-dlp 或提示）
    return '无法获取字幕，请检查视频是否有字幕或网络连接。';
}