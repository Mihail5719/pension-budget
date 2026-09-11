import { loadData, saveData } from './storage.js';
import { renderAll, renderTodayScreen, renderTransactionList, renderSettings } from './ui.js';
import { formatDateKey } from './utils.js';

// Список категорий расходов
const EXPENSE_CATEGORIES = [
    { id: 'products', name: '🛒 Продукты', emoji: '🛒' },
    { id: 'pharmacy', name: '💊 Аптека/Лекарства', emoji: '💊' },
    { id: 'transport', name: '🚗 Транспорт/Топливо', emoji: '🚗' },
    { id: 'utilities', name: '🏠 ЖКХ', emoji: '🏠' },
    { id: 'communication', name: '📱 Связь', emoji: '📱' },
    { id: 'health', name: '🩺 Здоровье/Врачи', emoji: '🩺' },
    { id: 'gifts', name: '🎁 Подарки', emoji: '' },
    { id: 'home', name: '🏡 Для дома', emoji: '🏡' },
    { id: 'clothes', name: '👕 Одежда', emoji: '👕' },
    { id: 'other', name: '📦 Другое', emoji: '📦' }
];

// Список категорий доходов
const INCOME_CATEGORIES = [
    { id: 'gift', name: '🎁 Подарок', emoji: '🎁' },
    { id: 'help', name: '👨‍‍👧 Помощь от детей/родственников', emoji: '👨👩‍👧' },
    { id: 'work', name: '💼 Подработка', emoji: '💼' },
    { id: 'debt', name: '💰 Возврат долга', emoji: '💰' },
    { id: 'other', name: '📦 Другое', emoji: '📦' }
];

let appData; // Глобальное состояние приложения

function init() {
    // Приветственный экран
const hasSettings = localStorage.getItem('pensionBudget');
const welcomeScreen = document.getElementById('screen-welcome');
const todayScreen = document.getElementById('screen-today');

if (!hasSettings && welcomeScreen && todayScreen) {
    todayScreen.classList.remove('active');
    welcomeScreen.classList.add('active');
    window.location.hash = '#screen-welcome';
} else {
    if (!window.location.hash || window.location.hash === '#') {
        window.location.hash = '#screen-today';
    }
}
 // Если хэш не задан — показываем главный экран
  if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '#screen-today';
  }

  // Загружаем данные
  appData = loadData();

  // Отрисовываем всё
  renderAll(appData);

  // Навешиваем обработчики
  setupEventListeners();

  console.log('Приложение инициализировано', appData);
}

