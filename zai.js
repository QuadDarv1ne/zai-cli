#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const { SingleBar } = require('cli-progress');
const { Command } = require('commander');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

// ═══════════════════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════════════════════

const CONFIG = {
    API_URL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    API_KEY_FILE: path.join(__dirname, '.env'),
    HISTORY_FILE: path.join(__dirname, '.chat-history.json'),
    CONFIG_FILE: path.join(__dirname, 'zai.config.json'),
    TIMEOUT: 60000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    MAX_HISTORY_MESSAGES: 100
};

function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ═══════════════════════════════════════════════════════════════════════
// ЗАГРУЗКА .ENV
// ═══════════════════════════════════════════════════════════════════════

function loadEnv() {
    if (fs.existsSync(CONFIG.API_KEY_FILE)) {
        const envContent = fs.readFileSync(CONFIG.API_KEY_FILE, 'utf8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^#][^=]+)=(.+)$/);
            if (match) {
                process.env[match[1].trim()] = match[2].trim();
            }
        });
    }
}

loadEnv();

const API_KEY = process.env.ZAI_API_KEY;

// ═══════════════════════════════════════════════════════════════════════
// ЗАГРУЗКА КОНФИГУРАЦИИ
// ═══════════════════════════════════════════════════════════════════════

let userConfig = {};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG.CONFIG_FILE)) {
            userConfig = JSON.parse(fs.readFileSync(CONFIG.CONFIG_FILE, 'utf8'));
        }
    } catch {
        // Игнорируем ошибки
    }
}

loadConfig();

// ═══════════════════════════════════════════════════════════════════════
// ВАЛИДАЦИЯ API КЛЮЧА
// ═══════════════════════════════════════════════════════════════════════

function validateApiKey() {
    if (!API_KEY) {
        console.error(chalk.red('\n❌ Ошибка: API ключ не найден!'));
        console.error(chalk.yellow('\n📝 Решение:'));
        console.error(chalk.gray('   1. Откройте файл .env'));
        console.error(chalk.gray('   2. Добавьте: ZAI_API_KEY=ваш_ключ'));
        console.error(chalk.gray('   3. Или установите переменную окружения\n'));
        process.exit(1);
    }

    // Проверка формата ключа (должен содержать точку)
    if (!API_KEY.includes('.') || API_KEY.length < 20) {
        console.error(chalk.red('\n❌ Ошибка: Неверный формат API ключа!'));
        console.error(chalk.gray('   Ключ должен выглядеть как: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxx\n'));
        process.exit(1);
    }

    return true;
}

validateApiKey();

// ═══════════════════════════════════════════════════════════════════════
// ГЛОБАЛЬНАЯ ОБРАБОТКА ОШИБОК
// ═══════════════════════════════════════════════════════════════════════

process.on('uncaughtException', (err) => {
    const logFile = path.join(__dirname, '.zai-error.log');
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Uncaught Exception:\n${err.stack}\n\n`;

    fs.appendFileSync(logFile, logEntry);

    console.error(chalk.red('\n❌ Произошла непредвиденная ошибка'));
    console.error(chalk.gray('   Лог сохранён в: .zai-error.log\n'));
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    const logFile = path.join(__dirname, '.zai-error.log');
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Unhandled Rejection:\n${reason}\n\n`;

    fs.appendFileSync(logFile, logEntry);

    console.error(chalk.red('\n❌ Ошибка в асинхронной операции'));
    console.error(chalk.gray('   Лог сохранён в: .zai-error.log\n'));
    process.exit(1);
});

// ═══════════════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════════════════════

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ═══════════════════════════════════════════════════════════════════════
// HTTP КЛИЕНТ С ТАЙМАУТОМ И РЕТРАЯМИ
// ═══════════════════════════════════════════════════════════════════════

async function fetchWithTimeout(url, options, timeout = CONFIG.TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
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

async function fetchWithRetry(url, options, retries = CONFIG.MAX_RETRIES) {
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Проверка сетевого подключения перед запросом
            if (!globalThis.navigator?.onLine && typeof globalThis.navigator !== 'undefined') {
                throw new Error('Отсутствует сетевое подключение');
            }

            const response = await fetchWithTimeout(url, options);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));

                // 401 - неверный ключ
                if (response.status === 401) {
                    throw new Error('Неверный API ключ (401). Проверьте .env файл.');
                }

                // 429 - rate limit с экспоненциальным backoff
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') || (attempt * 2);
                    console.log(`\n⏳ Rate limit. Ожидание ${retryAfter}с...\n`);
                    await sleep(retryAfter * 1000);
                    continue;
                }

                throw new Error(`API Error ${response.status}: ${errorData.message || response.statusText}`);
            }

            return response;

        } catch (error) {
            lastError = error;

            // Не ретраим ошибки аутентификации и таймауты
            if (error.message.includes('401') || error.message.includes('Таймаут') || error.message.includes('сетевое')) {
                throw error;
            }

            if (attempt < retries) {
                const delay = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1);
                console.log(`\n⚠️ Ошибка: ${error.message}`);
                console.log(`🔄 Попытка ${attempt + 1} из ${retries} через ${delay / 1000}с...\n`);
                await sleep(delay);
            }
        }
    }

    throw lastError || new Error('Неизвестная ошибка');
}

// ═══════════════════════════════════════════════════════════════════════
// ПОДСВЕТКА СИНТАКСИСА (с использованием chalk)
// ═══════════════════════════════════════════════════════════════════════

