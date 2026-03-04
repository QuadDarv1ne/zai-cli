// ═══════════════════════════════════════════════════════════════════════
// УТИЛИТЫ - ОТДЕЛЬНЫЙ МОДУЛЬ ДЛЯ ТЕСТИРОВАНИЯ
// ═══════════════════════════════════════════════════════════════════════

const path = require('path');

/**
 * Валидация API ключа
 */
function validateApiKey(apiKey) {
    if (!apiKey) {
        return { valid: false, error: 'API ключ не найден' };
    }
    if (!apiKey.includes('.') || apiKey.length < 20) {
        return { valid: false, error: 'Неверный формат API ключа' };
    }
    return { valid: true };
}

/**
 * Извлечение файлов из ответа AI
 */
function extractFilesFromResponse(response, baseDir) {
    const files = [];
    const filePattern = /```(\w+)?\s*\n(?:\/\/\/\s*FILE:\s*([^\n]+)\n)?([\s\S]*?)```/g;
    const simpleFilePattern = /FILE:\s*([^\n]+)\n([\s\S]*?)(?=FILE:|$)/g;

    let match;

    while ((match = filePattern.exec(response)) !== null) {
        const lang = match[1] || '';
        const filePath = match[2];
        const content = match[3].trim();

        if (filePath) {
            files.push({
                path: path.join(baseDir, filePath),
                content: content,
                language: lang,
            });
        }
    }

    while ((match = simpleFilePattern.exec(response)) !== null) {
        const filePath = match[1].trim();
        const content = match[2].trim();

        if (filePath && content) {
            files.push({
                path: path.join(baseDir, filePath),
                content: content,
            });
        }
    }

    if (files.length === 0) {
        const codeBlockMatch = response.match(/```(\w+)?\s*\n([\s\S]*?)```/);
        if (codeBlockMatch) {
            const extMap = {
                python: '.py',
                javascript: '.js',
                typescript: '.ts',
                php: '.php',
                java: '.java',
                cpp: '.cpp',
                c: '.c',
                html: '.html',
                css: '.css',
                json: '.json',
                markdown: '.md',
            };
            const lang = codeBlockMatch[1] || '';
            const ext = extMap[lang.toLowerCase()] || '.txt';

            files.push({
                path: path.join(baseDir, 'output' + ext),
                content: codeBlockMatch[2].trim(),
            });
        }
    }

    return files;
}

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Подсветка синтаксиса
 */
function highlightSyntax(code, _lang = '') {
    if (!process.stdout.isTTY) {
        return code;
    }

    const SYNTAX_COLORS = {
        keyword: '\x1b[35m',
        string: '\x1b[32m',
        number: '\x1b[33m',
        comment: '\x1b[90m',
        function: '\x1b[36m',
        operator: '\x1b[33m',
        bracket: '\x1b[90m',
        reset: '\x1b[0m',
    };

    let highlighted = code;
    const keywords =
        /\b(const|let|var|function|return|if|else|for|while|class|import|from|export|default|async|await|try|catch|throw|new|this|typeof|instanceof|null|undefined|true|false)\b/g;
    highlighted = highlighted.replace(keywords, `${SYNTAX_COLORS.keyword}$1${SYNTAX_COLORS.reset}`);
    highlighted = highlighted.replace(
        /(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g,
        `${SYNTAX_COLORS.string}$&${SYNTAX_COLORS.reset}`
    );
    highlighted = highlighted.replace(
        /\b\d+(\.\d+)?\b/g,
        `${SYNTAX_COLORS.number}$&${SYNTAX_COLORS.reset}`
    );
    highlighted = highlighted.replace(
        /(\/\/.*$|#.*$)/gm,
        `${SYNTAX_COLORS.comment}$1${SYNTAX_COLORS.reset}`
    );
    highlighted = highlighted.replace(
        /\b([a-zA-Z_]\w*)(?=\s*\()/g,
        `${SYNTAX_COLORS.function}$1${SYNTAX_COLORS.reset}`
    );

    return highlighted;
}

/**
 * Прогресс бар
 */
function createProgressBar(total) {
    let current = 0;
    const barWidth = 30;

    return {
        update: (increment = 1) => {
            current += increment;
            const progress = Math.min(current / total, 1);
            const filled = Math.round(barWidth * progress);
            const empty = barWidth - filled;
            const percent = Math.round(progress * 100);
            const bar = '█'.repeat(filled) + '░'.repeat(empty);
            process.stdout.write(`\r📊 [${bar}] ${percent}% (${current}/${total})`);
            if (current >= total) {
                process.stdout.write('\n');
            }
        },
        done: () => {
            current = total;
            const bar = '█'.repeat(barWidth);
            process.stdout.write(`\r📊 [${bar}] 100% (${total}/${total})\n`);
        },
    };
}

/**
 * Валидация сообщений для API
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
    return true;
}

/**
 * Подсчёт приблизительного количества токенов
 * @param {string} text - Текст для подсчёта
 * @returns {number} Примерное количество токенов
 */
function countTokens(text) {
    if (!text) {
        return 0;
    }
    const chars = text.length;
    return Math.ceil(chars / 4);
}

/**
 * Обрезка текста до максимальной длины
 * @param {string} text - Текст для обрезки
 * @param {number} maxLength - Максимальная длина
 * @returns {string} Обрезанный текст
 */
function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) {
        return text || '';
    }
    return text.slice(0, maxLength - 3) + '...';
}

/**
 * Форматирование размера файла в человекочитаемый вид
 * @param {number} bytes - Размер в байтах
 * @returns {string} Форматированный размер (B, KB, MB)
 */
function formatFileSize(bytes) {
    if (bytes === 0) {
        return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

module.exports = {
    validateApiKey,
    extractFilesFromResponse,
    sleep,
    highlightSyntax,
    createProgressBar,
    validateMessages,
    countTokens,
    truncateText,
    formatFileSize,
};
