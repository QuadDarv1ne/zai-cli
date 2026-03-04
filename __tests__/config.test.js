/**
 * Тесты для модуля конфигурации
 */

const {
    loadEnv,
    loadUserConfig,
    mergeConfig,
    createConfig,
    validateApiKey,
    saveConfig,
    getConfigPath,
    getEnvPath,
    DEFAULT_CONFIG,
    CONFIG_FILES,
} = require('../lib/config');
const path = require('path');
const fs = require('fs');

describe('lib/config.js - Управление конфигурацией', () => {
    describe('DEFAULT_CONFIG', () => {
        test('должен содержать базовые настройки', () => {
            expect(DEFAULT_CONFIG).toHaveProperty('API_URL');
            expect(DEFAULT_CONFIG).toHaveProperty('TIMEOUT', 120000);
            expect(DEFAULT_CONFIG).toHaveProperty('MAX_RETRIES', 3);
            expect(DEFAULT_CONFIG).toHaveProperty('RETRY_DELAY', 3000);
            expect(DEFAULT_CONFIG).toHaveProperty('MAX_HISTORY_MESSAGES', 100);
        });
    });

    describe('CONFIG_FILES', () => {
        test('должен содержать имена конфигурационных файлов', () => {
            expect(CONFIG_FILES.ENV).toBe('.env');
            expect(CONFIG_FILES.CONFIG).toBe('zai.config.json');
        });
    });

    describe('validateApiKey', () => {
        test('должен принимать валидный ключ', () => {
            const result = validateApiKey('abc123def456ghi789.xyz789');
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        test('должен отклонять отсутствующий ключ', () => {
            const result = validateApiKey(null);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('API ключ не найден');
        });

        test('должен отклонять пустую строку', () => {
            const result = validateApiKey('');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('API ключ не найден');
        });

        test('должен отклонять короткий ключ', () => {
            const result = validateApiKey('abc.xyz');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Неверный формат API ключа');
        });

        test('должен отклонять ключ без точки', () => {
            const result = validateApiKey('abcdefghijklmnopqrst');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Неверный формат API ключа');
        });
    });

    describe('loadEnv', () => {
        test('должен загружать переменные из .env', () => {
            const envVars = loadEnv(__dirname);
            expect(envVars).toBeDefined();
            expect(typeof envVars).toBe('object');
        });

        test('должен возвращать пустой объект если файл не существует', () => {
            const envVars = loadEnv('/non/existent/path');
            expect(envVars).toEqual({});
        });
    });

    describe('loadUserConfig', () => {
        test('должен загружать JSON конфигурацию', () => {
            const config = loadUserConfig(__dirname);
            expect(config).toBeDefined();
            expect(typeof config).toBe('object');
        });

        test('должен возвращать пустой объект если файл не существует', () => {
            const config = loadUserConfig('/non/existent/path');
            expect(config).toEqual({});
        });
    });

    describe('mergeConfig', () => {
        test('должен объединять конфигурации с приоритетом userConfig', () => {
            const envVars = { ZAI_API_KEY: 'test-key' };
            const userConfig = { model: 'glm-4', timeout: 60000 };
            
            const merged = mergeConfig(envVars, userConfig);
            
            expect(merged.API_KEY).toBe('test-key');
            expect(merged.DEFAULT_MODEL).toBe('glm-4');
            expect(merged.TIMEOUT).toBe(60000);
        });

        test('должен использовать значения по умолчанию', () => {
            const merged = mergeConfig({}, {});
            
            expect(merged.TIMEOUT).toBe(DEFAULT_CONFIG.TIMEOUT);
            expect(merged.MAX_RETRIES).toBe(DEFAULT_CONFIG.MAX_RETRIES);
            expect(merged.DEFAULT_MODEL).toBe('glm-5');
        });

        test('должен устанавливать STREAMING по умолчанию в true', () => {
            const merged = mergeConfig({}, {});
            expect(merged.STREAMING).toBe(true);
        });

        test('должен устанавливать AUTO_SAVE_HISTORY по умолчанию в true', () => {
            const merged = mergeConfig({}, {});
            expect(merged.AUTO_SAVE_HISTORY).toBe(true);
        });

        test('должен использовать дефолтные исключения', () => {
            const merged = mergeConfig({}, {});
            expect(merged.EXCLUDE_DIRS).toContain('node_modules');
            expect(merged.EXCLUDE_DIRS).toContain('.git');
        });
    });

    describe('getConfigPath', () => {
        test('должен возвращать путь к файлу конфигурации', () => {
            const configPath = getConfigPath(__dirname);
            expect(configPath).toContain(CONFIG_FILES.CONFIG);
        });
    });

    describe('getEnvPath', () => {
        test('должен возвращать путь к .env файлу', () => {
            const envPath = getEnvPath(__dirname);
            expect(envPath).toContain(CONFIG_FILES.ENV);
        });
    });
});

describe('lib/config.js - Интеграция', () => {
    describe('createConfig', () => {
        test('должен создавать полную конфигурацию', () => {
            const config = createConfig(__dirname);
            
            expect(config).toHaveProperty('API_URL');
            expect(config).toHaveProperty('API_KEY');
            expect(config).toHaveProperty('TIMEOUT');
            expect(config).toHaveProperty('MAX_RETRIES');
            expect(config).toHaveProperty('STREAMING');
            expect(config).toHaveProperty('DEFAULT_MODEL');
        });

        test('должен объединять env и userConfig', () => {
            const config = createConfig(__dirname);
            // API_KEY должен быть из .env
            expect('API_KEY' in config).toBe(true);
        });
    });
});
