/**
 * Команда: Рефакторинг файла
 */

const chalk = require('chalk');
const { chat } = require('../api');
const { getPrompt } = require('../prompts');
const { readFile, writeFile } = require('../files');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

/**
 * Задаёт вопрос пользователю
 * @param {string} question
 * @returns {Promise<boolean>}
 */
async function askYesNo(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(chalk.yellow(question), (answer) => {
            rl.close();
            resolve(answer.toLowerCase().startsWith('y') || answer.toLowerCase() === 'да' || answer === '');
        });
    });
}

/**
 * Выполняет рефакторинг файла
 * @param {string} filePath - Путь к файлу
 * @param {Object} config - Конфигурация
 * @returns {Promise<void>}
 */
async function refactorFile(filePath, config) {
    const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
        console.error(chalk.red(`\n❌ Файл не найден: ${absolutePath}`));
        process.exit(1);
    }

    console.log(chalk.cyan('\n🔧 Рефакторинг файла...\n'));
    console.log(chalk.gray(`   Файл: ${absolutePath}\n`));

    const { content } = readFile(absolutePath);

    const prompt = `${getPrompt('refactor')}\n\nФайл для рефакторинга:\n\`\`\`\n${content}\n\`\`\``;

    try {
        const result = await chat(
            [{ role: 'user', content: prompt }],
            config.DEFAULT_MODEL,
            null,
            false,
            config
        );

        console.log(chalk.cyan('═══════════════════════════════════════════════════════'));
        console.log(chalk.cyan('                  🔧 РЕЗУЛЬТАТ РЕФАКТОРИНГА'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));
        console.log(result);
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════\n'));

        // Предложить сохранить изменения
        const apply = await askYesNo('Применить изменения? [Y/n]: ');
        
        if (apply) {
            // Простой подход: сохраняем оригинал с .bak
            const backupPath = absolutePath + '.bak';
            fs.copyFileSync(absolutePath, backupPath);
            console.log(chalk.gray(`   Резервная копия: ${backupPath}`));
            
            // Здесь можно добавить парсинг ответа и извлечение кода
            console.log(chalk.yellow('\n⚠️ Для применения изменений нужно извлечь код из ответа выше.'));
            console.log(chalk.gray('   Пожалуйста, вручную обновите файл или используйте /refactor с флагом --apply\n'));
        }
    } catch (error) {
        console.error(chalk.red('\n❌ Ошибка рефакторинга:'), error.message);
        process.exit(1);
    }
}

module.exports = {
    refactorFile,
};
