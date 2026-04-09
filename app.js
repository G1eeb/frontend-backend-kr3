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
      
      // Обновляем список задач
      if (document.getElementById('todo-list')) {
        loadTodos();
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

// ===== ЛОГИКА ЗАМЕТОК =====
function loadTodos() {
  const todos = JSON.parse(localStorage.getItem('todos') || '[]');
  renderTodos(todos);
}

function saveTodos(todos) {
  localStorage.setItem('todos', JSON.stringify(todos));
  renderTodos(todos);
}

function renderTodos(todos) {
  const list = document.getElementById('todo-list');
  if (!list) return;
  
  if (todos.length === 0) {
    list.innerHTML = '<li style="text-align: center; color: #6c757d;">✨ Нет дел. Добавьте новую задачу!</li>';
    return;
  }

  list.innerHTML = todos.map((todo, index) => `
    <li style="background: #f8f9fa; margin: 8px 0; padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
      <span style="flex: 1; cursor: pointer; ${todo.completed ? 'text-decoration: line-through; color: #6c757d;' : ''}" onclick="window.toggleTodo(${index})">
        ${escapeHtml(todo.text)}
      </span>
      <button onclick="window.deleteTodo(${index})" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer;">🗑</button>
    </li>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.toggleTodo = function(index) {
  const todos = JSON.parse(localStorage.getItem('todos') || '[]');
  if (todos[index]) {
    todos[index].completed = !todos[index].completed;
    saveTodos(todos);
  }
};

window.deleteTodo = function(index) {
  const todos = JSON.parse(localStorage.getItem('todos') || '[]');
  todos.splice(index, 1);
  saveTodos(todos);
};

function addTodo(text) {
  const todos = JSON.parse(localStorage.getItem('todos') || '[]');
  const newTodo = {
    id: Date.now(),
    text: text,
    completed: false,
    createdAt: new Date().toISOString()
  };
  todos.push(newTodo);
  saveTodos(todos);
  
  if (socket && socket.connected) {
    socket.emit('newTask', { text: text, id: newTodo.id });
  }
}

function initNotes() {
  const form = document.getElementById('todo-form');
  const input = document.getElementById('todo-input');
  
  if (!form) return;
  
  loadTodos();
  
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text) {
      addTodo(text);
      input.value = '';
      input.focus();
    }
  });
}

// ===== СТАТУС СЕТИ =====
function updateNetworkStatus() {
  offlineBadge.style.display = navigator.onLine ? 'none' : 'block';
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