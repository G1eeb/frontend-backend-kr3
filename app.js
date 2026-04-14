// ===== DOM ЭЛЕМЕНТЫ =====
const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');
const offlineBadge = document.getElementById('offline-badge');
const installBadge = document.getElementById('install-badge');

let deferredPrompt;
let socket = null;

// ===== PUSH УВЕДОМЛЕНИЯ =====
const VAPID_PUBLIC_KEY = 'BBS93vjmm60dUloa0zki7EYTND5dK2ml6KoUyWRneTcddMn5Bl1DoFuYUHTpFE8me5i-tti3C6eS4KyCV5YhzG0';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push не поддерживается');
    return;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    
    await fetch('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
    
    console.log('✅ Подписка на push отправлена');
  } catch (err) {
    console.error('❌ Ошибка подписки на push:', err);
  }
}

async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  
  if (subscription) {
    await fetch('/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });
    
    await subscription.unsubscribe();
    console.log('🔕 Отписка выполнена');
  }
}

// ===== WEBSOCKET =====
function initWebSocket() {
  if (!navigator.onLine) {
    console.log('📡 Офлайн-режим');
    return null;
  }
  
  try {
    const s = io();
    
    s.on('connect', () => {
      console.log('✅ WebSocket подключен!');
    });
    
    s.on('connect_error', (err) => {
      console.warn('⚠️ WebSocket ошибка:', err.message);
    });
    
    s.on('taskAdded', (task) => {
      console.log('🔄 Новая задача:', task);
      showToast(`✨ ${task.text}`);
      
      // Обновляем список заметок
      if (document.getElementById('notes-list')) {
        loadNotes();
      }
    });
    
    return s;
  } catch (err) {
    console.error('❌ Ошибка WebSocket:', err);
    return null;
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ===== НАВИГАЦИЯ =====
function setActiveButton(activeId) {
  [homeBtn, aboutBtn].forEach(btn => btn.classList.remove('active'));
  document.getElementById(activeId).classList.add('active');
}

async function loadContent(page) {
  try {
    const response = await fetch(`/content/${page}.html`);
    const html = await response.text();
    contentDiv.innerHTML = html;
    
    if (page === 'home') {
      initNotes();
    }
  } catch (err) {
    console.error('Ошибка загрузки:', err);
    contentDiv.innerHTML = '<p style="color: red; text-align: center;">❌ Ошибка загрузки</p>';
  }
}

// ===== ЛОГИКА ЗАМЕТОК С НАПОМИНАНИЯМИ =====
function loadNotes() {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  renderNotes(notes);
}

function saveNotes(notes) {
  localStorage.setItem('notes', JSON.stringify(notes));
  renderNotes(notes);
}

function renderNotes(notes) {
  const list = document.getElementById('notes-list');
  if (!list) return;
  
  if (notes.length === 0) {
    list.innerHTML = '<li style="text-align: center; color: #6c757d;">✨ Нет заметок. Добавьте новую заметку!</li>';
    return;
  }

  list.innerHTML = notes.map((note, index) => {
    let reminderInfo = '';
    if (note.reminder) {
      const date = new Date(note.reminder);
      reminderInfo = `<br><small style="color: #e67e22;">⏰ Напоминание: ${date.toLocaleString()}</small>`;
    }
    return `
      <li class="card" style="margin-bottom: 0.5rem; padding: 12px 16px; background: #f8f9fa; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <span style="flex: 1; ${note.completed ? 'text-decoration: line-through; color: #6c757d;' : ''}">
            ${escapeHtml(note.text)}
            ${reminderInfo}
          </span>
          <div>
            <button onclick="window.toggleNote(${index})" style="background: #28a745; color: white; border: none; border-radius: 4px; padding: 4px 8px; margin-right: 4px; cursor: pointer;">✓</button>
            <button onclick="window.deleteNote(${index})" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer;">🗑</button>
          </div>
        </div>
      </li>
    `;
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.toggleNote = function(index) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  if (notes[index]) {
    notes[index].completed = !notes[index].completed;
    saveNotes(notes);
  }
};

window.deleteNote = function(index) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  const deletedNote = notes[index];
  notes.splice(index, 1);
  saveNotes(notes);
  
  // Отправляем запрос на сервер для отмены запланированного напоминания
  if (deletedNote && deletedNote.id && deletedNote.reminder && socket && socket.connected) {
    socket.emit('cancelReminder', { id: deletedNote.id });
  }
};

function addNote(text) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  const newNote = {
    id: Date.now(),
    text: text,
    completed: false,
    reminder: null,
    createdAt: new Date().toISOString()
  };
  notes.push(newNote);
  saveNotes(notes);
  
  if (socket && socket.connected) {
    socket.emit('newTask', { text: text, id: newNote.id });
  }
}

function addReminder(text, reminderTime) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  const newNote = {
    id: Date.now(),
    text: text,
    completed: false,
    reminder: reminderTime,
    createdAt: new Date().toISOString()
  };
  notes.push(newNote);
  saveNotes(notes);
  
  // Отправляем на сервер для планирования push-уведомления
  if (socket && socket.connected) {
    socket.emit('newReminder', {
      id: newNote.id,
      text: text,
      reminderTime: reminderTime
    });
  }
}

function initNotes() {
  const todoForm = document.getElementById('todo-form');
  const todoInput = document.getElementById('todo-input');
  const reminderForm = document.getElementById('reminder-form');
  const reminderText = document.getElementById('reminder-text');
  const reminderTime = document.getElementById('reminder-time');
  
  if (!todoForm) return;
  
  loadNotes();
  
  todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    if (text) {
      addNote(text);
      todoInput.value = '';
      todoInput.focus();
    }
  });
  
  if (reminderForm) {
    reminderForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = reminderText.value.trim();
      const time = reminderTime.value;
      
      if (text && time) {
        const reminderTimestamp = new Date(time).getTime();
        const now = Date.now();
        
        if (reminderTimestamp <= now) {
          showToast('⚠️ Время напоминания должно быть в будущем');
          return;
        }
        
        addReminder(text, reminderTimestamp);
        reminderText.value = '';
        reminderTime.value = '';
        reminderText.focus();
        showToast(`🔔 Напоминание запланировано на ${new Date(reminderTimestamp).toLocaleString()}`);
      }
    });
  }
}

