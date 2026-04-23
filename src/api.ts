// api.ts
import { requestUrl, RequestUrlParam } from 'obsidian';

export interface ApiProvider {
    id: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
}

export interface ExtendedApiProvider extends ApiProvider {
    isCustom: boolean;
}

export interface ApiCallOptions {
    temperature: number;
    maxTokens: number;
}

export interface ApiAdapter {
    call(prompt: string, provider: ApiProvider, options: ApiCallOptions): Promise<string>;
    testConnection(provider: ApiProvider): Promise<boolean>;
}

// 扩展请求参数以支持超时
interface ExtendedRequestUrlParam extends RequestUrlParam {
    timeout?: number;
}

// 响应类型定义
interface GeminiResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{ text?: string }>;
        };
    }>;
}

interface OpenAiCompatibleResponse {
    choices?: Array<{
        message?: { content?: string };
    }>;
}

// 带重试的请求辅助函数
async function requestWithRetry(
    url: string,
    options: Omit<ExtendedRequestUrlParam, 'url'>,
    retries = 1
): Promise<ReturnType<typeof requestUrl>> {
    let lastError: Error | null = null;
    for (let i = 0; i <= retries; i++) {
        try {
            const requestOptions: ExtendedRequestUrlParam = { url, ...options, timeout: 30000 };
            return await requestUrl(requestOptions);
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (i < retries) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
    throw lastError ?? new Error('Request failed after retries');
}

class GeminiAdapter implements ApiAdapter {
    async call(prompt: string, provider: ApiProvider, options: ApiCallOptions): Promise<string> {
        const url = `${provider.baseUrl}/models/${provider.model}:generateContent?key=${provider.apiKey}`;
        const response = await requestWithRetry(url, {
            method: 'POST',
            contentType: 'application/json',
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: options.temperature,
                    maxOutputTokens: options.maxTokens,
                },
            }),
        });
        const data = response.json as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Invalid response from Gemini API');
        return text;
    }

    async testConnection(provider: ApiProvider): Promise<boolean> {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${provider.apiKey}`;
            await requestWithRetry(url, { method: 'GET' }, 0);
            return true;
        } catch {
            return false;
        }
    }
}

class OpenAiCompatibleAdapter implements ApiAdapter {
    async call(prompt: string, provider: ApiProvider, options: ApiCallOptions): Promise<string> {
        const url = `${provider.baseUrl}/chat/completions`;
        const response = await requestWithRetry(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${provider.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: provider.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: options.temperature,
                max_tokens: options.maxTokens,
            }),
        });
        const data = response.json as OpenAiCompatibleResponse;
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Invalid response from API');
        return text;
    }

    async testConnection(provider: ApiProvider): Promise<boolean> {
        try {
            const url = `${provider.baseUrl}/models`;
            await requestWithRetry(url, { method: 'GET', headers: { Authorization: `Bearer ${provider.apiKey}` } }, 0);
            return true;
        } catch {
            try {
                const url = `${provider.baseUrl}/chat/completions`;
                await requestWithRetry(url, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${provider.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: provider.model,
                        messages: [{ role: 'user', content: 'Hi' }],
                        max_tokens: 1,
                    }),
                }, 0);
                return true;
            } catch {
                return false;
            }
        }
    }
}

export function getApiAdapter(provider: ApiProvider): ApiAdapter {
    const isGemini = provider.baseUrl.includes('generativelanguage.googleapis.com') || provider.name.toLowerCase() === 'gemini';
    return isGemini ? new GeminiAdapter() : new OpenAiCompatibleAdapter();
}