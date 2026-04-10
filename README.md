# ShadowLive

ShadowLive е пълнофункционална социална мрежа в black + purple gaming стил, изградена с `Node.js + Express` и без външна база данни. Данните се пазят в JSON файлове чрез `fs`, така че приложението може да се стартира локално и да работи офлайн.

## Какво включва

- Регистрация, вход и изход
- Профил на потребителя с основни статистики
- Feed с постове, сортирани по дата
- Добавяне и изтриване на постове
- Лайкове и коментари
- Добавяне и премахване на приятели
- Списък с потребители и списък с приятели
- Лични съобщения и чат панел
- Responsive дизайн за desktop и mobile

## Технологии

- Frontend: `HTML`, `CSS`, `JavaScript`
- Backend: `Node.js`, `Express`
- Storage: JSON файлове в `server/data`

## Структура

```text
/project
 ├── /client
 │    ├── app.js
 │    ├── index.html
 │    └── styles.css
 ├── /server
 │    ├── /data
 │    │    ├── comments.json
 │    │    ├── friends.json
 │    │    ├── likes.json
 │    │    ├── messages.json
 │    │    ├── posts.json
 │    │    └── users.json
 │    └── server.js
 ├── package.json
 └── README.md
```

## Стартиране

Изисква се `Node.js 18+`.

```bash
npm install
npm start
```

След това отвори:

```text
http://localhost:3000
```

## Demo акаунти

- `admin` / `123456`
- `nova` / `123456`
- `glitch` / `123456`

Можеш и да си създадеш нов акаунт от регистрационната форма.

## API endpoints

- `POST /register`
- `POST /login`
- `POST /logout`
- `GET /users`
- `GET /profile/:id`
- `GET /posts`
- `GET /feed`
- `POST /posts`
- `DELETE /posts/:id`
- `POST /like`
- `POST /comment`
- `GET /friends/:userId`
- `POST /friends`
- `GET /messages`
- `POST /message`

## Как работи JSON storage

При всяка заявка сървърът:

1. Чете нужните JSON файлове.
2. Прави промяната в паметта.
3. Записва обратно във файла с `fs.writeFileSync`.

Така проектът остава напълно самостоятелен и без нужда от MySQL, MongoDB или друга база.

## Важно

- Паролите са в plain text само за demo сценарий. За production трябва hashing.
- Сесията е client-side чрез `localStorage`, за да няма допълнителен storage слой.
- При изтриване на пост се изчистват и свързаните лайкове и коментари.

