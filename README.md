# MIME Converter

Небольшое статическое веб-приложение для конвертации MIME encoded-word (RFC 2047):

- из MIME encoded-word (RFC 2047)` в текст
- из текст в MIME encoded-word (RFC 2047)

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

