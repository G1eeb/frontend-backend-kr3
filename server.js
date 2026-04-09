const express = require('express');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// VAPID-ключи
const vapidKeys = {
  publicKey: 'BBS93vjmm60dUloa0zki7EYTND5dK2ml6KoUyWRneTcddMn5Bl1DoFuYUHTpFE8me5i-tti3C6eS4KyCV5YhzG0',
  privateKey: 'x8xr-gZTAL27Kc-mFZ7C_qoAOI3pzPZ7fajqzsLvbpI'
};

webpush.setVapidDetails(
  'mailto:gleb_krutsyak@mail.ru',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './')));

let subscriptions = [];

// Чтение сертификатов
let httpsOptions;
try {
  httpsOptions = {
    key: fs.readFileSync('./localhost+2-key.pem'),
    cert: fs.readFileSync('./localhost+2.pem')
  };
  console.log('✅ Сертификаты загружены');
} catch (err) {
  console.error('❌ Ошибка загрузки сертификатов:', err.message);
  process.exit(1);
}

// СОЗДАЁМ HTTPS СЕРВЕР
const server = https.createServer(httpsOptions, app);

// ПОДКЛЮЧАЕМ SOCKET.IO К HTTPS СЕРВЕРУ
const io = socketIo(server, {
  cors: {
    origin: "https://localhost:3001",  // ← конкретный адрес
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']  // ← явно указываем транспорты
});

io.on('connection', (socket) => {
  console.log('✅ Клиент подключён:', socket.id);

  socket.on('newTask', (task) => {
    console.log('📝 Новая задача от клиента:', task);
    io.emit('taskAdded', task);

    const payload = JSON.stringify({
      title: '📋 Новая задача',
      body: task.text
    });

    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, payload).catch(err => {
        console.error('❌ Push error:', err);
        if (err.statusCode === 410) {
          subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
        }
      });
    });
  });

  socket.on('disconnect', () => {
    console.log('❌ Клиент отключён:', socket.id);
  });
});

app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  subscriptions.push(subscription);
  console.log('📢 Новая push-подписка сохранена');
  res.status(201).json({ message: 'Подписка сохранена' });
});

app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  subscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
  console.log('🔕 Push-подписка удалена');
  res.status(200).json({ message: 'Подписка удалена' });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🔒 HTTPS сервер запущен на https://localhost:${PORT}`);
  console.log(`📡 Socket.IO ожидает подключения`);
});