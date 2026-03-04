/**
 * Команда: Проверка безопасности
 */

const chalk = require('chalk');
const { chat } = require('../api');
const { getPrompt } = require('../prompts');
const { readFilesRecursively } = require('../files');
const path = require('path');
const fs = require('fs');

/**
 * Выполняет проверку безопасности
 * @param {string} targetPath - Путь к файлу или директории
 * @param {Object} config - Конфигурация
 * @returns {Promise<void>}
 */
async function securityAudit(targetPath, config) {
    const absolutePath = path.isAbsolute(targetPath) 
        ? targetPath 
        : path.join(process.cwd(), targetPath);

    if (!fs.existsSync(absolutePath)) {
        console.error(chalk.red(`\n❌ Путь не найден: ${absolutePath}`));
        process.exit(1);
    }

    console.log(chalk.cyan('\n🔒 Проверка безопасности...\n'));
    console.log(chalk.gray(`   Путь: ${absolutePath}\n`));

    const stat = fs.statSync(absolutePath);
    let files = [];

    if (stat.isDirectory()) {
        files = readFilesRecursively(absolutePath, {
            maxFiles: config.MAX_FILES_ANALYZE,
            maxTotalSize: config.MAX_TOTAL_SIZE,
            exclude: config.EXCLUDE_DIRS,
        });
    } else {
        const { readFile } = require('../files');
        files = [readFile(absolutePath)];
    }

    if (files.length === 0) {
        console.error(chalk.red('\n❌ Не удалось прочитать файлы.\n'));
        process.exit(1);
    }

    const context = files
        .slice(0, 5)
        .map(f => `--- ${path.basename(f.path)} ---\n${f.content.slice(0, 3000)}`)
        .join('\n\n');

    const prompt = `${getPrompt('security')}\n\nКод для проверки:\n${context}`;

    try {
        const result = await chat(
            [{ role: 'user', content: prompt }],
            config.DEFAULT_MODEL,
            null,
            false,
            config
        );

        console.log(chalk.cyan('═══════════════════════════════════════════════════════'));
        console.log(chalk.cyan('                  🔒 БЕЗОПАСНОСТЬ'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));
        console.log(result);
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════\n'));
    } catch (error) {
        console.error(chalk.red('\n❌ Ошибка:'), error.message);
        process.exit(1);
    }
}

module.exports = {
    securityAudit,
};
