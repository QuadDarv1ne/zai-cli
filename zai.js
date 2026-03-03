#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ═══════════════════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════════════════════

const CONFIG = {
    API_URL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    API_KEY_FILE: path.join(__dirname, '.env'),
    HISTORY_FILE: path.join(__dirname, '.chat-history.json'),
    TIMEOUT: 60000,           // 60 секунд таймаут
    MAX_RETRIES: 3,           // Максимум попыток
    RETRY_DELAY: 1000,        // Задержка между попытками (мс)
    MAX_HISTORY_MESSAGES: 100 // Максимум сообщений в истории
};

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
// ВАЛИДАЦИЯ API КЛЮЧА
// ═══════════════════════════════════════════════════════════════════════

function validateApiKey() {
    if (!API_KEY) {
        console.error('\n❌ Ошибка: API ключ не найден!');
        console.error('\n📝 Решение:');
        console.error('   1. Откройте файл .env');
        console.error('   2. Добавьте: ZAI_API_KEY=ваш_ключ');
        console.error('   3. Или установите переменную окружения\n');
        process.exit(1);
    }

    // Проверка формата ключа (должен содержать точку)
    if (!API_KEY.includes('.') || API_KEY.length < 20) {
        console.error('\n❌ Ошибка: Неверный формат API ключа!');
        console.error('   Ключ должен выглядеть как: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxx\n');
        process.exit(1);
    }

    return true;
}

validateApiKey();

// ═══════════════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════════════════════

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
            throw new Error(`Таймаут запроса (${timeout / 1000}с)`);
        }
        throw error;
    }
}

async function fetchWithRetry(url, options, retries = CONFIG.MAX_RETRIES) {
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
                
                // 429 - rate limit
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') || 5;
                    console.log(`\n⏳ Rate limit. Ожидание ${retryAfter}с...\n`);
                    await sleep(retryAfter * 1000);
                    continue;
                }

                throw new Error(`API Error ${response.status}: ${errorData.message || response.statusText}`);
            }

            return response;

        } catch (error) {
            lastError = error;

            // Не ретраим ошибки аутентификации
            if (error.message.includes('401')) {
                throw error;
            }

            if (attempt < retries) {
                console.log(`\n⚠️ Ошибка: ${error.message}`);
                console.log(`🔄 Попытка ${attempt + 1} из ${retries} через ${CONFIG.RETRY_DELAY / 1000}с...\n`);
                await sleep(CONFIG.RETRY_DELAY * attempt); // Экспоненциальная задержка
            }
        }
    }

    throw lastError || new Error('Неизвестная ошибка');
}

// ═══════════════════════════════════════════════════════════════════════
// ПОДСВЕТКА СИНТАКСИСА (простая реализация)
// ═══════════════════════════════════════════════════════════════════════

const SYNTAX_COLORS = {
    keyword: '\x1b[35m',      // фиолетовый
    string: '\x1b[32m',       // зелёный
    number: '\x1b[33m',       // жёлтый
    comment: '\x1b[90m',      // серый
    function: '\x1b[36m',     // голубой
    operator: '\x1b[33m',     // жёлтый
    bracket: '\x1b[90m',      // серый
    reset: '\x1b[0m'
};

function highlightSyntax(code, lang = '') {
    if (!process.stdout.isTTY) return code; // Не красим если не терминал

    let highlighted = code;

    // Ключевые слова (универсальные)
    const keywords = /\b(const|let|var|function|return|if|else|for|while|class|import|from|export|default|async|await|try|catch|throw|new|this|typeof|instanceof|def|print|import|as|with|except|raise|lambda|yield|global|nonlocal|pass|break|continue|in|is|and|or|not|null|undefined|true|false|None|True|False)\b/g;
    highlighted = highlighted.replace(keywords, `${SYNTAX_COLORS.keyword}$1${SYNTAX_COLORS.reset}`);

    // Строки
    highlighted = highlighted.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g, `${SYNTAX_COLORS.string}$&${SYNTAX_COLORS.reset}`);

    // Числа
    highlighted = highlighted.replace(/\b\d+(\.\d+)?\b/g, `${SYNTAX_COLORS.number}$&${SYNTAX_COLORS.reset}`);

    // Комментарии
    highlighted = highlighted.replace(/(\/\/.*$|#.*$)/gm, `${SYNTAX_COLORS.comment}$1${SYNTAX_COLORS.reset}`);

    // Функции
    highlighted = highlighted.replace(/\b([a-zA-Z_]\w*)(?=\s*\()/g, `${SYNTAX_COLORS.function}$1${SYNTAX_COLORS.reset}`);

    return highlighted;
}

// ═══════════════════════════════════════════════════════════════════════
// ПРОГРЕСС БАР
// ═══════════════════════════════════════════════════════════════════════

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
        }
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
    } catch (e) {
        // Игнорируем ошибки
    }
    return [];
}

