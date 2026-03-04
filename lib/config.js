/**
 * Управление конфигурацией приложения
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
    API_URL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    TIMEOUT: 120000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 3000,
    MAX_HISTORY_MESSAGES: 100,
    MAX_FILES_ANALYZE: 50,
    MAX_TOTAL_SIZE: 500000,
    FILE_CACHE_MAX_SIZE: 100,
};

const CONFIG_FILES = {
    ENV: '.env',
    CONFIG: 'zai.config.json',
};

/**
 * Загружает переменные окружения из .env файла
 * @param {string} basePath - Базовая директория
 * @returns {Object} Переменные окружения
 */
function loadEnv(basePath = __dirname) {
    const envPath = path.join(basePath, CONFIG_FILES.ENV);
    const envVars = {};

    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach((line) => {
            const match = line.match(/^([^#][^=]+)=(.+)$/);
            if (match) {
                envVars[match[1].trim()] = match[2].trim();
            }
        });
    }

    return envVars;
}

/**
 * Загружает пользовательскую конфигурацию из zai.config.json
 * @param {string} basePath - Базовая директория
 * @returns {Object} Пользовательская конфигурация
 */
function loadUserConfig(basePath = __dirname) {
    const configPath = path.join(basePath, CONFIG_FILES.CONFIG);

    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (error) {
        console.warn('Ошибка загрузки конфигурации:', error.message);
    }

    return {};
}

/**
 * Объединяет конфигурации
 * @param {Object} envVars - Переменные окружения
 * @param {Object} userConfig - Пользовательская конфигурация
 * @returns {Object} Объединённая конфигурация
 */
function mergeConfig(envVars, userConfig) {
    return {
        // API
        API_URL: userConfig.apiUrl || DEFAULT_CONFIG.API_URL,
        API_KEY: envVars.ZAI_API_KEY,
        
        // Таймауты и повторы
        TIMEOUT: userConfig.timeout || DEFAULT_CONFIG.TIMEOUT,
        MAX_RETRIES: userConfig.maxRetries || DEFAULT_CONFIG.MAX_RETRIES,
        RETRY_DELAY: userConfig.retryDelay || DEFAULT_CONFIG.RETRY_DELAY,
        
        // История
        MAX_HISTORY_MESSAGES: userConfig.maxHistoryMessages || DEFAULT_CONFIG.MAX_HISTORY_MESSAGES,
        
        // Анализ файлов
        MAX_FILES_ANALYZE: userConfig.maxFiles || DEFAULT_CONFIG.MAX_FILES_ANALYZE,
        MAX_TOTAL_SIZE: userConfig.maxTotalSize || DEFAULT_CONFIG.MAX_TOTAL_SIZE,
        
        // Кэш
        FILE_CACHE_MAX_SIZE: userConfig.fileCacheSize || DEFAULT_CONFIG.FILE_CACHE_MAX_SIZE,
        
        // Поведение
        STREAMING: userConfig.streaming ?? true,
        THEME: userConfig.theme || 'dark',
        AUTO_SAVE_HISTORY: userConfig.autoSaveHistory ?? true,
        
        // Исключения
        EXCLUDE_DIRS: userConfig.exclude || ['node_modules', '.git', 'dist', 'build'],
        
        // Модель по умолчанию
        DEFAULT_MODEL: userConfig.model || 'glm-5',
    };
}

/**
 * Создаёт объект конфигурации
 * @param {string} [basePath] - Базовая директория
 * @returns {Object} Конфигурация
 */
function createConfig(basePath = __dirname) {
    const envVars = loadEnv(basePath);
    const userConfig = loadUserConfig(basePath);
    
    return mergeConfig(envVars, userConfig);
}

/**
 * Валидирует API ключ
 * @param {string} apiKey - API ключ
 * @returns {{valid: boolean, error?: string}}
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
 * Сохраняет конфигурацию в файл
 * @param {Object} config - Конфигурация для сохранения
 * @param {string} basePath - Базовая директория
 */
function saveConfig(config, basePath = __dirname) {
    const configPath = path.join(basePath, CONFIG_FILES.CONFIG);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Получает путь к файлу конфигурации
 * @param {string} basePath - Базовая директория
 * @returns {string} Путь к конфигу
 */
function getConfigPath(basePath = __dirname) {
    return path.join(basePath, CONFIG_FILES.CONFIG);
}

/**
 * Получает путь к .env файлу
 * @param {string} basePath - Базовая директория
 * @returns {string} Путь к .env
 */
function getEnvPath(basePath = __dirname) {
    return path.join(basePath, CONFIG_FILES.ENV);
}

module.exports = {
    DEFAULT_CONFIG,
    CONFIG_FILES,
    loadEnv,
    loadUserConfig,
    mergeConfig,
    createConfig,
    validateApiKey,
    saveConfig,
    getConfigPath,
    getEnvPath,
};
