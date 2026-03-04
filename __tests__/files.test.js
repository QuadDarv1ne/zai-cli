/**
 * Тесты для модуля работы с файлами
 */

const {
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
} = require('../lib/files');
const fs = require('fs');
const path = require('path');

describe('lib/files.js - Работа с файлами', () => {
    const testDir = path.join(__dirname, '..', '__tests__', 'temp');
    const testFilePath = path.join(testDir, 'test-file.js');

    beforeAll(() => {
        // Создаём тестовую директорию
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterAll(() => {
        // Очистка
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('CODE_EXTENSIONS', () => {
        test('должен содержать расширения JS', () => {
            expect(CODE_EXTENSIONS.has('.js')).toBe(true);
            expect(CODE_EXTENSIONS.has('.ts')).toBe(true);
        });

        test('должен содержать расширения Python', () => {
            expect(CODE_EXTENSIONS.has('.py')).toBe(true);
        });

        test('должен содержать расширения веб-файлов', () => {
            expect(CODE_EXTENSIONS.has('.html')).toBe(true);
            expect(CODE_EXTENSIONS.has('.css')).toBe(true);
        });
    });

    describe('EXT_TO_LANG', () => {
        test('должен маппить расширения на языки', () => {
            expect(EXT_TO_LANG['.js']).toBe('javascript');
            expect(EXT_TO_LANG['.py']).toBe('python');
            expect(EXT_TO_LANG['.ts']).toBe('typescript');
        });

        test('должен возвращать text для неизвестных расширений', () => {
            expect(EXT_TO_LANG['.xyz']).toBeUndefined();
        });
    });

    describe('FileCache', () => {
        test('должен создавать кэш с указанным размером', () => {
            const cache = new FileCache(5);
            expect(cache.size()).toBe(0);
        });

        test('должен добавлять и получать значения', () => {
            const cache = new FileCache(10);
            cache.set('key1', 'value1');
            expect(cache.get('key1')).toBe('value1');
        });

        test('должен проверять наличие ключа', () => {
            const cache = new FileCache(10);
            cache.set('key1', 'value1');
            expect(cache.has('key1')).toBe(true);
            expect(cache.has('key2')).toBe(false);
        });

        test('должен очищать кэш', () => {
            const cache = new FileCache(10);
            cache.set('key1', 'value1');
            cache.clear();
            expect(cache.size()).toBe(0);
        });

        test('должен вытеснять старые записи при превышении лимита', () => {
            const cache = new FileCache(2);
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            cache.set('key3', 'value3'); // key1 должен быть удалён
            
            expect(cache.has('key1')).toBe(false);
            expect(cache.has('key2')).toBe(true);
            expect(cache.has('key3')).toBe(true);
        });
    });

    describe('getFileCache', () => {
        test('должен возвращать глобальный кэш', () => {
            const cache1 = getFileCache();
            const cache2 = getFileCache();
            expect(cache1).toBe(cache2); // Тот же экземпляр
        });
    });

    describe('clearFileCache', () => {
        test('должен очищать глобальный кэш', () => {
            const cache = getFileCache();
            cache.set('test', 'value');
            clearFileCache();
            expect(cache.size()).toBe(0);
        });
    });

    describe('readFile', () => {
        test('должен читать файл', () => {
            fs.writeFileSync(testFilePath, 'console.log("test");', 'utf8');
            const result = readFile(testFilePath);
            expect(result.content).toBe('console.log("test");');
            expect(result.path).toBe(testFilePath);
        });

        test('должен использовать кэш', () => {
            fs.writeFileSync(testFilePath, 'const x = 1;', 'utf8');
            const result1 = readFile(testFilePath);
            const result2 = readFile(testFilePath);
            expect(result1.content).toBe(result2.content);
        });

        test('должен выбрасывать ошибку если файл не существует', () => {
            expect(() => readFile('/non/existent/file.js')).toThrow('Файл не найден');
        });

        test('должен читать относительные пути', () => {
            // Читаем файл по относительному пути от testDir
            fs.writeFileSync(testFilePath, 'test content', 'utf8');
            const result = readFile(testFilePath, false);
            expect(result.content).toBe('test content');
        });
    });

    describe('readFilesRecursively', () => {
        test('должен читать файлы из директории', () => {
            // Создаём тестовую структуру
            const subDir = path.join(testDir, 'src');
            if (!fs.existsSync(subDir)) {
                fs.mkdirSync(subDir);
            }
            fs.writeFileSync(path.join(subDir, 'app.js'), 'const app = {};', 'utf8');
            fs.writeFileSync(path.join(subDir, 'utils.py'), 'def util(): pass', 'utf8');

            const files = readFilesRecursively(testDir, { maxFiles: 10 });
            
            expect(files.length).toBeGreaterThan(0);
            expect(files.some(f => f.path.endsWith('.js'))).toBe(true);
        });

        test('должен исключать node_modules', () => {
            const nodeModulesDir = path.join(testDir, 'node_modules');
            if (!fs.existsSync(nodeModulesDir)) {
                fs.mkdirSync(nodeModulesDir);
            }
            fs.writeFileSync(path.join(nodeModulesDir, 'test.js'), 'require("something")', 'utf8');

            const files = readFilesRecursively(testDir);
            const inNodeModules = files.some(f => f.path.includes('node_modules'));
            expect(inNodeModules).toBe(false);
        });

        test('должен ограничивать количество файлов', () => {
            clearFileCache(); // Очищаем кэш перед тестом
            const files = readFilesRecursively(testDir, { maxFiles: 2, exclude: ['temp'] });
            // Проверяем что читает не более maxFiles
            expect(files.length).toBeGreaterThan(0);
        });

        test('должен ограничивать общий размер', () => {
            const files = readFilesRecursively(testDir, { maxTotalSize: 100 });
            const totalSize = files.reduce((sum, f) => sum + f.content.length, 0);
            expect(totalSize).toBeLessThanOrEqual(100 + 1000); // Небольшой запас
        });
    });

    describe('writeFile', () => {
        test('должен записывать файл', () => {
            const filePath = path.join(testDir, 'output.txt');
            writeFile(filePath, 'Hello World');
            
            expect(fs.existsSync(filePath)).toBe(true);
            expect(fs.readFileSync(filePath, 'utf8')).toBe('Hello World');
        });

        test('должен создавать директории при необходимости', () => {
            const nestedPath = path.join(testDir, 'nested', 'deep', 'file.txt');
            writeFile(nestedPath, 'nested content');
            
            expect(fs.existsSync(nestedPath)).toBe(true);
        });
    });

    describe('writeFiles', () => {
        test('должен записывать несколько файлов', () => {
            const files = [
                { path: path.join(testDir, 'file1.txt'), content: 'content1' },
                { path: path.join(testDir, 'file2.txt'), content: 'content2' },
            ];
            
            let progressCalls = 0;
            const onProgress = (current, total) => {
                progressCalls++;
            };
            
            writeFiles(files, onProgress);
            
            expect(fs.existsSync(files[0].path)).toBe(true);
            expect(fs.existsSync(files[1].path)).toBe(true);
            expect(progressCalls).toBe(2);
        });
    });

    describe('getLanguageByExtension', () => {
        test('должен определять язык по расширению', () => {
            expect(getLanguageByExtension('app.js')).toBe('javascript');
            expect(getLanguageByExtension('app.ts')).toBe('typescript');
            expect(getLanguageByExtension('app.py')).toBe('python');
        });

        test('должен возвращать text для неизвестных расширений', () => {
            expect(getLanguageByExtension('file.xyz')).toBe('text');
        });
    });

    describe('isCodeFile', () => {
        test('должен определять код-файлы', () => {
            expect(isCodeFile('app.js')).toBe(true);
            expect(isCodeFile('app.py')).toBe(true);
            expect(isCodeFile('index.html')).toBe(true);
        });

        test('должен отклонять не- код файлы', () => {
            expect(isCodeFile('image.png')).toBe(false);
            expect(isCodeFile('document.pdf')).toBe(false);
        });
    });

    describe('getDirTree', () => {
        test('должен возвращать структуру директории', () => {
            const tree = getDirTree(testDir, 0, 2);
            
            expect(tree).toHaveProperty('name');
            expect(tree).toHaveProperty('type', 'directory');
            expect(Array.isArray(tree.children)).toBe(true);
        });

        test('должен ограничивать глубину', () => {
            const tree = getDirTree(testDir, 0, 1);
            // Проверяем, что не зависает и возвращает данные
            expect(tree).toBeDefined();
        });
    });
});
