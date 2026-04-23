// transcript.ts
import { YoutubeTranscript } from 'youtube-transcript';
import { YOUTUBE_ID_REGEX } from './constants';

/**
 * 从给定的 YouTube / Bilibili 视频 URL 获取字幕文本。
 * YouTube 使用 youtube-transcript 库，Bilibili 暂不支持，返回空字符串以触发后备策略。
 * @param url 视频链接
 * @returns 字幕纯文本（无时间标记）
 * @throws 若平台不支持或无法提取 YouTube ID，则抛出错误
 */
export async function fetchTranscript(url: string): Promise<string> {
    // YouTube 处理
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = extractYouTubeId(url);
        if (!videoId) {
            throw new Error('Could not extract YouTube video ID');
        }
        try {
            const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
            // 拼接为纯文本，空格分隔
            return transcriptItems.map(item => item.text).join(' ');
        } catch {
            // 如果获取失败（如字幕被禁用），抛出错误以便调用方 fallback
            throw new Error('Failed to fetch YouTube transcript');
        }
    }

    // Bilibili 暂不实现字幕抓取，返回空字符串触发 fallback
    if (url.includes('bilibili.com')) {
        return '';   // 调用方会检查长度并启动 fallback
    }

    throw new Error('Unsupported platform');
}

/** 从 URL 中提取 YouTube 视频 ID */
function extractYouTubeId(url: string): string | null {
    const match = url.match(YOUTUBE_ID_REGEX);
    return match?.[2] ?? null;
}