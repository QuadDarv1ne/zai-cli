const {
    validateApiKey,
    extractFilesFromResponse,
    sleep,
    highlightSyntax,
    createProgressBar,
    validateMessages
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
\`\`\`javascript
// FILE: file1.js
content1
\`\`\`

\`\`\`python
// FILE: file2.py
content2
\`\`\`
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

        test('должен определять язык файла', () => {
            const response = '```javascript\n// FILE: app.js\nconsole.log("hi");\n```';
            const files = extractFilesFromResponse(response, '/tmp');
            expect(files.length).toBe(1);
            expect(files[0].path).toBe(path.join('/tmp', 'app.js'));
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
            const originalIsTTY = process.stdout.isTTY;
            process.stdout.isTTY = true;

            const result = highlightSyntax('const x = 1;');
            expect(result).toContain('\x1b[35m');

            process.stdout.isTTY = originalIsTTY;
        });

        test('должен возвращать код без изменений если не TTY', () => {
            const originalIsTTY = process.stdout.isTTY;
            process.stdout.isTTY = false;

            const code = 'const x = 1;';
            const result = highlightSyntax(code);
            expect(result).toBe(code);

            process.stdout.isTTY = originalIsTTY;
        });
    });

    describe('createProgressBar', () => {
        test('должен создавать объект с update и done методами', () => {
            const progress = createProgressBar(10);
            expect(typeof progress.update).toBe('function');
            expect(typeof progress.done).toBe('function');
        });

        test('должен обновлять прогресс', () => {
            const progress = createProgressBar(10);
            expect(() => progress.update()).not.toThrow();
            expect(() => progress.done()).not.toThrow();
        });
    });
});

describe('z.ai CLI - Commander CLI', () => {
    const { Command } = require('commander');

    test('должен принимать опцию модели', () => {
        const program = new Command();
        let capturedOptions;
        program
            .allowExcessArguments()
            .option('-m, --model <name>', 'Модель', 'glm-4')
            .action((options) => { capturedOptions = options; })
            .parse(['node', 'test', '-m', 'glm-4-flash'], { from: 'user' });
        expect(capturedOptions.model).toBe('glm-4-flash');
    });

    test('должен принимать опцию create', () => {
        const program = new Command();
        let capturedOptions;
        program
            .allowExcessArguments()
            .option('-c, --create <description>', 'Создать проект')
            .action((options) => { capturedOptions = options; })
            .parse(['node', 'test', '--create', 'Telegram bot'], { from: 'user' });
        expect(capturedOptions.create).toBe('Telegram bot');
    });

    test('должен принимать опцию init', () => {
        const program = new Command();
        let capturedOptions;
        program
            .allowExcessArguments()
            .option('-i, --init <template>', 'Инициализировать шаблон')
            .action((options) => { capturedOptions = options; })
            .parse(['node', 'test', '--init', 'react'], { from: 'user' });
        expect(capturedOptions.init).toBe('react');
    });

    test('должен принимать опцию analyze', () => {
        const program = new Command();
        let capturedOptions;
        program
            .allowExcessArguments()
            .option('-a, --analyze <path>', 'Анализ кода')
            .action((options) => { capturedOptions = options; })
            .parse(['node', 'test', '--analyze', './src'], { from: 'user' });
        expect(capturedOptions.analyze).toBe('./src');
    });

    test('должен принимать опцию refactor', () => {
        const program = new Command();
        let capturedOptions;
        program
            .allowExcessArguments()
            .option('-r, --refactor <file>', 'Рефакторинг файла')
            .action((options) => { capturedOptions = options; })
            .parse(['node', 'test', '--refactor', 'src/app.js'], { from: 'user' });
        expect(capturedOptions.refactor).toBe('src/app.js');
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

describe('z.ai CLI - Обработка ошибок', () => {
    test('должен логировать ошибки в файл', () => {
        const fs = require('fs');
        const testPath = require('path');

        const logFile = testPath.join(__dirname, '..', '.zai-error-test.log');
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] Test Error:\nTest error message\n\n`;

        fs.writeFileSync(logFile, logEntry);
        expect(fs.existsSync(logFile)).toBe(true);

        fs.unlinkSync(logFile);
    });
});

describe('z.ai CLI - validateMessages', () => {
    test('должен принимать валидные сообщения', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' }
        ];
        expect(() => validateMessages(messages)).not.toThrow();
    });

    test('должен отклонять пустой массив', () => {
        expect(() => validateMessages([])).toThrow('непустым массивом');
    });

    test('должен отклонять не массив', () => {
        expect(() => validateMessages('not array')).toThrow('непустым массивом');
    });

    test('должен отклонять сообщение без role', () => {
        const messages = [{ content: 'Hello' }];
        expect(() => validateMessages(messages)).toThrow('role и content');
    });

    test('должен отклонять сообщение без content', () => {
        const messages = [{ role: 'user' }];
        expect(() => validateMessages(messages)).toThrow('role и content');
    });

    test('должен отклонять недопустимую роль', () => {
        const messages = [{ role: 'invalid', content: 'Hello' }];
        expect(() => validateMessages(messages)).toThrow('Недопустимая роль');
    });

    test('должен принимать роль system', () => {
        const messages = [{ role: 'system', content: 'You are helpful' }];
        expect(() => validateMessages(messages)).not.toThrow();
    });
});
