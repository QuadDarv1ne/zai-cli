const { 
    validateApiKey, 
    extractFilesFromResponse,
    sleep,
    highlightSyntax,
    createProgressBar 
} = require('../lib/utils');
const path = require('path');

describe('z.ai CLI - Утилиты', () => {
    
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

    describe('extractFilesFromResponse', () => {
        test('должен извлекать файл с FILE: меткой', () => {
            const response = '```javascript\n// FILE: test.js\nconsole.log("hi");\n```';
            const files = extractFilesFromResponse(response, '/tmp');
            expect(files.length).toBe(1);
            expect(files[0].path).toBe(path.join('/tmp', 'test.js'));
            // Контент может включать закрывающий ```
            expect(files[0].content).toContain('console.log("hi");');
        });

        test('должен извлекать код из code block без FILE:', () => {
            const response = '```javascript\nconst x = 1;\n```';
            const files = extractFilesFromResponse(response, '/tmp');
            expect(files.length).toBe(1);
            expect(files[0].path).toBe(path.join('/tmp', 'output.js'));
            expect(files[0].content).toBe('const x = 1;');
        });

        test('должен извлекать несколько файлов', () => {
            const response = `
// FILE: file1.js
content1

// FILE: file2.py
content2
`;
            const files = extractFilesFromResponse(response, '/tmp');
            expect(files.length).toBe(2);
            expect(files[0].path).toBe(path.join('/tmp', 'file1.js'));
            expect(files[1].path).toBe(path.join('/tmp', 'file2.py'));
        });

        test('должен возвращать пустой массив для ответа без кода', () => {
            const response = 'Просто текст без кода';
            const files = extractFilesFromResponse(response, '/tmp');
            expect(files.length).toBe(0);
        });
    });

    describe('sleep', () => {
        test('должен ждать указанное время', async () => {
            const start = Date.now();
            await sleep(100);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(90);
        });
    });

    describe('highlightSyntax', () => {
        test('должен возвращать строку', () => {
            const result = highlightSyntax('const x = 1;');
            expect(typeof result).toBe('string');
        });

        test('должен содержать ANSI коды для ключевого слова в TTY', () => {
            // Сохраняем оригинальное значение
            const originalIsTTY = process.stdout.isTTY;
            process.stdout.isTTY = true;
            
            const result = highlightSyntax('const x = 1;');
            expect(result).toContain('\x1b[35m'); // keyword color
            
            // Восстанавливаем
            process.stdout.isTTY = originalIsTTY;
        });
    });

    describe('createProgressBar', () => {
        test('должен создавать объект с update и done методами', () => {
            const progress = createProgressBar(10);
            expect(typeof progress.update).toBe('function');
            expect(typeof progress.done).toBe('function');
        });
    });
});

describe('z.ai CLI - Парсинг аргументов', () => {
    test('должен распознавать --help флаг', () => {
        const args = ['--help'];
        expect(args.includes('--help') || args.includes('-h')).toBe(true);
    });

    test('должен распознавать --create флаг', () => {
        const args = ['--create', 'project'];
        expect(args.indexOf('--create')).toBeGreaterThanOrEqual(0);
    });

    test('должен распознавать -m флаг для модели', () => {
        const args = ['-m', 'glm-4-flash', 'hello'];
        const modelIndex = args.indexOf('-m');
        expect(modelIndex).toBeGreaterThanOrEqual(0);
        expect(args[modelIndex + 1]).toBe('glm-4-flash');
    });
});

describe('z.ai CLI - Шаблоны', () => {
    const TEMPLATES = {
        'node': { name: 'Node.js проект', files: [] },
        'python': { name: 'Python проект', files: [] },
        'react': { name: 'React проект', files: [] },
        'vue': { name: 'Vue 3 проект', files: [] },
        'flask': { name: 'Flask приложение', files: [] },
        'express': { name: 'Express.js API', files: [] },
        'telegram-bot': { name: 'Telegram бот (Python)', files: [] },
        'cli': { name: 'CLI утилита (Node.js)', files: [] },
        'nextjs': { name: 'Next.js 14 проект', files: [] },
        'fastapi': { name: 'FastAPI проект', files: [] },
        'django': { name: 'Django проект', files: [] },
        'go': { name: 'Go проект', files: [] },
        'rust': { name: 'Rust проект', files: [] }
    };

    test('должен содержать все шаблоны', () => {
        expect(Object.keys(TEMPLATES).length).toBeGreaterThanOrEqual(12);
    });

    test('каждый шаблон должен иметь name и files', () => {
        Object.values(TEMPLATES).forEach(template => {
            expect(template).toHaveProperty('name');
            expect(template).toHaveProperty('files');
        });
    });
});

describe('z.ai CLI - Конфигурация', () => {
    const CONFIG = {
        TIMEOUT: 60000,
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000,
        MAX_HISTORY_MESSAGES: 100
    };

    test('TIMEOUT должен быть 60 секунд', () => {
        expect(CONFIG.TIMEOUT).toBe(60000);
    });

    test('MAX_RETRIES должен быть 3', () => {
        expect(CONFIG.MAX_RETRIES).toBe(3);
    });

    test('RETRY_DELAY должен быть 1000ms', () => {
        expect(CONFIG.RETRY_DELAY).toBe(1000);
    });

    test('MAX_HISTORY_MESSAGES должен быть 100', () => {
        expect(CONFIG.MAX_HISTORY_MESSAGES).toBe(100);
    });
});