function highlightSyntax(code, _lang = '') {
    if (!process.stdout.isTTY) {return code;} // Не красим если не терминал

    let highlighted = code;

    // Ключевые слова
    const keywords = /\b(const|let|var|function|return|if|else|for|while|class|import|from|export|default|async|await|try|catch|throw|new|this|typeof|instanceof|def|print|with|except|raise|lambda|yield|global|nonlocal|pass|break|continue|in|is|and|or|not|null|undefined|true|false|None|True|False)\b/g;
    highlighted = highlighted.replace(keywords, chalk.magenta('$1'));

    // Строки
    highlighted = highlighted.replace(/(["'`])(?:(?!\1)[\\].)*?\1/g, chalk.green('$&'));

    // Числа
    highlighted = highlighted.replace(/\b\d+(\.\d+)?\b/g, chalk.yellow('$&'));

    // Комментарии
    highlighted = highlighted.replace(/(\/\/.*$|#.*$)/gm, chalk.gray('$1'));

    // Функции
    highlighted = highlighted.replace(/\b([a-zA-Z_]\w*)(?=\s*\()/g, chalk.cyan('$1'));

    return highlighted;
}

// ═══════════════════════════════════════════════════════════════════════
// ПРОГРЕСС БАР (с использованием cli-progress)
// ═══════════════════════════════════════════════════════════════════════

function createProgressBar(total) {
    const bar = new SingleBar({
        format: chalk.cyan('📊 [') + chalk.green('{bar}') + chalk.cyan(']') + ' {percentage}% | {value}/{total}',
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true
    });
    bar.start(total, 0);
    return {
        update: (increment = 1) => bar.increment(increment),
        done: () => bar.stop()
    };
}

// ═══════════════════════════════════════════════════════════════════════
// ИСТОРИЯ ЧАТА
// ═══════════════════════════════════════════════════════════════════════

function loadChatHistory() {
    try {
        if (fs.existsSync(CONFIG.HISTORY_FILE)) {
            const data = fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch {
        // Игнорируем ошибки
    }
    return [];
}

const saveChatHistoryDebounced = debounce((history) => {
    try {
        const trimmed = history.slice(-CONFIG.MAX_HISTORY_MESSAGES);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch {
        // Игнорируем ошибки
    }
}, 500);

function saveChatHistory(history) {
    try {
        const trimmed = history.slice(-CONFIG.MAX_HISTORY_MESSAGES);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch {
        // Игнорируем ошибки
    }
}

// ═══════════════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ═══════════════════════════════════════════════════════════════════════

let conversationHistory = loadChatHistory();
let currentModel = 'glm-4';

// ═══════════════════════════════════════════════════════════════════════
// СПРАВКА ДЛЯ ИНТЕРАКТИВНОГО РЕЖИМА
// ═══════════════════════════════════════════════════════════════════════

function showInteractiveHelp() {
    console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════╗
║  КОМАНДЫ ИНТЕРАКТИВНОГО РЕЖИМА:                           ║
║    /help, /h, /?          → Справка                       ║
║    /clear, /c             → Очистить историю              ║
║    /model <name>          → Сменить модель                ║
║    /models                → Список моделей                ║
║    /history               → Показать историю              ║
║    /save <file>           → Сохранить историю             ║
║    /load <file>           → Загрузить историю             ║
║    /cache                 → Очистить кэш файлов           ║
║    /export <file> [fmt]   → Экспорт в MD/HTML/TXT         ║
║    /config                → Показать настройки             ║
║    /exit, /quit, /q       → Выход                         ║
╚═══════════════════════════════════════════════════════════╝
`));
}

// ═══════════════════════════════════════════════════════════════════════
// COMMANDER CLI
// ═══════════════════════════════════════════════════════════════════════

const program = new Command();

program
    .name('zai')
    .description('CLI для работы с z.ai (Zhipu AI / GLM) API')
    .version(pkg.version)
    .argument('[query]', 'Запрос к AI')
    .option('-m, --model <name>', 'Модель', 'glm-4')
    .option('-c, --create <description>', 'Создать проект по описанию')
    .option('-i, --init <template>', 'Инициализировать шаблон проекта')
    .option('-p, --project <task>', 'Работа с текущим проектом')
    .option('-r, --refactor <file>', 'Рефакторинг файла')
    .option('-a, --analyze <path>', 'Анализ кода')
    .option('-e, --explain <file>', 'Объяснить код')
    .option('-t, --test <file>', 'Создать тесты')
    .option('-d, --doc <file>', 'Создать документацию')
    .option('--fix <file>', 'Исправить ошибки в файле')
    .option('--security [path]', 'Проверка безопасности')
    .action(async (query, options) => {
        // Режимы работы
        if (options.create) {
            await createProject(options.create);
            return;
        }

        if (options.init) {
            await initTemplate(options.init);
            return;
        }

        if (options.project) {
            await projectMode(options.project);
            return;
        }

        if (options.refactor) {
            await refactorFile(options.refactor);
            return;
        }

        if (options.analyze) {
            await analyzePath(options.analyze);
            return;
        }

        if (options.explain) {
            await explainFile(options.explain);
            return;
        }

        if (options.test) {
            await createTests(options.test);
            return;
        }

        if (options.doc) {
            await createDocs(options.doc);
            return;
        }

        if (options.fix) {
            await fixFile(options.fix);
            return;
        }

        if (options.security !== undefined) {
            await securityAudit(options.security || '.');
            return;
        }

        // Одиночный запрос или интерактивный режим
        if (query) {
            await singleMode(query, options.model);
        } else {
            await interactiveMode();
        }
    });

program.parse(process.argv);

// ═══════════════════════════════════════════════════════════════════════
// CHAT ФУНКЦИЯ С РЕТРАЯМИ
// ═══════════════════════════════════════════════════════════════════════

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

async function chat(messages, model = 'glm-4', systemPrompt = null, streaming = false) {
    validateMessages(messages);

    const requestId = generateRequestId();
    const allMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'X-Request-ID': requestId
        },
        body: JSON.stringify({
            model: model,
            messages: allMessages,
            stream: streaming,
            request_id: requestId
        })
    };

    const response = await fetchWithRetry(CONFIG.API_URL, options);

    if (streaming) {
        return response;
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Некорректный формат ответа API');
    }

    return data.choices[0].message.content;
}

// ═══════════════════════════════════════════════════════════════════════
// STREAMING ФУНКЦИЯ (потоковая передача ответов)
// ═══════════════════════════════════════════════════════════════════════

async function* chatStream(messages, model = 'glm-4', systemPrompt = null) {
    validateMessages(messages);

    const requestId = generateRequestId();
    const allMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'X-Request-ID': requestId
        },
        body: JSON.stringify({
            model: model,
            messages: allMessages,
            stream: true,
            request_id: requestId
        })
    };

    const response = await fetchWithRetry(CONFIG.API_URL, options);

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
                    chunkTimeout = setTimeout(() => reject(new Error('Таймаут получения данных')), 30000);
                })
            ]);
            clearTimeout(chunkTimeout);

            if (done) {break;}

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') {continue;}
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
        if (chunkTimeout) {clearTimeout(chunkTimeout);}
        if (error.message === 'Таймаут получения данных') {
            throw new Error('Превышено время ожидания ответа от сервера (30с)', { cause: error });
        }
        throw error;
    } finally {
        if (chunkTimeout) {clearTimeout(chunkTimeout);}
        reader.releaseLock();
    }
}

// ═══════════════════════════════════════════════════════════════════════
// ЧТЕНИЕ ФАЙЛОВ
// ═══════════════════════════════════════════════════════════════════════

// Кэш для чтения файлов
const fileCache = new Map();
const FILE_CACHE_MAX_SIZE = 100;

function clearFileCache() {
    fileCache.clear();
}

function evictOldestFromCache() {
    if (fileCache.size > FILE_CACHE_MAX_SIZE) {
        const firstKey = fileCache.keys().next().value;
        fileCache.delete(firstKey);
    }
}

function readFilesRecursively(dir, maxFiles = 50, maxTotalSize = 500000) {
    const result = [];
    let totalSize = 0;
    const CODE_EXTENSIONS = new Set([
        '.js', '.ts', '.py', '.php', '.java', '.cpp', '.c', '.h',
        '.cs', '.rb', '.go', '.rs', '.swift', '.kt', '.vue',
        '.jsx', '.tsx', '.html', '.css', '.scss', '.json',
        '.yaml', '.yml', '.md', '.txt', '.sql', '.sh', '.bat'
    ]);

    function walk(currentDir) {
        if (result.length >= maxFiles) {return;}

        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') {continue;}

                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();

                    if (CODE_EXTENSIONS.has(ext) || !ext) {
                        try {
                            // Проверка кэша
                            if (fileCache.has(fullPath)) {
                                const cachedContent = fileCache.get(fullPath);
                                if (totalSize + cachedContent.length <= maxTotalSize) {
                                    result.push({ path: fullPath, content: cachedContent });
                                    totalSize += cachedContent.length;
                                } else {
                                    return;
                                }
                                continue;
                            }

                            const content = fs.readFileSync(fullPath, 'utf8');
                            if (totalSize + content.length <= maxTotalSize) {
                                evictOldestFromCache();
                                fileCache.set(fullPath, content);
                                result.push({ path: fullPath, content });
                                totalSize += content.length;
                            } else {
                                return;
                            }
                        } catch {
                            // Пропускаем бинарные файлы
                        }
                    }
                }
            }
        } catch {
            // Игнорируем ошибки доступа
        }
    }

    walk(dir);
    return result;
}

function getFileContent(filePath) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Файл не найден: ${absolutePath}`);
    }

    // Проверка кэша
    if (fileCache.has(absolutePath)) {
        return {
            path: absolutePath,
            content: fileCache.get(absolutePath)
        };
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    evictOldestFromCache();
    fileCache.set(absolutePath, content);

    return {
        path: absolutePath,
        content
    };
}

// ═══════════════════════════════════════════════════════════════════════
// ПАРСИНГ ОТВЕТОВ AI
// ═══════════════════════════════════════════════════════════════════════

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
                language: lang
            });
        }
    }
    
    while ((match = simpleFilePattern.exec(response)) !== null) {
        const filePath = match[1].trim();
        const content = match[2].trim();
        
        if (filePath && content) {
            files.push({
                path: path.join(baseDir, filePath),
                content: content
            });
        }
    }
    
    if (files.length === 0) {
        const codeBlockMatch = response.match(/```(\w+)?\s*\n([\s\S]*?)```/);
        if (codeBlockMatch) {
            const extMap = { python: '.py', javascript: '.js', typescript: '.ts', 
                           php: '.php', java: '.java', cpp: '.cpp', c: '.c' };
            const lang = codeBlockMatch[1] || '';
            const ext = extMap[lang.toLowerCase()] || '.txt';
            
            files.push({
                path: path.join(baseDir, 'output' + ext),
                content: codeBlockMatch[2].trim()
            });
        }
    }
    
    return files;
}

// ═══════════════════════════════════════════════════════════════════════
// РЕЖИМ: CREATE
// ═══════════════════════════════════════════════════════════════════════

async function createProject(description) {
    console.log('\n🚀 Создание проекта...\n');
    console.log('📝 Описание:', description);
    console.log('\n🤔 Анализирую запрос и генерирую структуру...\n');
    
    const systemPrompt = `Ты опытный разработчик, который создаёт проекты и файлы по описанию.

ВАЖНО: Для каждого файла используй формат:
\`\`\`<язык>
// FILE: <путь/к/файлу.расширение>
<код файла>
\`\`\`

Пример:
\`\`\`python
// FILE: main.py
print("Hello")
\`\`\`

\`\`\`javascript
// FILE: src/app.js
console.log("Hi");
\`\`\`

Создавай полную рабочую структуру проекта. Включай все необходимые файлы.`;

    const response = await chat(
        [{ role: 'user', content: `Создай проект: ${description}` }],
        currentModel,
        systemPrompt
    );
    
    console.log('\n📄 Ответ AI:\n');
    console.log(highlightSyntax(response));
    
    const projectDir = path.join(process.cwd(), 'generated-project');
    const files = extractFilesFromResponse(response, projectDir);
    
    if (files.length > 0) {
        console.log('\n\n💾 Сохранение файлов...\n');
        const progress = createProgressBar(files.length);
        
        for (const file of files) {
            const dir = path.dirname(file.path);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(file.path, file.content, 'utf8');
            progress.update();
        }
        
        console.log(`\n✨ Проект создан в: ${projectDir}\n`);
    } else {
        console.log('\n⚠️ Не удалось извлечь файлы из ответа. Попробуйте уточнить запрос.\n');
    }
}

// ═══════════════════════════════════════════════════════════════════════
// РЕЖИМ: INIT (ШАБЛОНЫ)
// ═══════════════════════════════════════════════════════════════════════

const TEMPLATES = {
    'node': {
        name: 'Node.js проект',
        files: [
            { path: 'package.json', content: '{\n  "name": "project",\n  "version": "1.0.0",\n  "main": "index.js",\n  "scripts": {\n    "start": "node index.js",\n    "dev": "node --watch index.js"\n  }\n}\n' },
            { path: 'index.js', content: 'console.log("Hello, World!");\n' },
            { path: '.gitignore', content: 'node_modules/\n.env\n' },
            { path: 'README.md', content: '# Project\n\nОписание проекта\n' }
        ]
    },
    'python': {
        name: 'Python проект',
        files: [
            { path: 'main.py', content: 'def main():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    main()\n' },
            { path: 'requirements.txt', content: '# Зависимости\n' },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\n.venv/\n.env\n' },
            { path: 'README.md', content: '# Python Project\n\nОписание проекта\n' }
        ]
    },
    'react': {
        name: 'React проект',
        files: [
            { path: 'package.json', content: '{\n  "name": "react-app",\n  "version": "0.1.0",\n  "private": true,\n  "dependencies": {\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  },\n  "scripts": {\n    "start": "react-scripts start",\n    "build": "react-scripts build"\n  }\n}\n' },
            { path: 'public/index.html', content: '<!DOCTYPE html>\n<html lang="ru">\n<head>\n  <meta charset="UTF-8">\n  <title>React App</title>\n</head>\n<body>\n  <div id="root"></div>\n</body>\n</html>\n' },
            { path: 'src/index.js', content: 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nconst root = ReactDOM.createRoot(document.getElementById("root"));\nroot.render(<App />);\n' },
            { path: 'src/App.js', content: 'function App() {\n  return (\n    <div className="App">\n      <h1>Hello, React!</h1>\n    </div>\n  );\n}\n\nexport default App;\n' },
            { path: '.gitignore', content: 'node_modules/\nbuild/\n.env\n' }
        ]
    },
    'vue': {
        name: 'Vue 3 проект',
        files: [
            { path: 'package.json', content: '{\n  "name": "vue-app",\n  "version": "0.1.0",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build"\n  },\n  "dependencies": {\n    "vue": "^3.3.0"\n  }\n}\n' },
            { path: 'index.html', content: '<!DOCTYPE html>\n<html lang="ru">\n<head><title>Vue App</title></head>\n<body><div id="app"></div><script type="module" src="/src/main.js"></script></body>\n</html>\n' },
            { path: 'src/main.js', content: 'import { createApp } from "vue";\nimport App from "./App.vue";\n\ncreateApp(App).mount("#app");\n' },
            { path: 'src/App.vue', content: '<template>\n  <div>\n    <h1>{{ message }}</h1>\n  </div>\n</template>\n\n<script setup>\nimport { ref } from "vue";\nconst message = ref("Hello, Vue 3!");\n</script>\n' },
            { path: 'vite.config.js', content: 'import { defineConfig } from "vite";\nimport vue from "@vitejs/plugin-vue";\n\nexport default defineConfig({\n  plugins: [vue()]\n});\n' }
        ]
    },
    'flask': {
        name: 'Flask приложение',
        files: [
            { path: 'app.py', content: 'from flask import Flask\n\napp = Flask(__name__)\n\n@app.route("/")\ndef hello():\n    return "Hello, Flask!"\n\nif __name__ == "__main__":\n    app.run(debug=True)\n' },
            { path: 'requirements.txt', content: 'flask>=2.0.0\n' },
            { path: 'templates/index.html', content: '<!DOCTYPE html>\n<html>\n<head><title>Flask App</title></head>\n<body><h1>Hello!</h1></body>\n</html>\n' },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\n.venv/\n.env\n' }
        ]
    },
    'express': {
        name: 'Express.js API',
        files: [
            { path: 'package.json', content: '{\n  "name": "express-api",\n  "version": "1.0.0",\n  "main": "server.js",\n  "scripts": {\n    "start": "node server.js",\n    "dev": "nodemon server.js"\n  },\n  "dependencies": {\n    "express": "^4.18.0"\n  }\n}\n' },
            { path: 'server.js', content: 'const express = require("express");\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\napp.use(express.json());\n\napp.get("/", (req, res) => {\n  res.json({ message: "Hello, Express!" });\n});\n\napp.listen(PORT, () => {\n  console.log(`Server running on port ${PORT}`);\n});\n' },
            { path: '.gitignore', content: 'node_modules/\n.env\n' },
            { path: '.env', content: 'PORT=3000\n' }
        ]
    },
    'telegram-bot': {
        name: 'Telegram бот (Python)',
        files: [
            { path: 'bot.py', content: 'import telebot\nimport os\nfrom dotenv import load_dotenv\n\nload_dotenv()\n\nBOT_TOKEN = os.getenv("BOT_TOKEN")\nbot = telebot.TeleBot(BOT_TOKEN)\n\n@bot.message_handler(commands=["start"])\ndef handle_start(message):\n    bot.reply_to(message, "Привет! Я бот.")\n\n@bot.message_handler(func=lambda m: True)\ndef handle_all(message):\n    bot.reply_to(message, f"Вы написали: {message.text}")\n\nif __name__ == "__main__":\n    bot.infinity_polling()\n' },
            { path: 'requirements.txt', content: 'pyTelegramBotAPI>=4.0.0\npython-dotenv>=1.0.0\n' },
            { path: '.env', content: 'BOT_TOKEN=your_bot_token_here\n' },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\n.env\n' }
        ]
    },
    'cli': {
        name: 'CLI утилита (Node.js)',
        files: [
            { path: 'package.json', content: '{\n  "name": "my-cli",\n  "version": "1.0.0",\n  "bin": {\n    "mycli": "./cli.js"\n  },\n  "scripts": {\n    "start": "node cli.js"\n  }\n}\n' },
            { path: 'cli.js', content: '#!/usr/bin/env node\n\nconst args = process.argv.slice(2);\n\nconsole.log("CLI запущен с аргументами:", args);\n' },
            { path: '.gitignore', content: 'node_modules/\n' }
        ]
    },
    'nextjs': {
        name: 'Next.js 14 проект',
        files: [
            { path: 'package.json', content: '{\n  "name": "next-app",\n  "version": "0.1.0",\n  "scripts": {\n    "dev": "next dev",\n    "build": "next build",\n    "start": "next start"\n  },\n  "dependencies": {\n    "next": "^14.0.0",\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  }\n}\n' },
            { path: 'app/page.js', content: 'export default function Home() {\n  return (\n    <main>\n      <h1>Hello, Next.js 14!</h1>\n    </main>\n  );\n}\n' },
            { path: 'app/layout.js', content: 'export const metadata = {\n  title: "Next.js App",\n  description: "Generated with z.ai CLI"\n};\n\nexport default function RootLayout({ children }) {\n  return (\n    <html lang="ru">\n      <body>{children}</body>\n    </html>\n  );\n}\n' },
            { path: 'next.config.js', content: '/** @type {import("next").NextConfig} */\nconst nextConfig = {};\n\nmodule.exports = nextConfig;\n' },
            { path: '.gitignore', content: 'node_modules/\n.next/\n.env\n' }
        ]
    },
    'fastapi': {
        name: 'FastAPI проект',
        files: [
            { path: 'main.py', content: 'from fastapi import FastAPI\n\napp = FastAPI(title="My API")\n\n@app.get("/")\ndef read_root():\n    return {"Hello": "World"}\n\n@app.get("/items/{item_id}")\ndef read_item(item_id: int, q: str = None):\n    return {"item_id": item_id, "q": q}\n' },
            { path: 'requirements.txt', content: 'fastapi>=0.104.0\nuvicorn>=0.24.0\n' },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\n.venv/\n.env\n' }
        ]
    },
    'django': {
        name: 'Django проект',
        files: [
            { path: 'requirements.txt', content: 'django>=4.2.0\n' },
            { path: 'manage.py', content: '#!/usr/bin/env python\nimport os\nimport sys\n\ndef main():\n    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")\n    try:\n        from django.core.management import execute_from_command_line\n    except ImportError as exc:\n        raise ImportError("Couldn\'t import Django.") from exc\n    execute_from_command_line(sys.argv)\n\nif __name__ == "__main__":\n    main()\n' },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\ndb.sqlite3\n.env\n' }
        ]
    },
    'go': {
        name: 'Go проект',
        files: [
            { path: 'main.go', content: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, Go!")\n}\n' },
            { path: 'go.mod', content: 'module example.com/project\n\ngo 1.21\n' },
            { path: '.gitignore', content: '*.exe\n*.exe~\n*.dll\n*.so\n*.dylib\n*.test\n*.out\nvendor/\n' }
        ]
    },
    'rust': {
        name: 'Rust проект',
        files: [
            { path: 'Cargo.toml', content: '[package]\nname = "my_project"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n' },
            { path: 'src/main.rs', content: 'fn main() {\n    println!("Hello, Rust!");\n}\n' },
            { path: '.gitignore', content: '/target\n**/*.rs.bk\nCargo.lock\n' }
        ]
    }
};

async function initTemplate(templateName) {
    const template = TEMPLATES[templateName.toLowerCase()];
    
    if (!template) {
        console.log('\n❌ Шаблон не найден.\n');
        console.log('📋 Доступные шаблоны:\n');
        Object.keys(TEMPLATES).forEach(key => {
            console.log(`  • ${key} — ${TEMPLATES[key].name}`);
        });
        console.log('\n');
        return;
    }
    
    const targetDir = path.join(process.cwd(), templateName);
    console.log(`\n📦 Инициализация шаблона: ${template.name}\n`);
    
    const progress = createProgressBar(template.files.length);
    
    for (const file of template.files) {
        const filePath = path.join(targetDir, file.path);
        const dir = path.dirname(filePath);
        
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, file.content, 'utf8');
        progress.update();
    }
    
    console.log(`\n✨ Шаблон создан в: ${targetDir}\n`);
    
    if (templateName.toLowerCase() === 'telegram-bot') {
        console.log('📌 Следующие шаги:');
        console.log('  1. Откройте .env и укажите BOT_TOKEN');
        console.log('  2. npm install или pip install -r requirements.txt');
        console.log('  3. Запустите: node cli.js или python bot.py\n');
    }
}

// ═══════════════════════════════════════════════════════════════════════
// РЕЖИМ: PROJECT
// ═══════════════════════════════════════════════════════════════════════

async function projectMode(task) {
    console.log('\n📁 Работа с проектом...\n');
    console.log('📝 Задача:', task);
    
    console.log('\n🔍 Сканирование проекта...\n');
    const files = readFilesRecursively(process.cwd());
    
    console.log(`📄 Найдено файлов: ${files.length}\n`);
    
    const systemPrompt = `Ты опытный разработчик, помогаешь с задачами в проекте.
    
У пользователя есть проект с файлами. Он хочет: ${task}

Файлы проекта:
${files.map(f => `\n=== ${f.path} ===\n${f.content}`).join('\n')}

Дай конкретный ответ с кодом и инструкциями. Для изменений файлов используй формат:
\`\`\`<язык>
// FILE: <путь>
<новый код>
\`\`\``;

    const response = await chat(
        [{ role: 'user', content: `Выполни задачу: ${task}` }],
        currentModel,
        systemPrompt
    );
    
    console.log('\n🤖 Ответ AI:\n');
    console.log(highlightSyntax(response));
    
    const filesToUpdate = extractFilesFromResponse(response, process.cwd());
    
    if (filesToUpdate.length > 0) {
        console.log('\n\n💾 Найденные файлы для обновления:\n');
        filesToUpdate.forEach(f => console.log(`  • ${f.path}`));
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question('\n💾 Применить изменения? (y/n): ', (answer) => {
            rl.close();
            
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                for (const file of filesToUpdate) {
                    const dir = path.dirname(file.path);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    fs.writeFileSync(file.path, file.content, 'utf8');
                    console.log(`  ✅ ${file.path}`);
                }
                console.log('\n✨ Изменения применены!\n');
            } else {
                console.log('\n⏭️ Изменения отменены.\n');
            }
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════
// РЕЖИМ: REFACTOR
// ═══════════════════════════════════════════════════════════════════════

async function refactorFile(filePath) {
    console.log('\n🔧 Рефакторинг файла...\n');
    
    try {
        const file = getFileContent(filePath);
        console.log(`📄 Файл: ${file.path}\n`);
        
        const systemPrompt = `Ты опытный разработчик, делаешь рефакторинг кода.
Проанализируй код и предложи улучшения:
- Улучши читаемость
- Примени best practices
- Оптимизируй производительность
- Улучши архитектуру

Верни полный обновлённый код в формате:
\`\`\`<язык>
// FILE: ${file.path}
<обновлённый код>
\`\`\`

Также кратко опиши что изменилось.`;

        const response = await chat(
            [{ role: 'user', content: `Сделай рефакторинг этого кода:\n\n${file.content}` }],
            currentModel,
            systemPrompt
        );
        
        console.log('\n🤖 Предложения по рефакторингу:\n');
        console.log(highlightSyntax(response));
        
        const files = extractFilesFromResponse(response, path.dirname(file.path));
        
        if (files.length > 0) {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            rl.question('\n💾 Применить изменения? (y/n): ', (answer) => {
                rl.close();
                
                if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                    fs.writeFileSync(files[0].path, files[0].content, 'utf8');
                    console.log(`\n✅ Файл обновлён: ${files[0].path}\n`);
                } else {
                    console.log('\n⏭️ Изменения отменены.\n');
                }
            });
        }
    } catch (error) {
        console.error(`❌ Ошибка: ${error.message}\n`);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// РЕЖИМ: ANALYZE
// ═══════════════════════════════════════════════════════════════════════

async function analyzePath(targetPath) {
    console.log('\n🔍 Анализ кода...\n');
    
    const absolutePath = path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);
    
    if (!fs.existsSync(absolutePath)) {
        console.error(`❌ Путь не найден: ${absolutePath}\n`);
        return;
    }

    // eslint-disable-next-line no-useless-assignment
    let content = '';
    // eslint-disable-next-line no-useless-assignment
    let description = '';

    if (fs.statSync(absolutePath).isDirectory()) {
        const files = readFilesRecursively(absolutePath);
        content = files.map(f => `=== ${f.path} ===\n${f.content}`).join('\n\n');
        description = `Папка: ${absolutePath}\nФайлов: ${files.length}`;
    } else {
        const file = getFileContent(targetPath);
        content = file.content;
        description = `Файл: ${file.path}`;
    }
    
    console.log(`📄 ${description}\n`);
    
    const systemPrompt = `Ты опытный разработчик, делаешь код-ревью.
Проанализируй код и дай развёрнутый ответ:

1. Найди проблемы и баги
2. Оцени качество кода
3. Предложи улучшения
4. Оцени безопасность
5. Рекомендации по архитектуре

${description}

Код:
${content}`;

    const response = await chat(
        [{ role: 'user', content: 'Проанализируй этот код и дай развёрнутый код-ревью.' }],
        currentModel,
        systemPrompt
    );
    
    console.log('\n🤖 Анализ:\n');
    console.log(highlightSyntax(response));
    console.log('\n');
}

// ═══════════════════════════════════════════════════════════════════════
// РЕЖИМ: EXPLAIN
// ═══════════════════════════════════════════════════════════════════════

async function explainFile(filePath) {
    console.log('\n📖 Объяснение кода...\n');
    
    try {
        const file = getFileContent(filePath);
        console.log(`📄 Файл: ${file.path}\n`);
        
        const response = await chat(
            [{ role: 'user', content: `Объясни подробно как работает этот код:\n\n${file.content}` }],
            currentModel,
            'Ты опытный разработчик, который объясняет код понятно и подробно. Разбери каждую часть кода.'
        );
        
        console.log('\n🤖 Объяснение:\n');
        console.log(highlightSyntax(response));
        console.log('\n');
    } catch (error) {
        console.error(`❌ Ошибка: ${error.message}\n`);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// РЕЖИМ: TEST
// ═══════════════════════════════════════════════════════════════════════

async function createTests(filePath) {
    console.log('\n🧪 Создание тестов...\n');
    
    try {
        const file = getFileContent(filePath);
        console.log(`📄 Файл: ${file.path}\n`);
        
        const ext = path.extname(filePath).toLowerCase();
        const testFrameworks = {
            '.js': 'Jest',
            '.ts': 'Jest + TypeScript',
            '.py': 'pytest',
            '.php': 'PHPUnit',
            '.java': 'JUnit',
            '.rb': 'RSpec'
        };
        
        const framework = testFrameworks[ext] || 'unittest';
        
        const response = await chat(
            [{ role: 'user', content: `Создай полные тесты для этого кода. Используй ${framework}. Верни код тестов в формате:\n\`\`\`\n// FILE: <путь к тест-файлу>\n<код тестов>\n\`\`\`\n\nКод:\n${file.content}` }],
            currentModel,
            'Ты опытный разработчик, пишешь качественные тесты с покрытием всех случаев.'
        );
        
        console.log('\n🤖 Тесты:\n');
        console.log(highlightSyntax(response));
        
        const files = extractFilesFromResponse(response, path.dirname(file.path));
        
        if (files.length > 0) {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            rl.question('\n💾 Сохранить тесты? (y/n): ', (answer) => {
                rl.close();
                
                if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                    for (const f of files) {
                        const dir = path.dirname(f.path);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        fs.writeFileSync(f.path, f.content, 'utf8');
                        console.log(`  ✅ ${f.path}`);
                    }
                    console.log('\n✨ Тесты сохранены!\n');
                } else {
                    console.log('\n⏭️ Сохранение отменено.\n');
                }
            });
        }
    } catch (error) {
        console.error(`❌ Ошибка: ${error.message}\n`);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// РЕЖИМ: DOC
// ═══════════════════════════════════════════════════════════════════════

async function createDocs(filePath) {
    console.log('\n📚 Создание документации...\n');
    
    try {
        const file = getFileContent(filePath);
        console.log(`📄 Файл: ${file.path}\n`);
        
        const response = await chat(
            [{ role: 'user', content: `Создай подробную документацию для этого кода (README.md с описанием, примерами использования, API и т.д.):\n\n${file.content}` }],
            currentModel,
            'Ты технический писатель, создаёшь понятную и полную документацию.'
        );
        
        console.log('\n🤖 Документация:\n');
        console.log(highlightSyntax(response));
        
        const readmePath = path.join(path.dirname(file.path), 'README.md');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question('\n💾 Сохранить в README.md? (y/n): ', (answer) => {
            rl.close();
            
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                let docContent = response;
                const match = response.match(/```markdown?\n([\s\S]*?)```/);
                if (match) {
                    docContent = match[1].trim();
                }
                
                fs.writeFileSync(readmePath, docContent, 'utf8');
                console.log(`\n✅ Документация сохранена: ${readmePath}\n`);
            } else {
                console.log('\n⏭️ Сохранение отменено.\n');
            }
        });
    } catch (error) {
        console.error(`❌ Ошибка: ${error.message}\n`);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// РЕЖИМ: FIX (АВТО-ИСПРАВЛЕНИЕ БАГОВ)
// ═══════════════════════════════════════════════════════════════════════

async function fixFile(filePath) {
    console.log('\n🔧 Исправление багов...\n');

    try {
        const file = getFileContent(filePath);
        console.log(`📄 Файл: ${file.path}\n`);

        const systemPrompt = `Ты опытный разработчик, находишь и исправляешь баги в коде.
Проанализируй код и найди:
- Логические ошибки
- Потенциальные баги
- Проблемы с обработкой ошибок
- Уязвимости безопасности
- Проблемы производительности

Верни исправленный код в формате:
\`\`\`<язык>
// FILE: ${file.path}
<исправленный код>
\`\`\`

Также кратко опиши что было исправлено.`;

        const response = await chat(
            [{ role: 'user', content: `Найди и исправь баги в этом коде:\n\n${file.content}` }],
            currentModel,
            systemPrompt
        );

        console.log('\n🤖 Исправления:\n');
        console.log(highlightSyntax(response));

        const files = extractFilesFromResponse(response, path.dirname(file.path));

        if (files.length > 0) {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question('\n💾 Применить исправления? (y/n): ', (answer) => {
                rl.close();

                if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                    fs.writeFileSync(files[0].path, files[0].content, 'utf8');
                    console.log(`\n✅ Файл исправлен: ${files[0].path}\n`);
                } else {
                    console.log('\n⏭️ Исправления отменены.\n');
                }
            });
        }
    } catch (error) {
        console.error(`❌ Ошибка: ${error.message}\n`);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// РЕЖИМ: SECURITY (АУДИТ БЕЗОПАСНОСТИ)
// ═══════════════════════════════════════════════════════════════════════

async function securityAudit(targetPath) {
    console.log('\n🔒 Аудит безопасности...\n');

    const absolutePath = path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);

    if (!fs.existsSync(absolutePath)) {
        console.error(`❌ Путь не найден: ${absolutePath}\n`);
        return;
    }

    console.log('🔍 Сканирование файлов...\n');
    const files = fs.statSync(absolutePath).isDirectory()
        ? readFilesRecursively(absolutePath)
        : [getFileContent(targetPath)];

    console.log(`📄 Найдено файлов: ${files.length}\n`);

    const systemPrompt = `Ты эксперт по безопасности кода. Проанализируй код на наличие уязвимостей:

1. Инъекции (SQL, XSS, Command Injection)
2. Проблемы аутентификации и авторизации
3. Утечки чувствительных данных
4. Небезопасные зависимости
5. Конфигурационные ошибки
6. Проблемы с обработкой входных данных

Код для анализа:
${files.map(f => `\n=== ${f.path} ===\n${f.content}`).join('\n\n')}

Дай развёрнутый отчёт с уровнем критичности (Critical/High/Medium/Low) для каждой проблемы.`;

    const response = await chat(
        [{ role: 'user', content: 'Проведи аудит безопасности кода и найди все уязвимости.' }],
        currentModel,
        systemPrompt
    );

    console.log('\n🤖 Отчёт по безопасности:\n');
    console.log(highlightSyntax(response));
    console.log('\n');
}

// ═══════════════════════════════════════════════════════════════════════
// ИНТЕРАКТИВНЫЙ РЕЖИМ
// ═══════════════════════════════════════════════════════════════════════

async function interactiveMode() {
    // Автосохранение истории при выходе
    process.on('exit', () => {
        saveChatHistory(conversationHistory);
    });
    
    process.on('SIGINT', () => {
        saveChatHistory(conversationHistory);
        console.log('\n\n👋 До свидания!\n');
        process.exit(0);
    });

    console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════╗
║              🤖 z.ai CLI - Интерактивный чат              ║
║                   Модель: GLM-${currentModel.padEnd(12)}           ║
╠═══════════════════════════════════════════════════════════╣
║  Введите ${chalk.green('/help')} для списка команд, ${chalk.green('/exit')} для выхода${chalk.cyan('        ║')}
║  История автоматически сохраняется между сессиями         ║
║  ${chalk.green('Streaming:')} ${chalk.yellow(userConfig.streaming !== false ? 'включён' : 'выключен')}                                    ║
╚═══════════════════════════════════════════════════════════╝
`));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '👤 Вы > '
    });

    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();

        if (input.startsWith('/')) {
            const [cmd, ...cmdArgs] = input.split(/\s+/);
            const command = cmd.toLowerCase();

            switch (command) {
                case '/help':
                case '/h':
                case '/?':
                    showInteractiveHelp();
                    break;

                case '/clear':
                case '/c':
                    conversationHistory = [];
                    saveChatHistory(conversationHistory);
                    console.log('🧹 История очищена\n');
                    break;

                case '/cache':
                    clearFileCache();
                    console.log('🗑️ Кэш файлов очищен\n');
                    break;

                case '/model':
                    if (cmdArgs.length === 0) {
                        console.log(`📌 Текущая модель: ${currentModel}\n`);
                    } else {
                        currentModel = cmdArgs[0];
                        conversationHistory = [];
                        saveChatHistory(conversationHistory);
                        console.log(`✅ Модель изменена на: ${currentModel}\n`);
                    }
                    break;

                case '/models':
                    console.log(`
Доступные модели:
  • glm-4         → Флагманская (универсальная)
  • glm-4-flash   → Быстрая и лёгкая
  • glm-4-air     → Сбалансированная
  • glm-3-turbo   → Экономичная
  • glm-4v        → С поддержкой изображений
  • character-003 → Ролевые сценарии

`);
                    break;

                case '/history':
                    if (conversationHistory.length === 0) {
                        console.log('📭 История пуста\n');
                    } else {
                        console.log('\n📜 История диалога:\n');
                        conversationHistory.forEach((msg, i) => {
                            const role = msg.role === 'user' ? '👤 Вы' : '🤖 AI';
                            console.log(`${i + 1}. ${role}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}\n`);
                        });
                    }
                    break;

                case '/save':
                    if (cmdArgs.length === 0) {
                        console.log('⚠️ Укажите имя файла: /save chat.txt\n');
                    } else {
                        const filename = cmdArgs[0];
                        const filepath = path.join(__dirname, filename);
                        const content = conversationHistory.map((msg, i) => {
                            const role = msg.role === 'user' ? 'Вы' : 'AI';
                            return `[${i + 1}] ${role}: ${msg.content}`;
                        }).join('\n\n');
                        fs.writeFileSync(filepath, content, 'utf8');
                        console.log(`💾 История сохранена в: ${filepath}\n`);
                    }
                    break;

                case '/load':
                    if (cmdArgs.length === 0) {
                        console.log('⚠️ Укажите имя файла: /load chat.txt\n');
                    } else {
                        const filename = cmdArgs[0];
                        const filepath = path.join(__dirname, filename);
                        if (fs.existsSync(filepath)) {
                            const content = fs.readFileSync(filepath, 'utf8');
                            const lines = content.split('\n\n');
                            // eslint-disable-next-line no-shadow
                            conversationHistory = lines.map(line => {
                                const match = line.match(/^\[\d+\] (Вы|AI): (.*)/s);
                                if (match) {
                                    return {
                                        role: match[1] === 'Вы' ? 'user' : 'assistant',
                                        content: match[2]
                                    };
                                }
                                return null;
                            }).filter(Boolean);
                            console.log(`💾 История загружена из: ${filepath}\n`);
                        } else {
                            console.log(`❌ Файл не найден: ${filepath}\n`);
                        }
                    }
                    break;

                case '/export':
                    if (cmdArgs.length === 0) {
                        console.log(chalk.yellow('⚠️ Формат: /export <filename> [format]'));
                        console.log(chalk.gray('   Форматы: md (по умолчанию), html, txt\n'));
                        console.log(chalk.gray('   Примеры:'));
                        console.log(chalk.gray('     /export chat.md'));
                        console.log(chalk.gray('     /export chat.html html'));
                        console.log(chalk.gray('     /export chat.txt txt\n'));
                    } else {
                        const filename = cmdArgs[0];
                        const format = (cmdArgs[1] || 'md').toLowerCase();
                        const filepath = path.join(__dirname, filename);
                        
                        let content = '';
                        
                        if (format === 'md' || format === 'markdown') {
                            content = '# Диалог с z.ai CLI\n\n';
                            content += `*Дата экспорта: ${new Date().toLocaleString('ru-RU')}*\n\n`;
                            content += '---\n\n';
                            conversationHistory.forEach((msg, i) => {
                                const role = msg.role === 'user' ? '👤 Вы' : '🤖 AI';
                                content += `## ${role}\n\n${msg.content}\n\n`;
                                if (i < conversationHistory.length - 1) {
                                    content += '---\n\n';
                                }
                            });
                        } else if (format === 'html') {
                            content = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Диалог с z.ai CLI</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
        .message { margin: 20px 0; padding: 15px; border-radius: 8px; }
        .user { background: #264f78; }
        .assistant { background: #1e3a5f; }
        .role { font-weight: bold; margin-bottom: 10px; color: #569cd6; }
        .content { white-space: pre-wrap; line-height: 1.6; }
        .timestamp { color: #808080; font-size: 0.9em; }
        pre { background: #1a1a1a; padding: 15px; border-radius: 5px; overflow-x: auto; }
        code { font-family: 'Consolas', 'Monaco', monospace; }
    </style>
</head>
<body>
    <h1>🤖 Диалог с z.ai CLI</h1>
    <p class="timestamp">Экспортировано: ${new Date().toLocaleString('ru-RU')}</p>
`;
                            conversationHistory.forEach((msg) => {
                                const roleClass = msg.role === 'user' ? 'user' : 'assistant';
                                const role = msg.role === 'user' ? '👤 Вы' : '🤖 AI';
                                const escapedContent = msg.content
                                    .replace(/&/g, '&amp;')
                                    .replace(/</g, '&lt;')
                                    .replace(/>/g, '&gt;');
                                content += `
    <div class="message ${roleClass}">
        <div class="role">${role}</div>
        <div class="content">${escapedContent}</div>
    </div>
`;
                            });
                            content += `
</body>
</html>`;
                        } else {
                            // txt формат
                            content = conversationHistory.map((msg, i) => {
                                const role = msg.role === 'user' ? 'Вы' : 'AI';
                                return `[${i + 1}] ${role}: ${msg.content}`;
                            }).join('\n\n');
                        }
                        
                        fs.writeFileSync(filepath, content, 'utf8');
                        console.log(chalk.green(`💾 Диалог экспортирован в: ${filepath}\n`));
                    }
                    break;

                case '/config':
                    console.log(chalk.cyan('\n⚙️ Конфигурация z.ai CLI:\n'));
                    console.log(chalk.gray('Файл конфигурации: ') + chalk.yellow(CONFIG.CONFIG_FILE));
                    console.log(chalk.gray('Существует: ') + (fs.existsSync(CONFIG.CONFIG_FILE) ? chalk.green('да') : chalk.red('нет')));
                    console.log('');
                    
                    if (Object.keys(userConfig).length > 0) {
                        console.log(chalk.gray('Текущие настройки:\n'));
                        Object.entries(userConfig).forEach(([key, value]) => {
                            console.log(`  ${chalk.cyan(key)}: ${chalk.yellow(JSON.stringify(value))}`);
                        });
                    } else {
                        console.log(chalk.gray('Используются настройки по умолчанию.\n'));
                        console.log(chalk.gray('Создайте файл zai.config.json для кастомизации:\n'));
                        console.log(chalk.green(`  {
    "model": "glm-4",
    "streaming": true,
    "theme": "dark",
    "exclude": ["node_modules", ".git"],
    "maxFiles": 50,
    "autoSaveHistory": true
  }\n`));
                    }
                    console.log('');
                    break;

                case '/exit':
                case '/quit':
                case '/q':
                    saveChatHistory(conversationHistory);
                    console.log('\n👋 До свидания!\n');
                    rl.close();
                    process.exit(0);
                    break;

                default:
                    console.log(`⚠️ Неизвестная команда: ${command}. Введите /help\n`);
            }

            rl.prompt();
            return;
        }

        if (!input) {
            rl.prompt();
            return;
        }

        conversationHistory.push({ role: 'user', content: input });
        saveChatHistoryDebounced(conversationHistory);

        try {
            const useStreaming = userConfig.streaming !== false;

            if (useStreaming) {
                process.stdout.write('🤖 AI > ');
                let fullAnswer = '';

                for await (const chunk of chatStream(conversationHistory, currentModel)) {
                    fullAnswer += chunk;
                    process.stdout.write(chalk.green(chunk));
                }

                console.log('\n');
                conversationHistory.push({ role: 'assistant', content: fullAnswer });
                saveChatHistoryDebounced(conversationHistory);
            } else {
                process.stdout.write('🤖 AI > ');
                const answer = await chat(conversationHistory, currentModel);

                conversationHistory.push({ role: 'assistant', content: answer });
                saveChatHistoryDebounced(conversationHistory);

                console.log(highlightSyntax(answer) + '\n');
            }
        } catch (error) {
            console.error(`\n❌ Ошибка: ${error.message}\n`);
            conversationHistory.pop();
            saveChatHistory(conversationHistory);
        }

        rl.prompt();
    });

    rl.on('close', () => {
        saveChatHistory(conversationHistory);
        console.log('\n👋 До свидания!\n');
        process.exit(0);
    });
}

// ═══════════════════════════════════════════════════════════════════════
// ОДИНОЧНЫЙ ЗАПРОС
// ═══════════════════════════════════════════════════════════════════════

async function singleMode(message, model) {
    try {
        const useStreaming = userConfig.streaming !== false;

        if (useStreaming) {
            console.log(chalk.cyan('\n🤖 GLM-' + model + ' печатает...\n'));

            for await (const chunk of chatStream([{ role: 'user', content: message }], model)) {
                process.stdout.write(chalk.green(chunk));
            }

            console.log('\n');
        } else {
            console.log(chalk.cyan('\n🤖 GLM-' + model + ' печатает...\n'));
            const answer = await chat([{ role: 'user', content: message }], model);
            console.log(highlightSyntax(answer));
            console.log('\n');
        }
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
}