function saveChatHistory(history) {
    try {
        // Оставляем только последние N сообщений
        const trimmed = history.slice(-CONFIG.MAX_HISTORY_MESSAGES);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch (e) {
        // Игнорируем ошибки
    }
}

// ═══════════════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ═══════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
let conversationHistory = loadChatHistory();
let currentModel = 'glm-4';

// ═══════════════════════════════════════════════════════════════════════
// СПРАВКА
// ═══════════════════════════════════════════════════════════════════════

function printHelp() {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    z.ai CLI - Справка                     ║
╠═══════════════════════════════════════════════════════════╣
║  ОСНОВНЫЕ РЕЖИМЫ:                                         ║
║    node zai.js                    → Интерактивный чат     ║
║    node zai.js <запрос>           → Одиночный запрос      ║
║    node zai.js -m <model> <запрос> → С выбором модели     ║
║                                                           ║
║  РЕЖИМЫ РАБОТЫ С ПРОЕКТАМИ:                               ║
║    --create <описание>            → Создать проект/файлы  ║
║    --init <шаблон>                → Инициализировать шаб- ║
║                                     лон проекта           ║
║    --project <задача>             → Работа с текущим      ║
║                                     проектом              ║
║    --refactor <файл>              → Рефакторинг файла     ║
║    --analyze <файл/папка>         → Анализ кода           ║
║    --explain <файл>               → Объяснить код         ║
║    --test <файл>                  → Создать тесты         ║
║    --doc <файл>                   → Создать документацию  ║
║                                                           ║
║  КОМАНДЫ В ИНТЕРАКТИВНОМ РЕЖИМЕ:                          ║
║    /help, /h              → Справка                       ║
║    /clear, /c             → Очистить историю              ║
║    /model <name>          → Сменить модель                ║
║    /models                → Список моделей                ║
║    /history               → Показать историю              ║
║    /save <file>           → Сохранить историю             ║
║    /load <file>           → Загрузить историю             ║
║    /exit, /quit, /q       → Выход                         ║
║                                                           ║
║  ПРИМЕРЫ:                                                 ║
║    node zai.js --create "Создай Telegram бота на Python"  ║
║    node zai.js --init react                               ║
║    node zai.js --project "Добавь авторизацию"             ║
║    node zai.js --refactor src/app.js                      ║
║    node zai.js --analyze ./src                            ║
║    node zai.js --explain main.py                          ║
╚═══════════════════════════════════════════════════════════╝
`);
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT ФУНКЦИЯ С РЕТРАЯМИ
// ═══════════════════════════════════════════════════════════════════════

async function chat(messages, model = 'glm-4', systemPrompt = null) {
    const allMessages = systemPrompt 
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            messages: allMessages
        })
    };

    const response = await fetchWithRetry(CONFIG.API_URL, options);
    const data = await response.json();
    
    return data.choices[0].message.content;
}

// ═══════════════════════════════════════════════════════════════════════
// ЧТЕНИЕ ФАЙЛОВ
// ═══════════════════════════════════════════════════════════════════════

function readFilesRecursively(dir, maxFiles = 50, maxTotalSize = 500000) {
    const result = [];
    let totalSize = 0;
    
    function walk(currentDir) {
        if (result.length >= maxFiles) return;
        
        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                
                const fullPath = path.join(currentDir, entry.name);
                
                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    const codeExtensions = ['.js', '.ts', '.py', '.php', '.java', '.cpp', '.c', '.h', 
                                           '.cs', '.rb', '.go', '.rs', '.swift', '.kt', '.vue', 
                                           '.jsx', '.tsx', '.html', '.css', '.scss', '.json', 
                                           '.yaml', '.yml', '.md', '.txt', '.sql', '.sh', '.bat'];
                    
                    if (codeExtensions.includes(ext) || !ext) {
                        try {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            if (totalSize + content.length <= maxTotalSize) {
                                result.push({ path: fullPath, content });
                                totalSize += content.length;
                            } else {
                                return;
                            }
                        } catch (e) {
                            // Пропускаем бинарные файлы
                        }
                    }
                }
            }
        } catch (e) {
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
    
    return {
        path: absolutePath,
        content: fs.readFileSync(absolutePath, 'utf8')
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
    
    let content = '';
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

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║              🤖 z.ai CLI - Интерактивный чат              ║
║                   Модель: GLM-${currentModel.padEnd(12)}           ║
╠═══════════════════════════════════════════════════════════╣
║  Введите /help для списка команд, /exit для выхода        ║
║  История автоматически сохраняется между сессиями         ║
╚═══════════════════════════════════════════════════════════╝
`);

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
                    printHelp();
                    break;

                case '/clear':
                case '/c':
                    conversationHistory = [];
                    saveChatHistory(conversationHistory);
                    console.log('🧹 История очищена\n');
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
        saveChatHistory(conversationHistory);

        try {
            process.stdout.write('🤖 AI > ');
            const answer = await chat(conversationHistory, currentModel);

            conversationHistory.push({ role: 'assistant', content: answer });
            saveChatHistory(conversationHistory);

            console.log(highlightSyntax(answer) + '\n');
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
        console.log('\n🤖 GLM-' + model + ' печатает...\n');
        const answer = await chat([{ role: 'user', content: message }], model);
        console.log(highlightSyntax(answer));
        console.log('\n');
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// ГЛАВНАЯ ФУНКЦИЯ
// ═══════════════════════════════════════════════════════════════════════

async function main() {
    const flags = {
        help: args.includes('-h') || args.includes('--help'),
        create: args.indexOf('--create'),
        init: args.indexOf('--init'),
        project: args.indexOf('--project'),
        refactor: args.indexOf('--refactor'),
        analyze: args.indexOf('--analyze'),
        explain: args.indexOf('--explain'),
        test: args.indexOf('--test'),
        doc: args.indexOf('--doc')
    };

    if (flags.help) {
        printHelp();
        return;
    }

    if (flags.create !== -1) {
        const description = args.slice(flags.create + 1).join(' ');
        if (!description) {
            console.error('❌ Укажите описание проекта\n');
            return;
        }
        await createProject(description);
        return;
    }

    if (flags.init !== -1) {
        const templateName = args[flags.init + 1];
        if (!templateName) {
            console.error('❌ Укажите название шаблона\n');
            return;
        }
        await initTemplate(templateName);
        return;
    }

    if (flags.project !== -1) {
        const task = args.slice(flags.project + 1).join(' ');
        if (!task) {
            console.error('❌ Укажите задачу\n');
            return;
        }
        await projectMode(task);
        return;
    }

    if (flags.refactor !== -1) {
        const filePath = args[flags.refactor + 1];
        if (!filePath) {
            console.error('❌ Укажите файл\n');
            return;
        }
        await refactorFile(filePath);
        return;
    }

    if (flags.analyze !== -1) {
        const targetPath = args[flags.analyze + 1];
        if (!targetPath) {
            console.error('❌ Укажите путь\n');
            return;
        }
        await analyzePath(targetPath);
        return;
    }

    if (flags.explain !== -1) {
        const filePath = args[flags.explain + 1];
        if (!filePath) {
            console.error('❌ Укажите файл\n');
            return;
        }
        await explainFile(filePath);
        return;
    }

    if (flags.test !== -1) {
        const filePath = args[flags.test + 1];
        if (!filePath) {
            console.error('❌ Укажите файл\n');
            return;
        }
        await createTests(filePath);
        return;
    }

    if (flags.doc !== -1) {
        const filePath = args[flags.doc + 1];
        if (!filePath) {
            console.error('❌ Укажите файл\n');
            return;
        }
        await createDocs(filePath);
        return;
    }

    if (args.length === 0) {
        await interactiveMode();
        return;
    }

    let model = 'glm-4';
    let message = '';

    if (args.includes('-m')) {
        const modelIndex = args.indexOf('-m');
        model = args[modelIndex + 1];
        message = args.slice(modelIndex + 2).join(' ');
    } else {
        message = args.join(' ');
    }

    if (!message) {
        console.error('❌ Ошибка: не указан запрос');
        printHelp();
        process.exit(1);
    }

    await singleMode(message, model);
}

main();
