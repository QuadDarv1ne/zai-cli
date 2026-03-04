/**
 * Управление историей чата
 */

const fs = require('fs');
const path = require('path');
const { debounce } = require('./utils');

const DEFAULT_HISTORY_FILE = '.chat-history.json';

/**
 * Загружает историю чата из файла
 * @param {string} historyPath - Путь к файлу истории
 * @returns {Array<{role: string, content: string}>}
 */
function loadChatHistory(historyPath = null) {
    const filePath = historyPath || path.join(__dirname, '..', DEFAULT_HISTORY_FILE);
    
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        // Игнорируем ошибки чтения
    }
    return [];
}

/**
 * Сохраняет историю чата в файл
 * @param {Array} history - История для сохранения
 * @param {string} historyPath - Путь к файлу истории
 * @param {number} maxMessages - Максимальное количество сообщений
 */
function saveChatHistory(history, historyPath = null, maxMessages = 100) {
    const filePath = historyPath || path.join(__dirname, '..', DEFAULT_HISTORY_FILE);
    
    try {
        const trimmed = history.slice(-maxMessages);
        fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch (error) {
        // Игнорируем ошибки записи
    }
}

/**
 * Создаёт debounced версию сохранения истории
 * @param {Function} saveFn - Функция сохранения
 * @param {number} delay - Задержка в мс
 * @returns {Function}
 */
function createSaveHistoryDebounced(saveFn, delay = 500) {
    return debounce(saveFn, delay);
}

/**
 * Очищает историю чата
 * @param {string} historyPath - Путь к файлу истории
 */
function clearChatHistory(historyPath = null) {
    const filePath = historyPath || path.join(__dirname, '..', DEFAULT_HISTORY_FILE);
    
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        // Игнорируем ошибки
    }
}

/**
 * Экспортирует историю в файл
 * @param {Array} history - История чата
 * @param {string} filePath - Путь для сохранения
 * @param {string} format - Формат: 'md', 'html', 'txt'
 */
function exportHistory(history, filePath, format = 'md') {
    let content;

    switch (format.toLowerCase()) {
        case 'md':
        case 'markdown':
            content = exportToMarkdown(history);
            break;
        case 'html':
            content = exportToHtml(history);
            break;
        case 'txt':
        default:
            content = exportToText(history);
            break;
    }

    fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Экспортирует в Markdown
 * @param {Array} history
 * @returns {string}
 */
function exportToMarkdown(history) {
    let md = '# Чат с z.ai\n\n';
    
    for (const msg of history) {
        const role = msg.role === 'user' ? '👤 Пользователь' : '🤖 AI';
        md += `## ${role}\n\n${msg.content}\n\n---\n\n`;
    }
    
    return md;
}

/**
 * Экспортирует в HTML
 * @param {Array} history
 * @returns {string}
 */
function exportToHtml(history) {
    let html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Чат с z.ai</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
               max-width: 800px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #eee; }
        .message { margin: 20px 0; padding: 15px; border-radius: 8px; }
        .user { background: #16213e; }
        .assistant { background: #0f3460; }
        .role { font-weight: bold; margin-bottom: 10px; color: #00d9ff; }
        .content { white-space: pre-wrap; }
        pre { background: #0d0d0d; padding: 10px; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>💬 Чат с z.ai</h1>
`;

    for (const msg of history) {
        const role = msg.role === 'user' ? '👤 Пользователь' : '🤖 AI';
        const escaped = escapeHtml(msg.content);
        html += `    <div class="message ${msg.role}">
        <div class="role">${role}</div>
        <div class="content">${escaped}</div>
    </div>\n`;
    }

    html += '</body>\n</html>';
    return html;
}

/**
 * Экспортирует в простой текст
 * @param {Array} history
 * @returns {string}
 */
function exportToText(history) {
    let text = 'ЧАТ С Z.AI\n' + '='.repeat(50) + '\n\n';
    
    for (const msg of history) {
        const role = msg.role === 'user' ? 'ПОЛЬЗОВАТЕЛЬ' : 'AI';
        text += `${role}:\n${msg.content}\n\n${'-'.repeat(50)}\n\n`;
    }
    
    return text;
}

/**
 * Экранирует HTML символы
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Загружает историю из файла
 * @param {string} filePath - Путь к файлу
 * @returns {Array<{role: string, content: string}>}
 */
function loadHistoryFromFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Ошибка загрузки истории:', error.message);
    }
    return [];
}

/**
 * Получает статистику по токенам истории
 * @param {Array} history
 * @param {Function} countTokens - Функция подсчёта токенов
 * @returns {{total: number, messages: number, byRole: Object}}
 */
function getHistoryStats(history, countTokens) {
    const stats = {
        total: 0,
        messages: history.length,
        byRole: { user: 0, assistant: 0, system: 0 },
    };

    for (const msg of history) {
        const tokens = countTokens(msg.content);
        stats.total += tokens;
        if (stats.byRole[msg.role] !== undefined) {
            stats.byRole[msg.role] += tokens;
        }
    }

    return stats;
}

module.exports = {
    DEFAULT_HISTORY_FILE,
    loadChatHistory,
    saveChatHistory,
    createSaveHistoryDebounced,
    clearChatHistory,
    exportHistory,
    loadHistoryFromFile,
    getHistoryStats,
};
