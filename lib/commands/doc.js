/**
 * Команда: Создание документации
 */

const chalk = require('chalk');
const { chat } = require('../api');
const { getPrompt } = require('../prompts');
const { readFile, readFilesRecursively } = require('../files');
const path = require('path');
const fs = require('fs');

/**
 * Выполняет создание документации
 * @param {string} targetPath - Путь к файлу или директории
 * @param {Object} config - Конфигурация
 * @returns {Promise<void>}
 */
async function createDocs(targetPath, config) {
    const absolutePath = path.isAbsolute(targetPath) 
        ? targetPath 
        : path.join(process.cwd(), targetPath);

    if (!fs.existsSync(absolutePath)) {
        console.error(chalk.red(`\n❌ Путь не найден: ${absolutePath}`));
        process.exit(1);
    }

    console.log(chalk.cyan('\n📝 Создание документации...\n'));
    console.log(chalk.gray(`   Путь: ${absolutePath}\n`));

    const stat = fs.statSync(absolutePath);
    let context = '';

    if (stat.isDirectory()) {
        const files = readFilesRecursively(absolutePath, {
            maxFiles: 10,
            maxTotalSize: 100000,
        });
        
        context = files
            .map(f => `--- ${path.basename(f.path)} ---\n${f.content.slice(0, 2000)}`)
            .join('\n\n');
    } else {
        const { content } = readFile(absolutePath);
        context = `--- ${path.basename(absolutePath)} ---\n${content}`;
    }

    const prompt = `${getPrompt('doc')}\n\nКод проекта:\n${context}`;

    try {
        const result = await chat(
            [{ role: 'user', content: prompt }],
            config.DEFAULT_MODEL,
            null,
            false,
            config
        );

        console.log(chalk.cyan('═══════════════════════════════════════════════════════'));
        console.log(chalk.cyan('                   📝 ДОКУМЕНТАЦИЯ'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));
        console.log(result);
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════\n'));

        // Предложить сохранить README
        const readmePath = path.join(path.dirname(absolutePath), 'README.md');
        console.log(chalk.gray(`   Документацию можно сохранить в: ${readmePath}\n`));
    } catch (error) {
        console.error(chalk.red('\n❌ Ошибка:'), error.message);
        process.exit(1);
    }
}

module.exports = {
    createDocs,
};
