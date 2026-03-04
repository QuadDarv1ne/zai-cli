/**
 * Утилиты для работы с файлами
 */

const fs = require('fs');
const path = require('path');

const CODE_EXTENSIONS = new Set([
    '.js', '.ts', '.py', '.php', '.java', '.cpp', '.c', '.h', '.cs',
    '.rb', '.go', '.rs', '.swift', '.kt', '.vue', '.jsx', '.tsx',
    '.html', '.css', '.scss', '.json', '.yaml', '.yml', '.md',
    '.txt', '.sql', '.sh', '.bat', '.ps1', '.ex', '.exs', '.erl',
]);

const EXT_TO_LANG = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.py': 'python',
    '.php': 'php',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.vue': 'vue',
    '.jsx': 'javascript',
    '.tsx': 'typescript',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.sql': 'sql',
    '.sh': 'bash',
    '.bat': 'batch',
    '.ps1': 'powershell',
};

/**
 * Кэш файлов
 */
class FileCache {
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key) {
        return this.cache.get(key);
    }

    set(key, value) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    has(key) {
        return this.cache.has(key);
    }

    clear() {
        this.cache.clear();
    }

    size() {
        return this.cache.size;
    }
}

// Глобальный кэш файлов
let globalFileCache = null;

/**
 * Получает глобальный кэш файлов
 * @returns {FileCache}
 */
function getFileCache() {
    if (!globalFileCache) {
        globalFileCache = new FileCache();
    }
    return globalFileCache;
}

/**
 * Очищает кэш файлов
 */
function clearFileCache() {
    if (globalFileCache) {
        globalFileCache.clear();
    }
}

/**
 * Читает содержимое файла
 * @param {string} filePath - Путь к файлу
 * @param {boolean} useCache - Использовать кэш
 * @returns {{path: string, content: string}}
 */
function readFile(filePath, useCache = true) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Файл не найден: ${absolutePath}`);
    }

    const cache = getFileCache();

    if (useCache && cache.has(absolutePath)) {
        return {
            path: absolutePath,
            content: cache.get(absolutePath),
        };
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    
    if (useCache) {
        cache.set(absolutePath, content);
    }

    return {
        path: absolutePath,
        content,
    };
}

/**
 * Читает файлы рекурсивно из директории
 * @param {string} dir - Директория
 * @param {Object} options - Опции
 * @returns {Array<{path: string, content: string}>}
 */
function readFilesRecursively(dir, options = {}) {
    const {
        maxFiles = 50,
        maxTotalSize = 500000,
        exclude = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__'],
        extensions = CODE_EXTENSIONS,
    } = options;

    const result = [];
    let totalSize = 0;
    const cache = getFileCache();

    function walk(currentDir) {
        if (result.length >= maxFiles) {
            return;
        }

        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                // Проверка исключений
                if (entry.name.startsWith('.') || exclude.includes(entry.name)) {
                    continue;
                }

                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();

                    if (extensions.has(ext) || (!ext && entry.name.includes('.'))) {
                        try {
                            // Проверка кэша
                            if (cache.has(fullPath)) {
                                const cachedContent = cache.get(fullPath);
                                if (totalSize + cachedContent.length <= maxTotalSize) {
                                    result.push({ path: fullPath, content: cachedContent });
                                    totalSize += cachedContent.length;
                                }
                                continue;
                            }

                            const content = fs.readFileSync(fullPath, 'utf8');
                            
                            if (totalSize + content.length <= maxTotalSize) {
                                cache.set(fullPath, content);
                                result.push({ path: fullPath, content });
                                totalSize += content.length;
                            } else {
                                return; // Достигнут лимит размера
                            }
                        } catch {
                            // Пропускаем бинарные или недоступные файлы
                        }
                    }
                }
            }
        } catch {
            // Игнорируем ошибки доступа
        }
    }

    walk(dir);
    return result;
}

/**
 * Сохраняет файл
 * @param {string} filePath - Путь к файлу
 * @param {string} content - Содержимое
 */
function writeFile(filePath, content) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const dir = path.dirname(absolutePath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(absolutePath, content, 'utf8');
}

/**
 * Сохраняет несколько файлов
 * @param {Array<{path: string, content: string}>} files - Файлы для сохранения
 * @param {Function} onProgress - Коллбэк прогресса
 */
function writeFiles(files, onProgress = null) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        writeFile(file.path, file.content);
        
        if (onProgress) {
            onProgress(i + 1, files.length);
        }
    }
}

/**
 * Определяет язык по расширению
 * @param {string} filePath
 * @returns {string}
 */
function getLanguageByExtension(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return EXT_TO_LANG[ext] || 'text';
}

/**
 * Проверяет, является ли файл кодом
 * @param {string} filePath
 * @returns {boolean}
 */
function isCodeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return CODE_EXTENSIONS.has(ext);
}

/**
 * Получает структуру директории
 * @param {string} dir - Директория
 * @param {number} depth - Глубина
 * @returns {Object}
 */
function getDirTree(dir, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) {
        return null;
    }

    const result = {
        name: path.basename(dir),
        type: 'directory',
        children: [],
    };

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.name.startsWith('.')) {
                continue;
            }

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (depth < maxDepth) {
                    const child = getDirTree(fullPath, depth + 1, maxDepth);
                    if (child && child.children.length > 0) {
                        result.children.push(child);
                    }
                }
            } else if (entry.isFile()) {
                result.children.push({
                    name: entry.name,
                    type: 'file',
                    path: fullPath,
                });
            }
        }
    } catch {
        // Игнорируем ошибки доступа
    }

    return result;
}

module.exports = {
    CODE_EXTENSIONS,
    EXT_TO_LANG,
    FileCache,
    getFileCache,
    clearFileCache,
    readFile,
    readFilesRecursively,
    writeFile,
    writeFiles,
    getLanguageByExtension,
    isCodeFile,
    getDirTree,
};