// ===== СТАТУС СЕТИ =====
function updateNetworkStatus() {
  const badge = document.getElementById('offline-badge');
  if (badge) {
    badge.style.display = navigator.onLine ? 'none' : 'block';
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBadge.style.display = 'block';
});

installBadge.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  installBadge.style.display = 'none';
  deferredPrompt = null;
});

window.addEventListener('online', () => {
  updateNetworkStatus();
  if (!socket) {
    socket = initWebSocket();
  }
});

window.addEventListener('offline', () => {
  updateNetworkStatus();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
});

// ===== РЕГИСТРАЦИЯ SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ Service Worker зарегистрирован');
      
      const enableBtn = document.getElementById('enable-push');
      const disableBtn = document.getElementById('disable-push');
      
      if (enableBtn && disableBtn) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          enableBtn.style.display = 'none';
          disableBtn.style.display = 'inline-block';
        }
        
        enableBtn.addEventListener('click', async () => {
          if (Notification.permission === 'denied') {
            alert('Разрешите уведомления в настройках браузера');
            return;
          }
          
          if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
              alert('Необходимо разрешить уведомления');
              return;
            }
          }
          
          await subscribeToPush();
          enableBtn.style.display = 'none';
          disableBtn.style.display = 'inline-block';
        });
        
        disableBtn.addEventListener('click', async () => {
          await unsubscribeFromPush();
          disableBtn.style.display = 'none';
          enableBtn.style.display = 'inline-block';
        });
      }
      
    } catch (err) {
      console.error('❌ Ошибка регистрации:', err);
    }
  });
}

// ===== ЗАПУСК =====
homeBtn.addEventListener('click', () => {
  setActiveButton('home-btn');
  loadContent('home');
});

aboutBtn.addEventListener('click', () => {
  setActiveButton('about-btn');
  loadContent('about');
});

socket = initWebSocket();
updateNetworkStatus();
loadContent('home');