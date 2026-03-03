# z.ai CLI

Полноценный CLI-клиент для работы с API z.ai (Zhipu AI / GLM модели) с поддержкой работы с проектами, генерации кода, рефакторинга и анализа.

## 🚀 Возможности

| Режим | Описание |
|-------|----------|
| **Чат** | Интерактивный диалог с AI с историей контекста |
| **--create** | Генерация проектов и файлов по описанию |
| **--init** | Быстрое создание шаблонов проектов |
| **--project** | Работа с текущим проектом (анализ + изменения) |
| **--refactor** | Рефакторинг файлов с предложениями |
| **--analyze** | Глубокий анализ кода (код-ревью) |
| **--explain** | Подробное объяснение как работает код |
| **--test** | Генерация тестов для кода |
| **--doc** | Создание документации (README) |

### ✨ Новые возможности (v1.1)

- **🎨 Цветной вывод** — улучшенная читаемость с подсветкой синтаксиса
- **⚡ Streaming** — мгновенный вывод ответов AI по мере генерации
- **📁 Конфигурация** — гибкие настройки через `zai.config.json`
- **📤 Экспорт диалогов** — сохранение истории в Markdown, HTML или TXT |

## 📦 Установка

```bash
cd C:\Users\maksi\OneDrive\Documents\GitHub\zai-cli
```

API-ключ уже настроен в файле `.env`.

## 💡 Использование

### Интерактивный чат

```bash
# Запуск интерактивного режима
node zai.js

# Или через bat/powershell
zai.bat
.\zai.ps1
```

**Команды в чате:**
- `/help` — справка
- `/clear` — очистить историю
- `/model <name>` — сменить модель
- `/models` — список моделей
- `/history` — история диалога
- `/save file.txt` — сохранить историю
- `/load file.txt` — загрузить историю
- `/export chat.md` — экспорт в Markdown
- `/export chat.html html` — экспорт в HTML
- `/config` — показать настройки
- `/exit` — выход

### Одиночный запрос

```bash
node zai.js "Привет, как дела?"
node zai.js -m glm-4-flash "Напиши код на Python"
```

### 🛠️ Режимы работы с проектами

#### Создание проекта (--create)

Генерирует проект по описанию с автосохранением файлов:

```bash
node zai.js --create "Создай Telegram бота на Python с командами /start и /help"
node zai.js --create "Создай REST API на Express.js с маршрутами /users и /posts"
node zai.js --create "Создай Flask приложение с авторизацией"
```

Файлы сохраняются в папку `generated-project/`.

#### Шаблоны проектов (--init)

Быстрое создание шаблона проекта:

```bash
node zai.js --init node          # Node.js проект
node zai.js --init python        # Python проект
node zai.js --init react         # React приложение
node zai.js --init vue           # Vue 3 приложение
node zai.js --init flask         # Flask приложение
node zai.js --init express       # Express.js API
node zai.js --init telegram-bot  # Telegram бот (Python)
node zai.js --init cli           # CLI утилита (Node.js)
```

#### Работа с проектом (--project)

Анализирует текущий проект и выполняет задачу:

```bash
node zai.js --project "Добавь авторизацию через JWT"
node zai.js --project "Исправь ошибки в коде"
node zai.js --project "Добавь логирование"
```

AI читает файлы проекта и предлагает изменения с возможностью применить их.

#### Рефакторинг (--refactor)

Анализирует файл и предлагает улучшения:

```bash
node zai.js --refactor src/app.js
node zai.js --refactor main.py
```

Показывает предложения и спрашивает перед применением изменений.

#### Анализ кода (--analyze)

Глубокий код-ревью с поиском проблем:

```bash
node zai.js --analyze src/           # Анализ папки
node zai.js --analyze ./app.js       # Анализ файла
```

Проверяет:
- 🐛 Баги и уязвимости
- 📐 Архитектуру
- ⚡ Производительность
- 📖 Читаемость
- 🔒 Безопасность

#### Объяснение кода (--explain)

Подробное объяснение как работает код:

```bash
node zai.js --explain complex_algorithm.py
node zai.js --explain src/utils.js
```

#### Генерация тестов (--test)

Создаёт тесты для указанного файла:

```bash
node zai.js --test src/calculator.js
node zai.js --test utils.py
```

Поддерживаемые фреймворки: Jest, pytest, PHPUnit, JUnit, RSpec.

#### Создание документации (--doc)

Генерирует README.md для файла/проекта:

```bash
node zai.js --doc src/api.js
```

## 🔧 Доступные модели

| Модель | Описание |
|--------|----------|
| `glm-4` | Флагманская (по умолчанию) |
| `glm-4-flash` | Быстрая и лёгкая |
| `glm-4-air` | Сбалансированная |
| `glm-3-turbo` | Экономичная |
| `glm-4v` | С поддержкой изображений |
| `character-003` | Ролевые сценарии |

Смена модели в чате: `/model glm-4-flash`

## 📁 Структура проекта

```
zai-cli/
├── zai.js          # Основной скрипт
├── zai.bat         # Launcher для CMD
├── zai.ps1         # Launcher для PowerShell
├── .env            # API-ключ
├── .env.example    # Шаблон .env
├── .gitignore      # Игнорируемые файлы
├── zai.config.json.example  # Шаблон конфигурации
├── package.json    # npm конфигурация
└── README.md       # Документация
```

## ⚙️ Конфигурация

Создайте файл `zai.config.json` для настройки CLI:

```json
{
  "model": "glm-4",           // Модель по умолчанию
  "streaming": true,          // Потоковый вывод ответов
  "theme": "dark",            // Тема (dark/light)
  "exclude": [                // Исключаемые папки
    "node_modules",
    ".git",
    "dist"
  ],
  "maxFiles": 50,             // Макс. файлов для анализа
  "autoSaveHistory": true     // Автосохранение истории
}
```

**Форматы экспорта диалогов:**
- `md` (Markdown) — для документации
- `html` — красивая веб-страница с тёмной темой
- `txt` — простой текст

## 🔐 Настройка API-ключа

Ключ уже настроен в `.env`. Для смены:

1. Откройте `.env`
2. Замените значение `ZAI_API_KEY`

Или установите переменную окружения:

```powershell
# PowerShell
$env:ZAI_API_KEY="ваш_ключ"

# cmd
set ZAI_API_KEY=ваш_ключ
```

## 📋 Примеры использования

```bash
# 1. Создать новый проект
node zai.js --create "Создай сайт-портфолио на HTML/CSS/JS"

# 2. Инициализировать шаблон
node zai.js --init react
cd react
npm install

# 3. Проанализировать существующий код
node zai.js --analyze ./src

# 4. Рефакторинг
node zai.js --refactor app.js

# 5. Создать тесты
node zai.js --test calculator.js

# 6. Объяснить сложный код
node zai.js --explain algorithm.py

# 7. Добавить функционал в проект
node zai.js --project "Добавь кэширование Redis"

# 8. Проверить версию
node zai.js --version

# 9. Экспорт диалога
node zai.js  # затем в чате: /export chat.md
```

## ⚙️ Глобальная установка

```bash
npm link
```

После этого можно запускать из любой папки:

```bash
zai "Привет!"
zai --init python
zai --create "Создай скрипт"
```

## 📝 Лицензия

MIT
