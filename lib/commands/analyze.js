/**
 * Команда: Анализ кода
 */

const chalk = require('chalk');
const { chat } = require('../api');
const { getPrompt, buildPrompt } = require('../prompts');
const { readFilesRecursively, readFile } = require('../files');
const path = require('path');

/**
 * Выполняет анализ кода
 * @param {string} targetPath - Путь к файлу или директории
 * @param {Object} config - Конфигурация
 * @returns {Promise<void>}
 */
async function analyzePath(targetPath, config) {
    const absolutePath = path.isAbsolute(targetPath) 
        ? targetPath 
        : path.join(process.cwd(), targetPath);

    const fs = require('fs');
    
    if (!fs.existsSync(absolutePath)) {
        console.error(chalk.red(`\n❌ Путь не найден: ${absolutePath}`));
        process.exit(1);
    }

    const stat = fs.statSync(absolutePath);
    let files = [];

    console.log(chalk.cyan('\n🔍 Анализ кода...\n'));

    if (stat.isDirectory()) {
        console.log(chalk.gray(`   Сканирую директорию: ${absolutePath}\n`));
        files = readFilesRecursively(absolutePath, {
            maxFiles: config.MAX_FILES_ANALYZE,
            maxTotalSize: config.MAX_TOTAL_SIZE,
            exclude: config.EXCLUDE_DIRS,
        });
        console.log(chalk.gray(`   Найдено файлов: ${files.length}\n`));
    } else {
        const fileData = readFile(absolutePath);
        files = [fileData];
    }

    if (files.length === 0) {
        console.error(chalk.red('\n❌ Не удалось прочитать файлы для анализа.\n'));
        process.exit(1);
    }

    // Формируем контекст для AI
    const context = files
        .slice(0, 5)
        .map(f => `--- ${path.basename(f.path)} ---\n${f.content.slice(0, 3000)}`)
        .join('\n\n');

    const prompt = `${getPrompt('analyze')}\n\nКод для анализа:\n${context}`;

    try {
        const result = await chat(
            [{ role: 'user', content: prompt }],
            config.DEFAULT_MODEL,
            null,
            false,
            config
        );

        console.log(chalk.cyan('═══════════════════════════════════════════════════════'));
        console.log(chalk.cyan('                    📊 РЕЗУЛЬТАТ АНАЛИЗА'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));
        console.log(result);
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════\n'));
    } catch (error) {
        console.error(chalk.red('\n❌ Ошибка анализа:'), error.message);
        process.exit(1);
    }
}

module.exports = {
    analyzePath,
};