function setupEventListeners() {
  // Инициализация элементов модального окна расходов
  expenseModal = document.getElementById('expense-modal');
  expenseCategorySelect = document.getElementById('expense-category');
  expenseAmountInput = document.getElementById('expense-amount');
  expenseSaveBtn = document.getElementById('btn-save-expense');
  expenseCancelBtn = document.getElementById('btn-cancel-expense');

  // Инициализация элементов модального окна доходов
  incomeModal = document.getElementById('income-modal');
  incomeCategorySelect = document.getElementById('income-category');
  incomeAmountInput = document.getElementById('income-amount');
  incomeSaveBtn = document.getElementById('btn-save-income');
  incomeCancelBtn = document.getElementById('btn-cancel-income');

  // Заполняем выпадающий список категориями расходов
  EXPENSE_CATEGORIES.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    expenseCategorySelect.appendChild(option);
  });

  // Заполняем выпадающий список категориями доходов
  INCOME_CATEGORIES.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    incomeCategorySelect.appendChild(option);
  });

  // Кнопка "Записать расход"
  const btnAddExpense = document.getElementById('btn-add-expense');
  btnAddExpense.addEventListener('click', openExpenseModal);

  // Кнопка "Добавить доход"
  const btnAddIncome = document.getElementById('btn-add-income');
  btnAddIncome.addEventListener('click', openIncomeModal);

  // Кнопки в модальном окне расходов
  expenseSaveBtn.addEventListener('click', saveExpense);
  expenseCancelBtn.addEventListener('click', closeExpenseModal);

  // Кнопки в модальном окне доходов
  incomeSaveBtn.addEventListener('click', saveIncome);
  incomeCancelBtn.addEventListener('click', closeIncomeModal);

  // Закрытие по клику на оверлей (расходы)
  expenseModal.addEventListener('click', (e) => {
    if (e.target === expenseModal.querySelector('.modal__overlay')) {
      closeExpenseModal();
    }
  });

  // Закрытие по клику на оверлей (доходы)
  incomeModal.addEventListener('click', (e) => {
    if (e.target === incomeModal.querySelector('.modal__overlay')) {
      closeIncomeModal();
    }
  });

  // Закрытие по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (expenseModal.classList.contains('is-open')) {
        closeExpenseModal();
      }
      if (incomeModal.classList.contains('is-open')) {
        closeIncomeModal();
      }
    }
    // Сохранение по Enter
    if (e.key === 'Enter') {
      if (expenseModal.classList.contains('is-open')) {
        saveExpense();
      }
      if (incomeModal.classList.contains('is-open')) {
        saveIncome();
      }
    }
  });

  // Поля ввода в настройках
  document
    .getElementById('input-pension')
    .addEventListener('change', handleSettingsChange);
  document
    .getElementById('input-pension-day')
    .addEventListener('change', handleSettingsChange);
  document
    .getElementById('input-reserve')
    .addEventListener('change', handleSettingsChange);

  // Кнопка "Добавить платёж"
  const btnAddPayment = document.getElementById('btn-add-payment');
  btnAddPayment.addEventListener('click', handleAddPayment);

  // Обработчики экспорта/импорта (обновлённые ID)
  document.getElementById('export-btn').addEventListener('click', handleExport);
  document.getElementById('import-btn').addEventListener('click', handleImport);
  document
    .getElementById('import-file')
    .addEventListener('change', processImportedFile);

  // Обработчик кнопки редактирования в модальном окне
  document
    .getElementById('btn-save-edit')
    .addEventListener('click', saveEditTransaction);
  document
    .getElementById('btn-cancel-edit')
    .addEventListener('click', closeEditModal);

  // Закрытие модального окна редактирования по клику на оверлей
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (
      e.target ===
      document.getElementById('edit-modal').querySelector('.modal__overlay')
    ) {
      closeEditModal();
    }
  });

  // Делегирование событий для кнопок удаления
  document.addEventListener('click', handleDeleteClick);
}

// Открытие модального окна доходов
function openIncomeModal() {
    incomeModal.classList.add('is-open');
    incomeCategorySelect.focus();
}

// Закрытие модального окна доходов
function closeIncomeModal() {
    incomeModal.classList.remove('is-open');
    incomeCategorySelect.value = 'gift'; // Сброс на первую категорию
    incomeAmountInput.value = '';
}

// Сохранение дохода
function saveIncome() {
    const categoryId = incomeCategorySelect.value;
    const amount = parseFloat(incomeAmountInput.value.replace(',', '.'));
    
    if (isNaN(amount) || amount <= 0) {
        alert('Пожалуйста, введите корректную сумму');
        incomeAmountInput.focus();
        return;
    }
    
    // Находим название категории
    const category = INCOME_CATEGORIES.find(c => c.id === categoryId);
    const categoryName = category ? category.name : categoryId;
    
    // Создаём транзакцию с типом "income"
    const transaction = {
        id: Date.now(),
        date: new Date().toISOString(),
        category: categoryName,
        amount: amount,
        type: 'income' // Важно! Отличает доход от расхода
    };
    
    // Добавляем в данные
    appData.transactions.push(transaction);
    
    // Сохраняем
    saveData(appData);
    
    // Закрываем модалку и перерисовываем
    closeIncomeModal();
    renderTodayScreen(appData.settings, appData.fixedExpenses, appData.transactions);
    renderTransactionList(appData.transactions, appData.settings.pensionDay);
    
    console.log('Добавлен доход:', transaction);
}

