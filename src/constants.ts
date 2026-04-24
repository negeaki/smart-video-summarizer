// ========== 视频 URL 识别 ==========
export const VIDEO_URL_PATTERN = /youtube\.com|youtu\.be|bilibili\.com/;
export const YOUTUBE_ID_REGEX = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
export const BILIBILI_ID_REGEX = /BV[0-9A-Za-z]{10}/;

// ========== 笔记模板标题 ==========
export const SPARK_RECORD_HEADING = '## 火花记录';
export const TIMESTAMP_HEADING = '### 时间戳';
// 移除 JOTTING_HEADING

// ========== 时间戳格式 ==========
export const TIMESTAMP_PREFIX = '📌';
export const TIMESTAMP_MARKDOWN_TEMPLATE = `[${TIMESTAMP_PREFIX} {time}] `;

// ========== 默认文件夹（固定） ==========
export const DEFAULT_FOLDER_NAME = 'Video Summaries';

// ========== 字幕截断长度 ==========
export const MAX_TRANSCRIPT_CHARS = 8000;
export const MAX_APPENDIX_CHARS = 3000;

// ========== 请求延迟 ==========
export const RETRY_DELAY = 1000;

// ========== 提示消息 ==========
export const NOTICE_MESSAGES = {
    NOT_VIDEO_NOTE: '当前笔记不是视频摘要笔记，无法插入时间戳',
    OPEN_VIDEO_NOTE_FIRST: '请先打开一个视频摘要笔记',
    TIMESTAMP_INSERTED: '时间戳已插入',
    TIMESTAMP_HEADING_NOT_FOUND: '未找到时间戳区域，请确认笔记模板正确',
    GENERATING: '正在处理视频，请稍候...',
    GENERATED: '视频摘要生成完成！',
    GENERATION_FAILED: (msg: string) => `生成失败：${msg}`,
    NO_CAPTION_FALLBACK: '视频没有有效字幕，正在使用备选方案...',
    LOCAL_SUBTITLE_IMPORTED: '已导入本地字幕，正在生成摘要...',
    LOCAL_SUBTITLE_FAILED: '读取字幕文件失败，请检查文件格式',
    NO_VALID_SUBTITLE: '该视频没有字幕，已跳过',
    NO_VIDEO_INFO: '无法获取视频信息',
    NO_ACTIVE_PROVIDER: '未找到有效的 API 提供商',
    API_KEY_MISSING: (name: string) => `API key missing for provider: ${name}`,
    PLAYER_NOT_READY: '播放器未就绪',
    SEEK_SUCCESS_YOUTUBE: (time: string) => `已跳转到 ${time}`,
    SEEK_SUCCESS_BILIBILI: (time: string) => `已跳转到 ${time}（B站需重新加载）`,
    HISTORY_DELETED: 'History record deleted',
    HISTORY_CLEARED: 'All history cleared',
    SELECT_VALID_URL: '请先选中一个有效的视频链接',
} as const;

// ========== UI 模态框文本 ==========
export const MODAL_TITLE = '输入视频链接';
export const INPUT_PLACEHOLDER = '输入 YouTube 或 B站 视频链接...';
export const BUTTON_SUMMARIZE = '一键总结';
export const BUTTON_CANCEL = '取消';
export const BUTTON_PROCESSING = '处理中...';

// ========== 播放器 iframe 参数 ==========
export const YOUTUBE_EMBED_BASE = 'https://www.youtube.com/embed/';
export const YOUTUBE_EMBED_PARAMS = '?enablejsapi=1&autoplay=0';
export const BILIBILI_EMBED_BASE = 'https://player.bilibili.com/player.html';
export const BILIBILI_EMBED_PARAMS = '&page=1&high_quality=1&autoplay=0';
