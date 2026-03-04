#!/usr/bin/env node

/**
 * z.ai CLI - Основной файл
 * CLI для работы с z.ai (Zhipu AI / GLM) API
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const { Command } = require('commander');

// Модули
const { createConfig, validateApiKey, getConfigPath, getEnvPath } = require('./lib/config');
const { loadChatHistory, saveChatHistory, exportHistory, loadHistoryFromFile, getHistoryStats, clearChatHistory } = require('./lib/history');
const { chat, chatStream, fetchAvailableModels } = require('./lib/api');
const { highlightSyntax, countTokens, debounce } = require('./lib/utils');
const { clearFileCache } = require('./lib/files');
const { getPrompt } = require('./lib/prompts');

// Команды
const commands = require('./lib/commands');

const BASE_PATH = __dirname;
const CONFIG = createConfig(BASE_PATH);

// Проверка API ключа
const validation = validateApiKey(CONFIG.API_KEY);
if (!validation.valid) {
    console.error(chalk.red('\n❌ Ошибка: API ключ не найден!'));
    console.error(chalk.yellow('\n📝 Решение:'));
    console.error(chalk.gray(`   1. Откройте файл: ${getEnvPath(BASE_PATH)}`));
    console.error(chalk.gray('   2. Добавьте: ZAI_API_KEY=ваш_ключ'));
    console.error(chalk.gray('   3. Или установите переменную окружения\n'));
    process.exit(1);
}

// Глобальная обработка ошибок
process.on('uncaughtException', (err) => {
    const logFile = path.join(BASE_PATH, '.zai-error.log');
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Uncaught Exception:\n${err.stack}\n\n`;
    fs.appendFileSync(logFile, logEntry);
    console.error(chalk.red('\n❌ Произошла непредвиденная ошибка'));
    console.error(chalk.gray('   Лог сохранён в: .zai-error.log\n'));
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    const logFile = path.join(BASE_PATH, '.zai-error.log');
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Unhandled Rejection:\n${reason}\n\n`;
    fs.appendFileSync(logFile, logEntry);
    console.error(chalk.red('\n❌ Ошибка в асинхронной операции'));
    console.error(chalk.gray('   Лог сохранён в: .zai-error.log\n'));
    process.exit(1);
});

// Глобальные переменные
let conversationHistory = loadChatHistory(path.join(BASE_PATH, '.chat-history.json'));
let currentModel = CONFIG.DEFAULT_MODEL;

// Сохранение истории с debounce
const saveHistoryDebounced = debounce((history) => {
    saveChatHistory(history, path.join(BASE_PATH, '.chat-history.json'), CONFIG.MAX_HISTORY_MESSAGES);
}, 500);

/**
 * Показывает справку
 */