// Элементы модального окна расходов
let expenseModal, expenseCategorySelect, expenseAmountInput, expenseSaveBtn, expenseCancelBtn;

// Элементы модального окна доходов
let incomeModal, incomeCategorySelect, incomeAmountInput, incomeSaveBtn, incomeCancelBtn;

// Открытие модального окна расходов
function openExpenseModal() {
    expenseModal.classList.add('is-open');
    expenseCategorySelect.focus();
}

// Закрытие модального окна расходов
function closeExpenseModal() {
    expenseModal.classList.remove('is-open');
    expenseCategorySelect.value = 'products'; // Сброс на первую категорию
    expenseAmountInput.value = '';
}

// Обработчик добавления расхода (новая версия с модальным окном)
function handleAddExpense() {
    openExpenseModal();
}

// Сохранение расхода
function saveExpense() {
  const categoryId = expenseCategorySelect.value;
  const amount = parseFloat(expenseAmountInput.value.replace(',', '.'));

  if (isNaN(amount) || amount <= 0) {
    alert('Пожалуйста, введите корректную сумму');
    expenseAmountInput.focus();
    return;
  }

  const category = EXPENSE_CATEGORIES.find((c) => c.id === categoryId);
  const categoryName = category ? category.name : categoryId;

  const transaction = {
    id: Date.now(),
    date: new Date().toISOString(),
    category: categoryName,
    amount: amount,
    type: 'expense', // Добавили тип
  };

  appData.transactions.push(transaction);
  saveData(appData);
  closeExpenseModal();
  renderTodayScreen(
    appData.settings,
    appData.fixedExpenses,
    appData.transactions,
  );
  renderTransactionList(appData.transactions, appData.settings.pensionDay);

  console.log('Добавлен расход:', transaction);
}
// Обработчик изменения настроек
function handleSettingsChange() {
  const pensionAmount = parseFloat(
    document.getElementById('input-pension').value.replace(',', '.'),
  );

  const pensionDay = parseInt(
    document.getElementById('input-pension-day').value,
  );
  const reserveAmount = parseFloat(
    document.getElementById('input-reserve').value.replace(',', '.'),
  );

  // Валидация
  if (isNaN(pensionAmount) || pensionAmount <= 0) {
    alert('Укажите корректный размер пенсии');
    return;
  }
  if (isNaN(pensionDay) || pensionDay < 1 || pensionDay > 31) {
    alert('Укажите день от 1 до 31');
    return;
  }
  if (isNaN(reserveAmount) || reserveAmount < 0) {
    alert('Укажите корректную сумму НЗ');
    return;
  }

  // Обновляем данные
  appData.settings.pensionAmount = pensionAmount;
  appData.settings.pensionDay = pensionDay;
  appData.settings.reserveAmount = reserveAmount;

  // Сохраняем
  saveData(appData);

  // Перерисовываем
  renderTodayScreen(
    appData.settings,
    appData.fixedExpenses,
    appData.transactions,
  );

  console.log('Настройки обновлены', appData.settings);
}

// Обработчик добавления платежа
function handleAddPayment() {
  const name = prompt('Название платежа (например: ЖКХ, Лекарства):');
  if (!name) return;

  const amountStr = prompt('Сумма платежа:');
  if (!amountStr) return;

  const amount = parseFloat(amountStr.replace(',', '.'));
  if (isNaN(amount) || amount <= 0) {
    alert('Пожалуйста, введите корректную сумму');
    return;
  }

  const dayStr = prompt(
    'День месяца для оплаты (1-28):\nНапример, 5 — значит платить 5-го числа каждого месяца',
  );
  if (!dayStr) return;

  const day = parseInt(dayStr);
  if (isNaN(day) || day < 1 || day > 28) {
    alert('Пожалуйста, введите число от 1 до 28');
    return;
  }

  const payment = {
    id: Date.now(),
    name: name.trim(),
    amount: amount,
    day: day, // ← День платежа добавлен!
  };

  appData.fixedExpenses.push(payment);
  saveData(appData);
  renderSettings(appData.settings, appData.fixedExpenses);
  renderTodayScreen(
    appData.settings,
    appData.fixedExpenses,
    appData.transactions,
  );
}

