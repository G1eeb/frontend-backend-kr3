// ===== DOM ЭЛЕМЕНТЫ =====
const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');
const offlineBadge = document.getElementById('offline-badge');
const installBadge = document.getElementById('install-badge');

let deferredPrompt;

// ===== WEBSOCKET =====
const socket = io('https://localhost:3001', {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5
});

// ===== PUSH УВЕДОМЛЕНИЯ =====
// ВАЖНО: Замените на ваш публичный VAPID-ключ из терминала!
const VAPID_PUBLIC_KEY = 'BBS93vjmm60dUloa0zki7EYTND5dK2ml6KoUyWRneTcddMn5Bl1DoFuYUHTpFE8me5i-tti3C6eS4KyCV5YhzG0';

// Конвертер base64 → Uint8Array
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

// Подписка на push
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
    
    await fetch('https://localhost:3001/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
    
    console.log('✅ Подписка на push отправлена');
  } catch (err) {
    console.error('❌ Ошибка подписки на push:', err);
  }
}

// Отписка от push
async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  
  if (subscription) {
    await fetch('https://localhost:3001/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });
    
    await subscription.unsubscribe();
    console.log('🔕 Отписка выполнена');
  }
}

// ===== НАВИГАЦИЯ (APP SHELL) =====
function setActiveButton(activeId) {
  [homeBtn, aboutBtn].forEach(btn => btn.classList.remove('active'));
  document.getElementById(activeId).classList.add('active');
}

async function loadContent(page) {
  try {
    const response = await fetch(`/content/${page}.html`);
    if (!response.ok) throw new Error('Сеть ответила с ошибкой');
    const html = await response.text();
    contentDiv.innerHTML = html;
    
    if (page === 'home') {
      initNotes();
    }
  } catch (err) {
    console.error('Ошибка загрузки:', err);
    contentDiv.innerHTML = '<p class="is-center" style="color: red;">❌ Ошибка загрузки страницы. Проверьте соединение.</p>';
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
      <span class="todo-text ${todo.completed ? 'completed' : ''}" data-index="${index}" style="flex: 1; cursor: pointer; ${todo.completed ? 'text-decoration: line-through; color: #6c757d;' : ''}">
        ${escapeHtml(todo.text)}
      </span>
      <button class="delete-btn" data-index="${index}" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer;">🗑 Удалить</button>
    </li>
  `).join('');

  document.querySelectorAll('.todo-text').forEach(el => {
    el.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      toggleTodo(index);
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      deleteTodo(index);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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
  
  // === ОТПРАВКА ЧЕРЕЗ WEBSOCKET ===
  socket.emit('newTask', { text: text, id: newTodo.id });
}

function toggleTodo(index) {
  const todos = JSON.parse(localStorage.getItem('todos') || '[]');
  if (todos[index]) {
    todos[index].completed = !todos[index].completed;
    saveTodos(todos);
  }
}

function deleteTodo(index) {
  const todos = JSON.parse(localStorage.getItem('todos') || '[]');
  todos.splice(index, 1);
  saveTodos(todos);
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

// ===== ПОЛУЧЕНИЕ СОБЫТИЙ ОТ СЕРВЕРА =====
socket.on('taskAdded', (task) => {
  console.log('🔄 Задача от другого клиента:', task);
  
  // Показываем всплывающее сообщение
  const notification = document.createElement('div');
  notification.textContent = `✨ Новая задача: ${task.text}`;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 1000;
    animation: slideIn 0.3s ease;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;
  
  // Добавляем анимацию
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
});

// ===== СТАТУС СЕТИ И PWA =====
function updateNetworkStatus() {
  if (!navigator.onLine) {
    offlineBadge.style.display = 'block';
  } else {
    offlineBadge.style.display = 'none';
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
  console.log(`Пользователь ${outcome === 'accepted' ? 'установил' : 'отклонил'} приложение`);
  installBadge.style.display = 'none';
  deferredPrompt = null;
});

window.addEventListener('appinstalled', () => {
  console.log('PWA установлено');
  installBadge.style.display = 'none';
  deferredPrompt = null;
});

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// ===== РЕГИСТРАЦИЯ SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ Service Worker зарегистрирован, scope:', registration.scope);
      
      // ===== ЛОГИКА КНОПОК PUSH =====
      const enableBtn = document.getElementById('enable-push');
      const disableBtn = document.getElementById('disable-push');
      
      if (enableBtn && disableBtn) {
        // Проверяем, есть ли уже активная подписка
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          enableBtn.style.display = 'none';
          disableBtn.style.display = 'inline-block';
        }
        
        enableBtn.addEventListener('click', async () => {
          // Проверяем разрешение на уведомления
          if (Notification.permission === 'denied') {
            alert('⚠️ Уведомления запрещены. Разрешите их в настройках браузера.');
            return;
          }
          
          if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
              alert('⚠️ Необходимо разрешить уведомления.');
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
      console.error('❌ Ошибка регистрации Service Worker:', err);
    }
  });
} else {
  console.log('Service Worker не поддерживается этим браузером');
}

// ===== ЗАГРУЗКА СТАРТОВОЙ СТРАНИЦЫ =====
homeBtn.addEventListener('click', () => {
  setActiveButton('home-btn');
  loadContent('home');
});

aboutBtn.addEventListener('click', () => {
  setActiveButton('about-btn');
  loadContent('about');
});

updateNetworkStatus();
loadContent('home');