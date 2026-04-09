// DOM элементы
const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');
const offlineBadge = document.getElementById('offline-badge');
const installBadge = document.getElementById('install-badge');

let deferredPrompt;

// Активация кнопки
function setActiveButton(activeId) {
  [homeBtn, aboutBtn].forEach(btn => btn.classList.remove('active'));
  document.getElementById(activeId).classList.add('active');
}

// Загрузка контента по сети или из кэша
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

// ========== ЛОГИКА ЗАМЕТОК (та же, что была) ==========
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
  todos.push({ text: text, completed: false, createdAt: new Date().toISOString() });
  saveTodos(todos);
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

// ========== СТАТУС СЕТИ И PWA ==========
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

// Регистрация Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker зарегистрирован, scope:', registration.scope);
    } catch (err) {
      console.error('Ошибка регистрации Service Worker:', err);
    }
  });
}

// Загружаем главную страницу по умолчанию
homeBtn.addEventListener('click', () => {
  setActiveButton('home-btn');
  loadContent('home');
});

aboutBtn.addEventListener('click', () => {
  setActiveButton('about-btn');
  loadContent('about');
});

// Старт
updateNetworkStatus();
loadContent('home');