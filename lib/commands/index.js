/**
 * Индекс всех команд
 */

const { createProject } = require('./create');
const { initTemplate, getTemplates } = require('./init');
const { analyzePath } = require('./analyze');
const { refactorFile } = require('./refactor');
const { explainFile } = require('./explain');
const { createTests } = require('./test');
const { createDocs } = require('./doc');
const { fixFile } = require('./fix');
const { securityAudit } = require('./security');

module.exports = {
    // Команды
    createProject,
    initTemplate,
    analyzePath,
    refactorFile,
    explainFile,
    createTests,
    createDocs,
    fixFile,
    securityAudit,
    
    // Утилиты
    getTemplates,
};