function showHelp() {
    console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════╗
║  КОМАНДЫ ИНТЕРАКТИВНОГО РЕЖИМА:                           ║
║    /help, /h              → Справка                       ║
║    /clear, /c             → Очистить историю              ║
║    /model <name>          → Сменить модель                ║
║    /models                → Список моделей                ║
║    /refresh-models        → Обновить список моделей       ║
║    /history               → Показать историю              ║
║    /tokens                → Статистика токенов            ║
║    /save <file>           → Сохранить историю             ║
║    /load <file>           → Загрузить историю             ║
║    /cache                 → Очистить кэш файлов           ║
║    /export <file> [fmt]   → Экспорт в MD/HTML/TXT         ║
║    /config                → Показать настройки            ║
║    /exit, /quit, /q       → Выход                         ║
╚═══════════════════════════════════════════════════════════╝
    `));
}

/**
 * Показывает список моделей
 */
async function showModels() {
    console.log(chalk.cyan('\n📋 Доступные модели:\n'));
    const models = await fetchAvailableModels(CONFIG.API_KEY, CONFIG.API_URL);
    
    for (const model of models) {
        const marker = model.id === currentModel ? ' ✓' : '';
        console.log(chalk.white(`  ${model.id}`) + chalk.gray(` — ${model.description}${marker}`));
    }
    console.log('');
}

/**
 * Одиночный запрос
 */
async function singleMode(query, model) {
    console.log(chalk.gray('\n💬 Запрос:'), query);
    
    const response = await chat(
        [{ role: 'user', content: query }],
        model || currentModel,
        getPrompt('chat'),
        CONFIG.STREAMING,
        CONFIG
    );

    console.log(chalk.cyan('\n🤖 Ответ:\n'));
    console.log(highlightSyntax(response));
    console.log('');
}

/**
 * Интерактивный режим
 */
async function interactiveMode() {
    console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════╗
║           Добро пожаловать в z.ai CLI!                    ║
║                                                           ║
║  Модель: ${currentModel.padEnd(45)}║
║  Введите сообщение или команду /help для справки          ║
╚═══════════════════════════════════════════════════════════╝
    `));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.green('➤ '),
    });

    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();

        if (!input) {
            rl.prompt();
            return;
        }

        // Команды
        if (input.startsWith('/')) {
            await handleCommand(input.slice(1), rl);
            return;
        }

        // Сообщение для AI
        conversationHistory.push({ role: 'user', content: input });
        
        try {
            if (CONFIG.STREAMING) {
                // Streaming режим
                console.log(chalk.cyan('\n🤖 '));
                let fullResponse = '';
                
                for await (const chunk of chatStream(
                    conversationHistory,
                    currentModel,
                    getPrompt('chat'),
                    CONFIG
                )) {
                    process.stdout.write(chalk.white(chunk));
                    fullResponse += chunk;
                }
                console.log('\n');
                
                conversationHistory.push({ role: 'assistant', content: fullResponse });
            } else {
                // Обычный режим
                const response = await chat(
                    conversationHistory,
                    currentModel,
                    getPrompt('chat'),
                    false,
                    CONFIG
                );

                console.log(chalk.cyan('\n🤖 Ответ:\n'));
                console.log(highlightSyntax(response));
                console.log('');

                conversationHistory.push({ role: 'assistant', content: response });
            }

            // Сохраняем историю
            saveHistoryDebounced(conversationHistory);
        } catch (error) {
            console.error(chalk.red('\n❌ Ошибка:'), error.message);
        }

        rl.prompt();
    });

    rl.on('close', () => {
        console.log(chalk.gray('\n👋 До свидания!'));
        process.exit(0);
    });
}

/**
 * Обработка команд
 */
