# notify
Бот с уведомлениями об обновлениях в плейлистах Spotify

## Технологии
- Node.js
- Express.js framework
- Telegram bot API
- Spotify API
- OAuth
- MySQL

## Описание
Бот, присылающий сообщение в Telegram каждый раз, когда в одном из отслеживаемых плейлистов появляются новые композиции.

Поддерживаются следующие команды:

**/start** Авторизоваться в Spotify

**/add \<url\>** Отслеживать плейлист по ссылке

**/show** Показать список отслеживаемых плейлистов

## Установка и конфигурация
Для корректной работы в директории config должен находиться файл настроек следующего формата:
``` JSON
{
  "App": {
    "mysql": {
      "host": "localhost",
      "database": "notify",
      "user": "root",
      "password": "root"
    },
    "spotify": {
      "clientId": "spotify client id",
      "clientSecret": "spotify client secret",
      "redirectUri": "server uri"
    },
    "telegram": {
      "token": "token",
      "uri": "https://t.me/spotifications_bot"
    },
    "server": {
      "host": "localhost",
      "port": 80,
      "updateInterval": 1000
    }
  }
}
```

Запуск происходит с помощью команды **npm start**
