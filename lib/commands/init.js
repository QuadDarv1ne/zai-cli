/**
 * Команда: Инициализация шаблона проекта
 */

const path = require('path');
const chalk = require('chalk');
const { writeFiles } = require('../files');

/**
 * Доступные шаблоны проектов
 */
const TEMPLATES = {
    node: {
        name: 'Node.js проект',
        files: [
            { path: 'package.json', content: '{\n  "name": "project",\n  "version": "1.0.0",\n  "main": "index.js",\n  "scripts": {\n    "start": "node index.js",\n    "dev": "node --watch index.js"\n  }\n}\n' },
            { path: 'index.js', content: 'console.log("Hello, World!");\n' },
            { path: '.gitignore', content: 'node_modules/\n.env\n' },
            { path: 'README.md', content: '# Project\n\nОписание проекта\n' },
        ],
    },
    python: {
        name: 'Python проект',
        files: [
            { path: 'main.py', content: 'def main():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    main()\n' },
            { path: 'requirements.txt', content: '# Зависимости\n' },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\n.venv/\n.env\n' },
            { path: 'README.md', content: '# Python Project\n\nОписание проекта\n' },
        ],
    },
    react: {
        name: 'React проект',
        files: [
            { path: 'package.json', content: '{\n  "name": "react-app",\n  "version": "0.1.0",\n  "private": true,\n  "dependencies": {\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  },\n  "scripts": {\n    "start": "react-scripts start",\n    "build": "react-scripts build"\n  }\n}\n' },
            { path: 'public/index.html', content: '<!DOCTYPE html>\n<html lang="ru">\n<head>\n  <meta charset="UTF-8">\n  <title>React App</title>\n</head>\n<body>\n  <div id="root"></div>\n</body>\n</html>\n' },
            { path: 'src/index.js', content: 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nconst root = ReactDOM.createRoot(document.getElementById("root"));\nroot.render(<App />);\n' },
            { path: 'src/App.js', content: 'function App() {\n  return (\n    <div className="App">\n      <h1>Hello, React!</h1>\n    </div>\n  );\n}\n\nexport default App;\n' },
            { path: '.gitignore', content: 'node_modules/\nbuild/\n.env\n' },
        ],
    },
    vue: {
        name: 'Vue 3 проект',
        files: [
            { path: 'package.json', content: '{\n  "name": "vue-app",\n  "version": "0.1.0",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build"\n  },\n  "dependencies": {\n    "vue": "^3.3.0"\n  }\n}\n' },
            { path: 'index.html', content: '<!DOCTYPE html>\n<html lang="ru">\n<head><title>Vue App</title></head>\n<body><div id="app"></div><script type="module" src="/src/main.js"></script></body>\n</html>\n' },
            { path: 'src/main.js', content: 'import { createApp } from "vue";\nimport App from "./App.vue";\n\ncreateApp(App).mount("#app");\n' },
            { path: 'src/App.vue', content: '<template>\n  <div>\n    <h1>{{ message }}</h1>\n  </div>\n</template>\n\n<script setup>\nimport { ref } from "vue";\nconst message = ref("Hello, Vue 3!");\n</script>\n' },
            { path: 'vite.config.js', content: 'import { defineConfig } from "vite";\nimport vue from "@vitejs/plugin-vue";\n\nexport default defineConfig({\n  plugins: [vue()],\n});\n' },
            { path: '.gitignore', content: 'node_modules/\ndist/\n.env\n' },
        ],
    },
    flask: {
        name: 'Flask приложение',
        files: [
            { path: 'app.py', content: 'from flask import Flask, render_template\n\napp = Flask(__name__)\n\n@app.route("/")\ndef index():\n    return "<h1>Hello, Flask!</h1>"\n\nif __name__ == "__main__":\n    app.run(debug=True)\n' },
            { path: 'requirements.txt', content: 'flask\n' },
            { path: 'templates/index.html', content: '<!DOCTYPE html>\n<html>\n<head><title>Flask App</title></head>\n<body><h1>Hello!</h1></body>\n</html>\n' },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\n.venv/\n.env\n' },
        ],
    },
    express: {
        name: 'Express.js API',
        files: [
            { path: 'package.json', content: '{\n  "name": "express-api",\n  "version": "1.0.0",\n  "main": "index.js",\n  "scripts": {\n    "start": "node index.js",\n    "dev": "node --watch index.js"\n  },\n  "dependencies": {\n    "express": "^4.18.0"\n  }\n}\n' },
            { path: 'index.js', content: 'const express = require("express");\nconst app = express();\n\napp.use(express.json());\n\napp.get("/", (req, res) => {\n  res.json({ message: "Hello, Express!" });\n});\n\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => console.log(`Server running on port ${PORT}`));\n' },
            { path: '.gitignore', content: 'node_modules/\n.env\n' },
        ],
    },
    'telegram-bot': {
        name: 'Telegram бот (Python)',
        files: [
            { path: 'bot.py', content: 'import os\nimport logging\nfrom telegram import Update\nfrom telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes\n\nlogging.basicConfig(level=logging.INFO)\nlogger = logging.getLogger(__name__)\n\nasync def start(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    await update.message.reply_text("Привет! Я Telegram бот.")\n\nasync def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    await update.message.reply_text("Доступные команды: /start, /help")\n\nasync def echo(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    await update.message.reply_text(update.message.text)\n\ndef main():\n    token = os.getenv("TELEGRAM_TOKEN")\n    app = Application.builder().token(token).build()\n    \n    app.add_handler(CommandHandler("start", start))\n    app.add_handler(CommandHandler("help", help_command))\n    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))\n    \n    logger.info("Бот запущен")\n    app.run_polling()\n\nif __name__ == "__main__":\n    main()\n' },
            { path: 'requirements.txt', content: 'python-telegram-bot\n' },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\n.env\n' },
            { path: 'README.md', content: '# Telegram Bot\n\n## Настройка\n1. Создайте бота через @BotFather\n2. Скопируйте токен в .env\n3. Запустите: python bot.py\n' },
        ],
    },
    cli: {
        name: 'CLI утилита (Node.js)',
        files: [
            { path: 'package.json', content: '{\n  "name": "my-cli",\n  "version": "1.0.0",\n  "bin": {\n    "mycli": "./cli.js"\n  },\n  "scripts": {\n    "start": "node cli.js"\n  }\n}\n' },
            { path: 'cli.js', content: '#!/usr/bin/env node\n\nconst args = process.argv.slice(2);\n\nif (args.length === 0) {\n  console.log("Usage: mycli <command>");\n  process.exit(1);\n}\n\nconsole.log("Running:", args.join(" "));\n' },
            { path: '.gitignore', content: 'node_modules/\n.env\n' },
        ],
    },
    nextjs: {
        name: 'Next.js 14 проект',
        files: [
            { path: 'package.json', content: '{\n  "name": "nextjs-app",\n  "version": "0.1.0",\n  "scripts": {\n    "dev": "next dev",\n    "build": "next build",\n    "start": "next start"\n  },\n  "dependencies": {\n    "next": "14.0.0",\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  }\n}\n' },
            { path: 'app/layout.js', content: 'export default function Layout({ children }) {\n  return (\n    <html>\n      <body>{children}</body>\n    </html>\n  );\n}\n' },
            { path: 'app/page.js', content: 'export default function Home() {\n  return (\n    <main>\n      <h1>Hello, Next.js 14!</h1>\n    </main>\n  );\n}\n' },
            { path: 'next.config.js', content: '/** @type {import("next").NextConfig} */\nconst nextConfig = {};\n\nmodule.exports = nextConfig;\n' },
            { path: '.gitignore', content: 'node_modules/\n.next/\n.env\n' },
        ],
    },
    fastapi: {
        name: 'FastAPI проект',
        files: [
            { path: 'main.py', content: 'from fastapi import FastAPI\nfrom pydantic import BaseModel\n\napp = FastAPI()\n\nclass Item(BaseModel):\n    name: str\n    price: float\n    quantity: int = 1\n\n@app.get("/")\ndef read_root():\n    return {"message": "Hello, FastAPI!"}\n\n@app.post("/items/")\ndef create_item(item: Item):\n    return {"item": item, "total": item.price * item.quantity}\n' },
            { path: 'requirements.txt', content: 'fastapi\nuvicorn\npydantic\n' },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\n.venv/\n.env\n' },
        ],
    },
    django: {
        name: 'Django проект',
        files: [
            { path: 'manage.py', content: '#!/usr/bin/env python\nimport os\nimport sys\n\nif __name__ == "__main__":\n    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "project.settings")\n    from django.core.management import execute_from_command_line\n    execute_from_command_line(sys.argv)\n' },
            { path: 'project/__init__.py', content: '' },
            { path: 'project/settings.py', content: 'SECRET_KEY = "django-insecure-key"\nDEBUG = True\nALLOWED_HOSTS = []\n\nINSTALLED_APPS = [\n    "django.contrib.contenttypes",\n    "django.contrib.auth",\n]\n' },
            { path: 'requirements.txt', content: 'django\n' },
            { path: '.gitignore', content: '__pycache__/\n*.pyc\n.venv/\n.env\ndb.sqlite3\n' },
        ],
    },
    go: {
        name: 'Go проект',
        files: [
            { path: 'main.go', content: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, Go!")\n}\n' },
            { path: 'go.mod', content: 'module github.com/user/project\n\ngo 1.21\n' },
            { path: '.gitignore', content: '*.exe\n*.test\n*.out\n' },
        ],
    },
    rust: {
        name: 'Rust проект',
        files: [
            { path: 'src/main.rs', content: 'fn main() {\n    println!("Hello, Rust!");\n}\n' },
            { path: 'Cargo.toml', content: '[package]\nname = "project"\nversion = "0.1.0"\nedition = "2021"\n' },
            { path: '.gitignore', content: 'target/\n' },
        ],
    },
};

/**
 * Выполняет команду инициализации шаблона
 * @param {string} templateName - Название шаблона
 * @returns {Promise<void>}
 */
async function initTemplate(templateName) {
    const template = TEMPLATES[templateName.toLowerCase()];

    if (!template) {
        console.error(chalk.red(`\n❌ Шаблон "${templateName}" не найден.`));
        console.log(chalk.yellow('\nДоступные шаблоны:'));
        
        for (const [key, value] of Object.entries(TEMPLATES)) {
            console.log(chalk.gray(`  • ${key}`) + chalk.white(` — ${value.name}`));
        }
        
        console.log('\nПример: node zai.js --init react\n');
        process.exit(1);
    }

    const targetDir = path.join(process.cwd(), templateName.toLowerCase());

    if (require('fs').existsSync(targetDir)) {
        console.error(chalk.red(`\n❌ Директория "${targetDir}" уже существует.`));
        process.exit(1);
    }

    console.log(chalk.cyan(`\n📦 Создание шаблона: ${template.name}`));
    console.log(chalk.gray(`   Директория: ${targetDir}\n`));

    const files = template.files.map(f => ({
        path: path.join(targetDir, f.path),
        content: f.content,
    }));

    // Простой прогресс-бар
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

    console.log(chalk.green(`\n✨ Шаблон создан в: ${targetDir}`));
    console.log(chalk.gray('\nДалее:'));
    console.log(chalk.cyan(`  cd ${templateName.toLowerCase()}`));
    
    if (templateName.toLowerCase() === 'node' || templateName.toLowerCase() === 'react' || 
        templateName.toLowerCase() === 'vue' || templateName.toLowerCase() === 'nextjs' ||
        templateName.toLowerCase() === 'express' || templateName.toLowerCase() === 'cli') {
        console.log(chalk.cyan('  npm install'));
    } else if (templateName.toLowerCase() === 'python' || templateName.toLowerCase() === 'flask' ||
               templateName.toLowerCase() === 'fastapi' || templateName.toLowerCase() === 'django' ||
               templateName.toLowerCase() === 'telegram-bot') {
        console.log(chalk.cyan('  pip install -r requirements.txt'));
    } else if (templateName.toLowerCase() === 'go') {
        console.log(chalk.cyan('  go mod tidy'));
    } else if (templateName.toLowerCase() === 'rust') {
        console.log(chalk.cyan('  cargo build'));
    }
    
    console.log('');
}

/**
 * Получает список доступных шаблонов
 * @returns {Array<{id: string, name: string}>}
 */
function getTemplates() {
    return Object.entries(TEMPLATES).map(([key, value]) => ({
        id: key,
        name: value.name,
    }));
}

module.exports = {
    TEMPLATES,
    initTemplate,
    getTemplates,
};