// Обработчик клика по кнопкам удаления
function handleDeleteClick(event) {
  const target = event.target;

  // Редактирование транзакции
  if (target.dataset.action === 'edit-transaction') {
    const transactionId = parseInt(target.dataset.id);
    openEditModal(transactionId);
    return; // Выходим, чтобы не срабатывали другие обработчики
  }

  // Удаление транзакции (расхода)
  if (target.dataset.action === 'delete-transaction') {
    const transactionId = parseInt(target.dataset.id);
    if (confirm('Удалить эту запись о расходе?')) {
      appData.transactions = appData.transactions.filter(
        (t) => t.id !== transactionId,
      );
      saveData(appData);
      renderAll(appData);
      console.log('Транзакция удалена:', transactionId);
    }
  }

  // Удаление дохода
  if (target.dataset.action === 'delete-income') {
    const transactionId = parseInt(target.dataset.id);
    if (confirm('Удалить эту запись о доходе?')) {
      appData.transactions = appData.transactions.filter(
        (t) => t.id !== transactionId,
      );
      saveData(appData);
      renderAll(appData);
      console.log('Доход удалён:', transactionId);
    }
  }

  // Удаление платежа
  if (target.dataset.action === 'delete-payment') {
    const paymentId = parseInt(target.dataset.id);
    if (confirm('Удалить этот обязательный платёж?')) {
      appData.fixedExpenses = appData.fixedExpenses.filter(
        (p) => p.id !== paymentId,
      );
      saveData(appData);
      renderAll(appData);
      console.log('Платёж удалён:', paymentId);
    }
  }
}

/**
 * ================================================================================
 * РЕДАКТИРОВАНИЕ ТРАНЗАКЦИЙ
 * ================================================================================
 */

// ID редактируемой транзакции (сохраняется между функциями)
let editingTransactionId = null;

/**
 * Открыть модальное окно редактирования
 * @param {number} transactionId - ID транзакции для редактирования
 */
function openEditModal(transactionId) {
    // Находим транзакцию по ID
    const transaction = appData.transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    // Сохраняем ID для последующего сохранения
    editingTransactionId = transactionId;

    // Определяем тип транзакции (расход или доход)
    const isIncome = transaction.type === 'income';
    const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

    // Заполняем выпадающий список категориями
    const categorySelect = document.getElementById('edit-category');
    categorySelect.innerHTML = '';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        // Выбираем текущую категорию транзакции
        if (category.name === transaction.category) {
            option.selected = true;
        }
        categorySelect.appendChild(option);
    });

    // Заполняем сумму
    document.getElementById('edit-amount').value = transaction.amount;

    // Заполняем дату (формат YYYY-MM-DD для input type="date")
    const transactionDate = new Date(transaction.date);
    const dateStr = transactionDate.toISOString().split('T')[0];
    document.getElementById('edit-date').value = dateStr;

    // Открываем модальное окно
    document.getElementById('edit-modal').classList.add('is-open');
    document.getElementById('edit-amount').focus();
}

/**
 * Закрыть модальное окно редактирования
 */
function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('is-open');
    editingTransactionId = null;
}

/**
 * Сохранить изменения транзакции
 */
