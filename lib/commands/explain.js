/**
 * Команда: Объяснение кода
 */

const chalk = require('chalk');
const { chat } = require('../api');
const { getPrompt } = require('../prompts');
const { readFile } = require('../files');
const path = require('path');
const fs = require('fs');

/**
 * Выполняет объяснение кода
 * @param {string} filePath - Путь к файлу
 * @param {Object} config - Конфигурация
 * @returns {Promise<void>}
 */
async function explainFile(filePath, config) {
    const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
        console.error(chalk.red(`\n❌ Файл не найден: ${absolutePath}`));
        process.exit(1);
    }

    console.log(chalk.cyan('\n📖 Объяснение кода...\n'));
    console.log(chalk.gray(`   Файл: ${absolutePath}\n`));

    const { content } = readFile(absolutePath);

    const prompt = `${getPrompt('explain')}\n\nКод для объяснения:\n\`\`\`\n${content}\n\`\`\``;

    try {
        const result = await chat(
            [{ role: 'user', content: prompt }],
            config.DEFAULT_MODEL,
            null,
            false,
            config
        );

        console.log(chalk.cyan('═══════════════════════════════════════════════════════'));
        console.log(chalk.cyan('                  📖 ОБЪЯСНЕНИЕ КОДА'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));
        console.log(result);
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════\n'));
    } catch (error) {
        console.error(chalk.red('\n❌ Ошибка:'), error.message);
        process.exit(1);
    }
}

module.exports = {
    explainFile,
};
