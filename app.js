const config = require('config');
const mysql = require('mysql');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const qs = require('qs');
const express = require('express');
const urlapi = require('url');


function refreshToken(chatId) {
    conn.query(
        `SELECT * FROM users WHERE chat_id=${chatId}`,
        (err, result, files) => {
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
                        username: config.get('App.spotify.clientId'),
                        password: config.get('App.spotify.clientSecret')
                    }
                }).then(response => {
                const new_token = response.data.access_token;
                conn.query(`UPDATE users SET access_token="${new_token}" WHERE chat_id=${chatId}`);
            })
        }
    );
}

function lastUpdatedAt(playlist) {
    const tracks = playlist.tracks.items;
    let latest = 0;
    for (let i=0; i < tracks.length; i++) {
        if (Date.parse(tracks[i].added_at) > latest) {
            latest = Date.parse(tracks[i].added_at);
        }
    }
    return latest;
}

function daysPassedSince(time) {
    return Math.ceil((Date.parse(new Date()) - time) / 1000 / 60 / 60 / 24);
}
function secondsPassedSince(time) {
    return Math.ceil((Date.parse(new Date()) - time) / 1000);
}
function getPlaylistId(uri) {
    return urlapi.parse(uri).pathname.split('/')[2];
}

function getPlaylist(chatId, playlistId, callback) {
    conn.query(`SELECT * FROM users WHERE chat_id=${chatId}`, (err, result, fields) => {
        axios.get(
            `https://api.spotify.com/v1/playlists/${playlistId}`,
            {
                headers: {
                    "Authorization": `Bearer ${result[0].access_token}`
                }
            }
        ).then(response => {
            callback(response.data);
        });
    });
}

function update() {
    conn.query(
        'SELECT * FROM playlists',
        (err, playlists, fields) => {
            for (let i=0; i < playlists.length; i++) {
                getPlaylist(
                    playlists[i].user_id,
                    playlists[i].id,
                    (playlist) => {
                        const lastTimeUpdated = lastUpdatedAt(playlist);
                        const diff = lastTimeUpdated - playlists[i].updated_at;
                        if (diff > 0) {
                            bot.sendMessage(
                                playlists[i].user_id,
                                `Плейлист ${playlist.name} только что обновился`,
                                {
                                    reply_markup: JSON.stringify({
                                        inline_keyboard: [[{
                                            text: "Открыть Spotify",
                                            url: `https://open.spotify.com/playlist/${playlists[i].id}`
                                        }]]
                                    })
                                }
                            );
                            conn.query(
                                `UPDATE playlists SET updated_at=${lastTimeUpdated} 
                                WHERE user_id=${playlists[i].user_id} AND id="${playlists[i].id}";`
                            );
                        }
                    }
                );
            }
        }
    );
}

// Bot commands

function start(msg, match) {
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
}

function add(msg, match) {
    const id = getPlaylistId(match[1]);
    getPlaylist(msg.chat.id, id, (playlist) => {
        const lastTimeUpdated = lastUpdatedAt(playlist);
        conn.query(
            `INSERT INTO playlists (id, user_id, updated_at) VALUES ("${id}", ${msg.chat.id}, ${lastTimeUpdated});`
        )
        bot.sendMessage(
            msg.chat.id,
            `Плейлист ${playlist.name} добавлен в список отслеживаемых
            В последний раз он обновлялся ${daysPassedSince(lastTimeUpdated)} дней назад`
        );
    });
}

function show(msg, match) {
    conn.query(
        `SELECT * FROM playlists WHERE user_id=${msg.chat.id};`,
        (err, playlists, fields) => {
            if (playlists.length === 0) {
                bot.sendMessage(msg.chat.id, "Нет отслеживаемых плейлистов, используйте команду /add <ссылка на плейлист>");
            }
            else {
                for (let i=0; i < playlists.length; i++) {
                    var name;
                    getPlaylist(msg.chat.id, playlists[i].id, (playlist) => {
                        bot.sendMessage(
                            msg.chat.id,
                            playlist.name,
                            {
                                reply_markup: JSON.stringify({
                                    inline_keyboard: [[{
                                        text: "Отписаться",
                                        callback_data: "unsubscribe " + playlists[i].id
                                    }]]
                                })
                            }
                        );
                    });
                }
            }
        }
    );
}

function unsubscribe(chatId, playlistId) {
    conn.query(`DELETE FROM playlists WHERE user_id=${chatId} AND id="${playlistId}";`);
}

// Routes

function auth(req, res) {
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
        // TODO изменить текст кнопки после авторизации
        bot.sendMessage(chatId, "Вы успешно авторизованы");
        // Перенаправляем пользователя обратно в телеграм
        res.redirect(config.get("App.telegram.uri"));
    });
}


// Database
const conn = mysql.createConnection(config.get('App.mysql'));
conn.connect();

// Server
const app = express();

app.get('/', auth);

const port = (process.env.NODE_ENV === 'production') ? process.env.PORT : config.get('App.server.port');

app.listen(port, () => {
    console.log(`Server running at ${config.get('App.server.host')}:${port}`)
});

// Bot
const bot = new TelegramBot(config.get('App.telegram.token'), {polling: true});

bot.onText(/\/start/, start);
bot.onText(/\/add (.+)/, add);
bot.onText(/\/update/, update);
bot.onText(/\/refresh/, (msg, match) => {refreshToken(msg.chat.id)});
bot.onText(/\/show/, show);

bot.on('callback_query', function (msg) {
    const answer = msg.data.split(' ');
    switch (answer[0]) {
        case "unsubscribe":
            getPlaylist(
                msg.message.chat.id,
                answer[1],
                (playlist) => {
                    unsubscribe(msg.message.chat.id, answer[1]);
                    bot.answerCallbackQuery(msg.id, "Вы отписались от " + playlist.name, false);
                }
            );
    }
});
bot.on("polling_error", console.log);
setInterval(update, 5000);