async function handleCommand(input, rl) {
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
        case 'help':
        case 'h':
        case '?':
            showHelp();
            break;

        case 'clear':
        case 'c':
            conversationHistory = [];
            clearChatHistory(path.join(BASE_PATH, '.chat-history.json'));
            console.log(chalk.gray('История очищена.\n'));
            break;

        case 'model':
            if (args[0]) {
                currentModel = args[0];
                console.log(chalk.gray(`Модель изменена на: ${currentModel}\n`));
            } else {
                console.log(chalk.gray(`Текущая модель: ${currentModel}\n`));
            }
            break;

        case 'models':
            await showModels();
            break;

        case 'refresh-models':
            await showModels();
            break;

        case 'history':
            console.log(chalk.cyan('\n📜 История диалога:\n'));
            for (const msg of conversationHistory.slice(-10)) {
                const role = msg.role === 'user' ? '👤' : '🤖';
                console.log(chalk.gray(`${role} ${msg.role}:`));
                console.log(msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : ''));
                console.log('');
            }
            break;

        case 'tokens':
            const stats = getHistoryStats(conversationHistory, countTokens);
            console.log(chalk.cyan('\n📊 Статистика токенов:\n'));
            console.log(chalk.gray(`  Всего: ${stats.total}`));
            console.log(chalk.gray(`  Сообщений: ${stats.messages}`));
            console.log(chalk.gray(`  Пользователь: ${stats.byRole.user}`));
            console.log(chalk.gray(`  AI: ${stats.byRole.assistant}\n`));
            break;

        case 'save':
            if (args[0]) {
                saveChatHistory(conversationHistory, args[0], CONFIG.MAX_HISTORY_MESSAGES);
                console.log(chalk.gray(`История сохранена в: ${args[0]}\n`));
            } else {
                console.log(chalk.yellow('Укажите имя файла: /save <file>\n'));
            }
            break;

        case 'load':
            if (args[0]) {
                conversationHistory = loadHistoryFromFile(args[0]);
                console.log(chalk.gray(`Загружено сообщений: ${conversationHistory.length}\n`));
            } else {
                console.log(chalk.yellow('Укажите имя файла: /load <file>\n'));
            }
            break;

        case 'cache':
            clearFileCache();
            console.log(chalk.gray('Кэш файлов очищен.\n'));
            break;

        case 'export':
            if (args[0]) {
                const format = args[1] || 'md';
                exportHistory(conversationHistory, args[0], format);
                console.log(chalk.gray(`История экспортирована в: ${args[0]} (${format})\n`));
            } else {
                console.log(chalk.yellow('Укажите имя файла: /export <file> [format]\n'));
            }
            break;

        case 'config':
            console.log(chalk.cyan('\n⚙️ Настройки:\n'));
            console.log(chalk.gray(`  Модель: ${currentModel}`));
            console.log(chalk.gray(`  Streaming: ${CONFIG.STREAMING}`));
            console.log(chalk.gray(`  Timeout: ${CONFIG.TIMEOUT}ms`));
            console.log(chalk.gray(`  Max Retries: ${CONFIG.MAX_RETRIES}`));
            console.log(chalk.gray(`  Конфиг: ${getConfigPath(BASE_PATH)}\n`));
            break;

        case 'exit':
        case 'quit':
        case 'q':
            console.log(chalk.gray('\n👋 До свидания!'));
            process.exit(0);

        default:
            console.log(chalk.yellow(`Неизвестная команда: /${cmd}\n`));
    }

    rl.prompt();
}

// ═══════════════════════════════════════════════════════════════════════
// COMMANDER CLI
// ═══════════════════════════════════════════════════════════════════════

const pkg = JSON.parse(fs.readFileSync(path.join(BASE_PATH, 'package.json'), 'utf8'));

const program = new Command();

program
    .name('zai')
    .description('CLI для работы с z.ai (Zhipu AI / GLM) API')
    .version(pkg.version)
    .argument('[query]', 'Запрос к AI')
    .option('-m, --model <name>', 'Модель', CONFIG.DEFAULT_MODEL)
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
        // Передаём конфигурацию в команды
        const cmdConfig = {
            ...CONFIG,
            DEFAULT_MODEL: options.model || currentModel,
        };

        // Режимы работы
        if (options.create) {
            await commands.createProject(options.create, cmdConfig);
            return;
        }

        if (options.init) {
            await commands.initTemplate(options.init);
            return;
        }

        if (options.project) {
            console.log(chalk.yellow('Режим /project временно недоступен. Используйте --analyze\n'));
            return;
        }

        if (options.refactor) {
            await commands.refactorFile(options.refactor, cmdConfig);
            return;
        }

        if (options.analyze) {
            await commands.analyzePath(options.analyze, cmdConfig);
            return;
        }

        if (options.explain) {
            await commands.explainFile(options.explain, cmdConfig);
            return;
        }

        if (options.test) {
            await commands.createTests(options.test, cmdConfig);
            return;
        }

        if (options.doc) {
            await commands.createDocs(options.doc, cmdConfig);
            return;
        }

        if (options.fix) {
            await commands.fixFile(options.fix, cmdConfig);
            return;
        }

        if (options.security !== undefined) {
            await commands.securityAudit(options.security || '.', cmdConfig);
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
