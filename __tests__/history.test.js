/**
 * Тесты для модуля истории чата
 */

const {
    loadChatHistory,
    saveChatHistory,
    clearChatHistory,
    exportHistory,
    loadHistoryFromFile,
    getHistoryStats,
    DEFAULT_HISTORY_FILE,
} = require('../lib/history');
const fs = require('fs');
const path = require('path');

describe('lib/history.js - Управление историей', () => {
    const testHistoryPath = path.join(__dirname, '.test-history.json');
    const testHistory = [
        { role: 'user', content: 'Привет' },
        { role: 'assistant', content: 'Привет! Чем могу помочь?' },
        { role: 'user', content: 'Напиши код на Python' },
    ];

    afterEach(() => {
        // Очистка тестовых файлов
        if (fs.existsSync(testHistoryPath)) {
            fs.unlinkSync(testHistoryPath);
        }
    });

    describe('DEFAULT_HISTORY_FILE', () => {
        test('должен иметь значение по умолчанию', () => {
            expect(DEFAULT_HISTORY_FILE).toBe('.chat-history.json');
        });
    });

    describe('loadChatHistory', () => {
        test('должен загружать историю из файла', () => {
            fs.writeFileSync(testHistoryPath, JSON.stringify(testHistory), 'utf8');
            const loaded = loadChatHistory(testHistoryPath);
            expect(loaded).toEqual(testHistory);
        });

        test('должен возвращать пустой массив если файл не существует', () => {
            const loaded = loadChatHistory('/non/existent/path.json');
            expect(loaded).toEqual([]);
        });

        test('должен возвращать пустой массив при ошибке чтения', () => {
            const loaded = loadChatHistory(null);
            expect(Array.isArray(loaded)).toBe(true);
        });
    });

    describe('saveChatHistory', () => {
        test('должен сохранять историю в файл', () => {
            saveChatHistory(testHistory, testHistoryPath, 100);
            expect(fs.existsSync(testHistoryPath)).toBe(true);
            
            const saved = JSON.parse(fs.readFileSync(testHistoryPath, 'utf8'));
            expect(saved).toEqual(testHistory);
        });

        test('должен обрезать историю до maxMessages', () => {
            const longHistory = Array(150).fill({ role: 'user', content: 'test' });
            saveChatHistory(longHistory, testHistoryPath, 50);
            
            const saved = JSON.parse(fs.readFileSync(testHistoryPath, 'utf8'));
            expect(saved.length).toBe(50);
        });
    });

    describe('clearChatHistory', () => {
        test('должен удалять файл истории', () => {
            fs.writeFileSync(testHistoryPath, JSON.stringify(testHistory), 'utf8');
            clearChatHistory(testHistoryPath);
            expect(fs.existsSync(testHistoryPath)).toBe(false);
        });

        test('не должен вызывать ошибку если файл не существует', () => {
            expect(() => clearChatHistory('/non/existent/path.json')).not.toThrow();
        });
    });

    describe('loadHistoryFromFile', () => {
        test('должен загружать историю из указанного файла', () => {
            fs.writeFileSync(testHistoryPath, JSON.stringify(testHistory), 'utf8');
            const loaded = loadHistoryFromFile(testHistoryPath);
            expect(loaded).toEqual(testHistory);
        });

        test('должен возвращать пустой массив при ошибке', () => {
            const loaded = loadHistoryFromFile('/non/existent.json');
            expect(loaded).toEqual([]);
        });
    });

    describe('exportHistory', () => {
        test('должен экспортировать в Markdown', () => {
            const mdPath = testHistoryPath.replace('.json', '.md');
            exportHistory(testHistory, mdPath, 'md');
            
            const content = fs.readFileSync(mdPath, 'utf8');
            expect(content).toContain('# Чат с z.ai');
            expect(content).toContain('👤 Пользователь');
            expect(content).toContain('🤖 AI');
            
            fs.unlinkSync(mdPath);
        });

        test('должен экспортировать в HTML', () => {
            const htmlPath = testHistoryPath.replace('.json', '.html');
            exportHistory(testHistory, htmlPath, 'html');
            
            const content = fs.readFileSync(htmlPath, 'utf8');
            expect(content).toContain('<!DOCTYPE html>');
            expect(content).toContain('Чат с z.ai');
            
            fs.unlinkSync(htmlPath);
        });

        test('должен экспортировать в TXT', () => {
            const txtPath = testHistoryPath.replace('.json', '.txt');
            exportHistory(testHistory, txtPath, 'txt');
            
            const content = fs.readFileSync(txtPath, 'utf8');
            expect(content).toContain('ЧАТ С Z.AI');
            expect(content).toContain('ПОЛЬЗОВАТЕЛЬ');
            expect(content).toContain('AI');
            
            fs.unlinkSync(txtPath);
        });
    });

    describe('getHistoryStats', () => {
        test('должен считать статистику токенов', () => {
            const history = [
                { role: 'user', content: 'Hello' },       // 5 символов = 2 токена
                { role: 'assistant', content: 'Hi there' }, // 8 символов = 2 токена
            ];
            
            const stats = getHistoryStats(history, (text) => Math.ceil(text.length / 4));
            
            expect(stats.total).toBe(4);
            expect(stats.messages).toBe(2);
            expect(stats.byRole.user).toBe(2);
            expect(stats.byRole.assistant).toBe(2);
        });

        test('должен обрабатывать пустую историю', () => {
            const stats = getHistoryStats([], (text) => Math.ceil(text.length / 4));
            
            expect(stats.total).toBe(0);
            expect(stats.messages).toBe(0);
        });

        test('должен учитывать role system', () => {
            const history = [
                { role: 'system', content: 'You' }, // 3 символа = 1 токен
                { role: 'user', content: 'Hi' },    // 2 символа = 1 токен
            ];
            
            const stats = getHistoryStats(history, (text) => Math.ceil(text.length / 4));
            
            expect(stats.byRole.system).toBe(1);
            expect(stats.byRole.user).toBe(1);
        });
    });
});
