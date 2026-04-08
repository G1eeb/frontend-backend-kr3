// DOM элементы
const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const offlineBadge = document.getElementById('offline-badge');
const installBadge = document.getElementById('install-badge');

// Переменная для отслеживания события установки PWA
let deferredPrompt;

// Загрузка дел из localStorage
function loadTodos() {
  const todos = JSON.parse(localStorage.getItem('todos') || '[]');
  renderTodos(todos);
}

// Сохранение дел в localStorage
function saveTodos(todos) {
  localStorage.setItem('todos', JSON.stringify(todos));
  renderTodos(todos);
}

// Рендер списка дел
function renderTodos(todos) {
  if (todos.length === 0) {
    list.innerHTML = '<li style="text-align: center; color: #6c757d;">✨ Нет дел. Добавьте новую задачу!</li>';
    return;
  }

  list.innerHTML = todos.map((todo, index) => `
    <li>
      <span class="todo-text ${todo.completed ? 'completed' : ''}" data-index="${index}">
        ${escapeHtml(todo.text)}
      </span>
      <button class="delete-btn" data-index="${index}">🗑 Удалить</button>
    </li>
  `).join('');

  // Добавляем обработчики для переключения статуса
  document.querySelectorAll('.todo-text').forEach(el => {
    el.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      toggleTodo(index);
    });
  });

  // Добавляем обработчики для удаления
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      deleteTodo(index);
    });
  });
}

// Экранирование HTML для безопасности
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Добавление нового дела
function addTodo(text) {
  const todos = JSON.parse(localStorage.getItem('todos') || '[]');
  todos.push({
    text: text,
    completed: false,
    createdAt: new Date().toISOString()
  });
  saveTodos(todos);
}

// Переключение статуса выполнения
function toggleTodo(index) {
  const todos = JSON.parse(localStorage.getItem('todos') || '[]');
  if (todos[index]) {
    todos[index].completed = !todos[index].completed;
    saveTodos(todos);
  }
}

// Удаление дела
function deleteTodo(index) {
  const todos = JSON.parse(localStorage.getItem('todos') || '[]');
  todos.splice(index, 1);
  saveTodos(todos);
}

// Обработка отправки формы
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (text) {
    addTodo(text);
    input.value = '';
    input.focus();
  }
});

// Отображение статуса сети
function updateNetworkStatus() {
  if (!navigator.onLine) {
    offlineBadge.style.display = 'block';
  } else {
    offlineBadge.style.display = 'none';
  }
}

// Обработка установки PWA
window.addEventListener('beforeinstallprompt', (e) => {
  // Предотвращаем автоматическое отображение диалога установки в Chrome
  e.preventDefault();
  // Сохраняем событие для последующего использования
  deferredPrompt = e;
  // Показываем кнопку установки
  installBadge.style.display = 'block';
});

// Обработка клика по кнопке установки
installBadge.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  
  // Показываем диалог установки
  deferredPrompt.prompt();
  
  // Ждём ответа пользователя
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`Пользователь ${outcome === 'accepted' ? 'установил' : 'отклонил'} приложение`);
  
  // Скрываем кнопку
  installBadge.style.display = 'none';
  // Очищаем сохранённое событие
  deferredPrompt = null;
});

// Скрываем кнопку установки, если приложение уже установлено
window.addEventListener('appinstalled', () => {
  console.log('PWA установлено');
  installBadge.style.display = 'none';
  deferredPrompt = null;
});

// Следим за изменением статуса сети
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// Первоначальная загрузка
loadTodos();
updateNetworkStatus();

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
} else {
  console.log('Service Worker не поддерживается этим браузером');
}