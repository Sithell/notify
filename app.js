const config = require('config');
const mysql = require('mysql');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const qs = require('qs');
const express = require('express');

const redirectUri = "http://f53d168320ae.ngrok.io";
const clientId = "fb7eab063ff44d4da7b8dd39ad2678dd";
const clientSecret = "b901ef78db324303af96b5d1d5afdc90";
// Database
const conn = mysql.createConnection(config.get('App.mysql'));
conn.connect();

// Server
const app = express();

app.get('/', (req, res) => {
    res.send('Успешная авторизация, <a href="http://t.me/spotifications_bot">вернуться в телеграм</a>');
    const code = req.query.code;
    var chatId = req.query.state;

    axios.post('https://accounts.spotify.com/api/token',
        qs.stringify({
            grant_type: 'authorization_code',
            redirect_uri: config.get('App.spotify.redirectUri'),
            code: code
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
        conn.query(
            `INSERT INTO users (chat_id, access_token, refresh_token)
            VALUES (${req.query.state}, "${response.data.access_token}", "${response.data.refresh_token}")
            ON DUPLICATE KEY UPDATE
            access_token=VALUES(access_token),
            refresh_token=VALUES(refresh_token);`
        );
        console.log("Токен получен и записан в базу");
    }).catch(err => {
        console.log("Error");
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
