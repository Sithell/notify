const config = require('config');
const mysql = require('mysql');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const qs = require('qs');
const express = require('express');

function refreshToken(chatId) {
    axios.post(
        'https://accounts.spotify.com/api/token',
        qs.stringify({
            grant_type: 'refresh_token',
            refresh_token: result[0].refresh_token
        }),
        {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            auth: {
                username: clientId,
                password: clientSecret
            }
        }).then(response => {
            const new_token = response.data.access_token;
            conn.query(`UPDATE users SET access_token="${new_token}" WHERE chat_id=${chatId}`);
    })
}

// Database
const conn = mysql.createConnection(config.get('App.mysql'));
conn.connect();

// Server
const app = express();

app.get('/', (req, res) => {
    axios.post('https://accounts.spotify.com/api/token',
        qs.stringify({
            grant_type: 'authorization_code',
            redirect_uri: config.get('App.spotify.redirectUri'),
            code: req.query.code
        }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            auth: {
                username: config.get('App.spotify.clientId'),
                password: config.get('App.spotify.clientSecret')
            }
        }
    ).then(response => {
        const chatId = req.query.state;
        conn.query(
            `INSERT INTO users (chat_id, access_token, refresh_token)
            VALUES (${chatId}, "${response.data.access_token}", "${response.data.refresh_token}")
            ON DUPLICATE KEY UPDATE
            access_token=VALUES(access_token),
            refresh_token=VALUES(refresh_token);`
        );
        // Автоматически обновляем токен
        setInterval(() => { refreshToken(chatId) }, response.data.expires_in * 1000);
        // Сообщаем о том, что авторизация прошла успешно
        // TODO изменить текст кнопки для авторизации
        bot.sendMessage(chatId, "Вы успешно авторизованы");
        // Перенаправляем пользователя обратно в телеграм
        res.redirect(config.get("App.telegram.uri"));

    }).catch(err => {
        console.log("Error");
        console.dir(err);
    });
});

app.listen(config.get('App.server.port'), () => {
    console.log(`Server running at ${config.get('App.server.host')}:${config.get('App.server.port')}`)
});



// Bot
const bot = new TelegramBot(config.get('App.telegram.token'), {polling: true});

bot.onText(/\/start/, (msg, match) => {
   conn.query(`SELECT * FROM users WHERE chat_id=${msg.chat.id};`, (err, result, fields) => {
       let text;
       if (result.length === 0) {
           text = "Мы еще не знакомы";
       } else {
           text = "Пользователь уже есть в базе"
       }
       bot.sendMessage(
           msg.chat.id,
           text,
           {
               reply_markup: JSON.stringify({
                   inline_keyboard: [[{
                       text: "Войти в Spotify",
                       url: "https://accounts.spotify.com/authorize?" + qs.stringify({
                           response_type: "code",
                           client_id: config.get('App.spotify.clientId'),
                           redirect_uri: config.get('App.spotify.redirectUri'),
                           scope: "playlist-read-private playlist-read-collaborative",
                           state: msg.chat.id
                       })
                   }]]
               })
           }
       );
   });
});