function saveEditTransaction() {
    if (!editingTransactionId) return;

    // Получаем новые значения
    const categoryId = document.getElementById('edit-category').value;
  const amount = parseFloat(
    document.getElementById('edit-amount').value.replace(',', '.'),
  );
    const dateStr = document.getElementById('edit-date').value;

    // Валидация суммы
    if (isNaN(amount) || amount <= 0) {
        alert('Пожалуйста, введите корректную сумму');
        document.getElementById('edit-amount').focus();
        return;
    }

    // Валидация даты
    if (!dateStr) {
        alert('Пожалуйста, выберите дату');
        return;
    }

    // Находим транзакцию
    const transactionIndex = appData.transactions.findIndex(t => t.id === editingTransactionId);
    if (transactionIndex === -1) {
        alert('Транзакция не найдена');
        return;
    }

    // Определяем тип транзакции (сохраняем оригинальный тип)
    const originalTransaction = appData.transactions[transactionIndex];
    const isIncome = originalTransaction.type === 'income';
    const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

    // Находим название категории
    const category = categories.find(c => c.id === categoryId);
    const categoryName = category ? category.name : categoryId;

    // Создаём новую дату (сохраняем оригинальное время)
    const originalDate = new Date(originalTransaction.date);
    const newDate = new Date(dateStr);
    newDate.setHours(originalDate.getHours(), originalDate.getMinutes(), originalDate.getSeconds());

    // Обновляем транзакцию
    appData.transactions[transactionIndex] = {
        ...originalTransaction,  // Сохраняем id и type
        category: categoryName,
        amount: amount,
        date: newDate.toISOString()
    };

    // Сохраняем данные
    saveData(appData);

    // Закрываем модалку и перерисовываем интерфейс
    closeEditModal();
    renderAll(appData);

    console.log('Транзакция обновлена:', appData.transactions[transactionIndex]);
}

// === ЭКСПОРТ/ИМПОРТ ДАННЫХ ===

// Экспорт данных в JSON-файл
function handleExport() {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `budget-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert('✅ Данные успешно сохранены в файл!');
}

// Импорт данных из JSON-файла
function handleImport() {
    document.getElementById('import-file').click(); 
}

function processImportedFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // Проверяем структуру данных
            if (!importedData.settings || !importedData.fixedExpenses || !importedData.transactions) {
                throw new Error('Неверный формат файла');
            }
            
            // Подтверждение
            if (!confirm('⚠️ Это заменит все текущие данные. Продолжить?')) {
                return;
            }
            
            // Заменяем данные
            appData = importedData;
            saveData(appData);
            
            // Перерисовываем всё
            renderAll(appData);
            
            alert('✅ Данные успешно восстановлены!');
        } catch (error) {
            alert('❌ Ошибка при импорте: ' + error.message);
        }
    };
    reader.readAsText(file);
    
    // Сбрасываем input, чтобы можно было импортировать тот же файл повторно
    event.target.value = '';
}

// Запускаем приложение после загрузки DOM
document.addEventListener('DOMContentLoaded', init);

// Привязываем обработку файла к скрытому полю импорта
const importFileInput = document.getElementById('import-file');
if (importFileInput) {
    importFileInput.addEventListener('change', processImportedFile);
}

// === ПЕРЕКЛЮЧЕНИЕ ТЕМЫ ===
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const themeToggle = document.getElementById('theme-toggle');
    
    // Если кнопки нет на странице, выходим
    if (!themeToggle) return;
    
    const themeIcon = themeToggle.querySelector('.theme-icon');
    
    // Применяем сохранённую тему при загрузке
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        themeIcon.textContent = '☀️';
    } else {
        themeIcon.textContent = '🌙';
    }
    
    // Обработчик переключения по клику
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        
        if (document.body.classList.contains('dark-theme')) {
            localStorage.setItem('theme', 'dark');
            themeIcon.textContent = '☀️';
        } else {
            localStorage.setItem('theme', 'light');
            themeIcon.textContent = '🌙';
        }
    });
}

// Вызываем функцию инициализации темы
initTheme();

// Кнопка "Начать настройку"
const btnStartSetup = document.getElementById('btn-start-setup');
if (btnStartSetup) {
    btnStartSetup.addEventListener('click', () => {
        // Скрываем приветственный экран
        const welcomeScreen = document.getElementById('screen-welcome');
        if (welcomeScreen) {
            welcomeScreen.classList.remove('active');
        }
        // Переходим в настройки
        window.location.hash = '#screen-settings';
    });
}
