/**
 * API клиент для работы с z.ai (Zhipu AI / GLM)
 */

const { loadConfig } = require('./config');

/**
 * Генерирует уникальный ID запроса
 * @returns {string}
 */
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Добавляет случайный джиттер к задержке
 * @param {number} delay - Базовая задержка в мс
 * @param {number} factor - Коэффициент джиттера (0.2 = 20%)
 * @returns {number}
 */
function addJitter(delay, factor = 0.2) {
    const jitter = delay * factor * (Math.random() * 2 - 1);
    return delay + jitter;
}

/**
 * Sleep утилита
 * @param {number} ms - Количество миллисекунд
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Выполняет fetch с таймаутом
 * @param {string} url - URL для запроса
 * @param {Object} options - Параметры fetch
 * @param {number} timeout - Таймаут в мс
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options, timeout = 120000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Таймаут запроса (${timeout / 1000}с)`, { cause: error });
        }
        throw error;
    }
}

/**
 * Выполняет fetch с автоматическими повторами при ошибках
 * @param {string} url - URL для запроса
 * @param {Object} options - Параметры fetch
 * @param {number} retries - Количество попыток
 * @param {Object} config - Конфигурация
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, retries = 3, config = {}) {
    const {
        maxRetries = 3,
        retryDelay = 3000,
        onRetry = () => {},
    } = config;

    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, options);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));

                // 401 - неверный ключ
                if (response.status === 401) {
                    throw new Error('Неверный API ключ (401). Проверьте .env файл.');
                }

                // 429 - rate limit с экспоненциальным backoff
                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers.get('Retry-After')) || attempt * 3;
                    console.log(`\n⏳ Rate limit. Ожидание ${retryAfter}с...\n`);
                    await sleep(retryAfter * 1000);
                    continue;
                }

                throw new Error(
                    `API Error ${response.status}: ${errorData.message || response.statusText}`
                );
            }

            return response;
        } catch (error) {
            lastError = error;

            // Не ретраим ошибки аутентификации и таймауты
            if (
                error.message.includes('401') ||
                error.message.includes('Таймаут') ||
                error.message.includes('сетевое')
            ) {
                throw error;
            }

            // Детальный лог ошибки
            console.error('\n🔍 Ошибка запроса:', error.message);
            if (error.cause) {
                console.error('Причина:', error.cause.message || error.cause);
            }

            if (attempt < retries) {
                const baseDelay = retryDelay * Math.pow(2, attempt - 1);
                const delay = addJitter(baseDelay);
                console.log(
                    `\n🔄 Попытка ${attempt + 1} из ${retries} через ${(delay / 1000).toFixed(1)}с...\n`
                );
                onRetry(attempt, retries, delay);
                await sleep(delay);
            }
        }
    }

    throw lastError || new Error('Неизвестная ошибка');
}

/**
 * Валидирует сообщения для API
 * @param {Array<{role: string, content: string}>} messages
 * @throws {Error} Если сообщения некорректны
 */
function validateMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Сообщения должны быть непустым массивом');
    }
    for (const msg of messages) {
        if (!msg.role || !msg.content) {
            throw new Error('Каждое сообщение должно иметь role и content');
        }
        if (!['system', 'user', 'assistant'].includes(msg.role)) {
            throw new Error(`Недопустимая роль: ${msg.role}`);
        }
    }
}

/**
 * Основная функция для чата с API
 * @param {Array<{role: string, content: string}>} messages - Сообщения
 * @param {string} [model='glm-5'] - Модель
 * @param {string} [systemPrompt=null] - System prompt
 * @param {boolean} [streaming=false] - Потоковый режим
 * @param {Object} config - Конфигурация
 * @returns {Promise<string|Response>}
 */
