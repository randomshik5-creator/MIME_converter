# RMIME Converter

Небольшое статическое веб-приложение для конвертации MIME encoded-word (RFC 2047):

- из заголовка `=?UTF-8?B?...?=` в текст
- из текст обратно в MIME/Base64 заголовок

Приложение не требует сборки и подходит для GitHub Pages.

## Поддерживаемые входные форматы

- MIME encoded-word (RFC 2047)
- Текст
- JSON

## Доп. функции

- Форматирование JSON
- Сжатие JSON

## Локальный запуск

Откройте `index.html` в браузере.

## Публикация на GitHub Pages

1. Загрузите файлы в репозиторий GitHub.
2. Откройте `Settings` -> `Pages`.
3. В `Build and deployment` выберите:
   - `Source`: `Deploy from a branch`
   - Branch: `main` или `master`
   - Folder: `/ (root)`
4. Сохраните настройки и дождитесь публикации.

