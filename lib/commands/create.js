/**
 * Команда: Создание проекта по описанию
 */

const path = require('path');
const chalk = require('chalk');
const { chat } = require('../api');
const { extractFilesFromResponse } = require('../utils');
const { getPrompt } = require('../prompts');
const { writeFiles } = require('../files');
const { createProgressBar } = require('../utils');

/**
 * Выполняет команду создания проекта
 * @param {string} description - Описание проекта
 * @param {Object} config - Конфигурация
 * @returns {Promise<void>}
 */
async function createProject(description, config) {
    console.log('\n🚀 Создание проекта...\n');
    console.log('📝 Описание:', description);
    console.log('\n🤔 Анализирую запрос и генерирую структуру...\n');

    const response = await chat(
        [{ role: 'user', content: `Создай проект: ${description}` }],
        config.DEFAULT_MODEL,
        getPrompt('create'),
        false,
        config
    );

    console.log('\n📄 Ответ AI:\n');
    console.log(response);

    const projectDir = path.join(process.cwd(), 'generated-project');
    const files = extractFilesFromResponse(response, projectDir);

    if (files.length > 0) {
        console.log('\n\n💾 Сохранение файлов...\n');
        
        // Используем простой прогресс-бар
        let progress = 0;
        const total = files.length;
        const barWidth = 30;
        
        const updateProgress = (current) => {
            progress = current;
            const filled = Math.round(barWidth * (progress / total));
            const empty = barWidth - filled;
            const percent = Math.round((progress / total) * 100);
            const bar = '█'.repeat(filled) + '░'.repeat(empty);
            process.stdout.write(`\r📊 [${bar}] ${percent}% (${progress}/${total})`);
            if (progress >= total) {
                process.stdout.write('\n');
            }
        };

        writeFiles(files, updateProgress);

        console.log(`\n✨ Проект создан в: ${projectDir}\n`);
    } else {
        console.log('\n⚠️ Не удалось извлечь файлы из ответа. Попробуйте уточнить запрос.\n');
    }
}

module.exports = {
    createProject,
};
