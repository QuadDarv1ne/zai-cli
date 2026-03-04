/**
 * Команда: Генерация тестов
 */

const chalk = require('chalk');
const { chat } = require('../api');
const { getPrompt } = require('../prompts');
const { readFile, writeFile, getLanguageByExtension } = require('../files');
const path = require('path');
const fs = require('fs');

/**
 * Выполняет генерацию тестов
 * @param {string} filePath - Путь к файлу
 * @param {Object} config - Конфигурация
 * @returns {Promise<void>}
 */
async function createTests(filePath, config) {
    const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
        console.error(chalk.red(`\n❌ Файл не найден: ${absolutePath}`));
        process.exit(1);
    }

    console.log(chalk.cyan('\n🧪 Генерация тестов...\n'));
    console.log(chalk.gray(`   Файл: ${absolutePath}\n`));

    const { content } = readFile(absolutePath);
    const language = getLanguageByExtension(absolutePath);

    const prompt = `${getPrompt('test')}\n\nЯзык файла: ${language}\n\nКод для тестирования:\n\`\`\`\n${content}\n\`\`\``;

    try {
        const result = await chat(
            [{ role: 'user', content: prompt }],
            config.DEFAULT_MODEL,
            null,
            false,
            config
        );

        console.log(chalk.cyan('═══════════════════════════════════════════════════════'));
        console.log(chalk.cyan('                     🧪 ТЕСТЫ'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));
        console.log(result);
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════\n'));

        // Предложить сохранить тесты
        const extMap = {
            javascript: '.test.js',
            typescript: '.test.ts',
            python: '_test.py',
            php: 'Test.php',
            java: 'Test.java',
        };
        
        const testExt = extMap[language] || '.test.txt';
        const testPath = absolutePath.replace(/\.[^.]+$/, '') + testExt;
        
        console.log(chalk.gray(`   Тесты можно сохранить в: ${testPath}\n`));
    } catch (error) {
        console.error(chalk.red('\n❌ Ошибка:'), error.message);
        process.exit(1);
    }
}

module.exports = {
    createTests,
};
