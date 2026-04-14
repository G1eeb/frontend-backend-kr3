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
// Хранилище активных напоминаний: ключ - id заметки, значение - объект с таймером и данными
const reminders = new Map();
// Хранилище отправленных напоминаний (для откладывания)
const sentReminders = new Map();

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
    origin: "https://localhost:3001",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
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

  // Обработка нового напоминания
  socket.on('newReminder', (reminder) => {
    const { id, text, reminderTime } = reminder;
    const delay = reminderTime - Date.now();
    
    if (delay <= 0) {
      console.log('⏰ Напоминание в прошлом, игнорируем');
      return;
    }

    console.log(`⏰ Планируем напоминание "${text}" через ${Math.round(delay / 1000)} сек. (ID: ${id})`);

    // Сохраняем таймер
    const timeoutId = setTimeout(() => {
      console.log(`🔔 Отправляем push-уведомление для напоминания ID: ${id}`);
      
      // Отправляем push-уведомление всем подписанным клиентам
      const payload = JSON.stringify({
        title: '🔔 Напоминание',
        body: text,
        reminderId: id
      });

      subscriptions.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(err => {
          console.error('Push error:', err);
          if (err.statusCode === 410) {
            subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
          }
        });
      });

      // Сохраняем напоминание в отправленные (для возможности откладывания)
      sentReminders.set(id, { text, originalTime: reminderTime });
      
      // Удаляем напоминание из активных
      reminders.delete(id);
    }, delay);

    reminders.set(id, { timeoutId, text, reminderTime });
  });

  // Обработка отмены напоминания (при удалении заметки)
  socket.on('cancelReminder', ({ id }) => {
    if (reminders.has(id)) {
      const reminder = reminders.get(id);
      clearTimeout(reminder.timeoutId);
      reminders.delete(id);
      console.log(`❌ Напоминание ID: ${id} отменено`);
    }
    if (sentReminders.has(id)) {
      sentReminders.delete(id);
      console.log(`❌ Отправленное напоминание ID: ${id} удалено из архива`);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Клиент отключён:', socket.id);
  });
});

// Эндпоинт для откладывания напоминания
app.post('/snooze', (req, res) => {
  const reminderId = parseInt(req.query.reminderId, 10);
  
  if (!reminderId || isNaN(reminderId)) {
    return res.status(400).json({ error: 'Invalid reminderId' });
  }
  
  let reminderText = null;
  let reminder = reminders.get(reminderId);
  
  // Проверяем, есть ли напоминание в активных
  if (reminder) {
    reminderText = reminder.text;
    console.log(`📝 Найдено активное напоминание ID: ${reminderId}, текст: ${reminderText}`);
  } 
  // Проверяем, есть ли напоминание в отправленных
  else if (sentReminders.has(reminderId)) {
    reminderText = sentReminders.get(reminderId).text;
    console.log(`📝 Найдено отправленное напоминание ID: ${reminderId}, текст: ${reminderText}`);
  } 
  else {
    console.log(`⚠️ Напоминание ID: ${reminderId} не найдено ни в одном хранилище`);
    return res.status(404).json({ error: 'Reminder not found' });
  }
  
  // Если был активный таймер - отменяем его
  if (reminder) {
    clearTimeout(reminder.timeoutId);
  }
  
  // Создаём новый таймер на 10 секунд
  const snoozeDelay = 10 * 1000;
  const newTimeoutId = setTimeout(() => {
    console.log(`🔔 Отправляем отложенное напоминание ID: ${reminderId}`);
    
    const payload = JSON.stringify({
      title: '🔔 Напоминание (отложенное)',
      body: reminderText,
      reminderId: reminderId
    });

    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, payload).catch(err => {
        console.error('Push error:', err);
        if (err.statusCode === 410) {
          subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
        }
      });
    });

    // Очищаем хранилища
    reminders.delete(reminderId);
    sentReminders.delete(reminderId);
  }, snoozeDelay);

  // Обновляем хранилище активных напоминаний
  reminders.set(reminderId, {
    timeoutId: newTimeoutId,
    text: reminderText,
    reminderTime: Date.now() + snoozeDelay
  });
  
  // Удаляем из отправленных, если там было
  if (sentReminders.has(reminderId)) {
    sentReminders.delete(reminderId);
  }

  console.log(`⏰ Напоминание ID: ${reminderId} отложено на 10 секунд`);
  res.status(200).json({ message: 'Reminder snoozed for 10 seconds' });
});

app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  // Проверяем, нет ли уже такой подписки
  const exists = subscriptions.some(sub => sub.endpoint === subscription.endpoint);
  if (!exists) {
    subscriptions.push(subscription);
  }
  console.log(`📢 Push-подписка сохранена. Всего подписок: ${subscriptions.length}`);
  res.status(201).json({ message: 'Подписка сохранена' });
});

app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  subscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
  console.log(`🔕 Push-подписка удалена. Осталось подписок: ${subscriptions.length}`);
  res.status(200).json({ message: 'Подписка удалена' });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🔒 HTTPS сервер запущен на https://localhost:${PORT}`);
  console.log(`📡 Socket.IO ожидает подключения`);
});