async function chat(messages, model = 'glm-5', systemPrompt = null, streaming = false, config = {}) {
    const { API_KEY, API_URL, timeout = 120000 } = config;
    
    validateMessages(messages);

    const requestId = generateRequestId();
    const allMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

    const options = {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
        },
        body: JSON.stringify({
            model: model,
            messages: allMessages,
            stream: streaming,
            request_id: requestId,
        }),
    };

    const response = await fetchWithRetry(API_URL, options, 3, {
        maxRetries: config.maxRetries || 3,
        retryDelay: config.retryDelay || 3000,
    });

    if (streaming) {
        return response;
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Некорректный формат ответа API');
    }

    return data.choices[0].message.content;
}

/**
 * Генератор для потокового чата
 * @param {Array<{role: string, content: string}>} messages - Сообщения
 * @param {string} [model='glm-5'] - Модель
 * @param {string} [systemPrompt=null] - System prompt
 * @param {Object} config - Конфигурация
 * @yields {string} Части ответа
 */
async function* chatStream(messages, model = 'glm-5', systemPrompt = null, config = {}) {
    const { API_KEY, API_URL, timeout = 120000 } = config;
    
    validateMessages(messages);

    const requestId = generateRequestId();
    const allMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

    const options = {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
        },
        body: JSON.stringify({
            model: model,
            messages: allMessages,
            stream: true,
            request_id: requestId,
        }),
    };

    const response = await fetchWithRetry(API_URL, options, 3, config);

    if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkTimeout = null;

    try {
        while (true) {
            const { done, value } = await Promise.race([
                reader.read(),
                new Promise((_, reject) => {
                    chunkTimeout = setTimeout(
                        () => reject(new Error('Таймаут получения данных')),
                        30000
                    );
                }),
            ]);
            clearTimeout(chunkTimeout);

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') {
                        continue;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content || '';
                        if (content) {
                            yield content;
                        }
                    } catch {
                        // Пропускаем некорректные данные
                    }
                }
            }
        }
    } catch (error) {
        if (chunkTimeout) {
            clearTimeout(chunkTimeout);
        }
        if (error.message === 'Таймаут получения данных') {
            throw new Error('Превышено время ожидания ответа от сервера (30с)', { cause: error });
        }
        throw error;
    } finally {
        if (chunkTimeout) {
            clearTimeout(chunkTimeout);
        }
        reader.releaseLock();
    }
}

/**
 * Получает список доступных моделей из API
 * @param {string} apiKey - API ключ
 * @param {string} apiUrl - URL API
 * @returns {Promise<Array<{id: string, name: string, description: string}>>}
 */
async function fetchAvailableModels(apiKey, apiUrl) {
    const DEFAULT_MODELS = [
        { id: 'glm-5', name: 'GLM-5', description: 'Новейшая флагманская модель' },
        { id: 'glm-4.7', name: 'GLM-4.7', description: 'Продвинутая универсальная' },
        { id: 'glm-4.6', name: 'GLM-4.6', description: 'Сбалансированная производительность' },
        { id: 'glm-4.5-air', name: 'GLM-4.5 Air', description: 'Быстрая и экономичная' },
        { id: 'glm-4.5', name: 'GLM-4.5', description: 'Проверенная надёжная модель' },
    ];

    try {
        const options = {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        };

        const response = await fetchWithTimeout(
            apiUrl.replace('/chat/completions', '/models'),
            options,
            10000
        );

        if (!response.ok) {
            return DEFAULT_MODELS;
        }

        const data = await response.json();

        if (data.data && Array.isArray(data.data)) {
            return data.data.map((m) => ({
                id: m.id,
                name: m.id.toUpperCase(),
                description: `Модель от ${m.owned_by}`,
                created: m.created,
            }));
        }

        return DEFAULT_MODELS;
    } catch {
        return DEFAULT_MODELS;
    }
}

module.exports = {
    generateRequestId,
    addJitter,
    sleep,
    fetchWithTimeout,
    fetchWithRetry,
    validateMessages,
    chat,
    chatStream,
    fetchAvailableModels,
};
