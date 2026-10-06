import { loadData, saveData } from './storage.js';
import {
  renderAll,
  renderTodayScreen,
  renderTransactionList,
  renderSettings,
  renderStatsChart,
  renderPensionPeriodInfo,
  updateSyncIndicator,
} from './ui.js';
import { formatDateKey, getCurrentPeriod, formatMoney } from './utils.js';
import { calculateDailyLimit } from './budget.js';

// ─── Предикаты типов операций (v2.0, коммит 2) ───
const isIncome = (t) => t.type === 'income';
const isExpense = (t) => t.type === 'expense';
const isCommitted = (t) => t.type === 'committed';
// деньги, покинувшие кошелёк: влияют на баланс,
// но в круг жизни попадает только isExpense
const isMoneyOut = (t) => isExpense(t) || isCommitted(t);
// ─── конец блока предикатов ───

// Список категорий расходов (v2.0)
const EXPENSE_CATEGORIES = [
  { id: 'products', name: 'Продукты', emoji: '🛒' },
  { id: 'pharmacy', name: 'Аптека', emoji: '💊' },
  { id: 'transport', name: 'Транспорт', emoji: '🚗' },
  { id: 'utilities', name: 'ЖКХ', emoji: '🏠' },
  { id: 'communication', name: 'Связь', emoji: '📱' },
  { id: 'health', name: 'Здоровье', emoji: '🩺' },
  { id: 'gifts', name: 'Подарки', emoji: '🎁' },
  { id: 'home', name: 'Для дома', emoji: '🏡' },
  { id: 'clothes', name: 'Одежда', emoji: '👕' },
  { id: 'other', name: 'Разное', emoji: '📦' }, // Глобальное переименование
  { id: 'study', name: 'Учёба', emoji: '🎓' },
  { id: 'savings', name: 'Накопления', emoji: '🏦' },
];

// Подкатегории для категорий расходов (v2.0)
const SUBCATEGORIES = {
  products: [
    { id: 'meat', name: 'Мясо' },       // Разделено
    { id: 'fish', name: 'Рыба' },        // Разделено
    { id: 'veg', name: 'Овощи и фрукты' },
    { id: 'dairy', name: 'Молочное' },
    { id: 'bread', name: 'Хлеб и бакалея' },
    { id: 'other', name: 'Разное' },
  ],
  pharmacy: [
    { id: 'medicines', name: 'Лекарства' },
    { id: 'vitamins', name: 'Витамины и БАДы' },
    { id: 'medical_devices', name: 'Медицинские изделия' },
    { id: 'hygiene', name: 'Уход и гигиена' },
    { id: 'other', name: 'Разное' }, // Резерв
  ],
  transport: [
    { id: 'fuel', name: 'Бензин' },
    { id: 'parts', name: 'Запчасти' },
    { id: 'maintenance', name: 'ТО' },
    { id: 'parking', name: 'Парковка' },
    { id: 'car_wash', name: 'Мойка' },
    { id: 'insurance', name: 'Страховка' },
    { id: 'fines', name: 'Штрафы ГИБДД' },
    { id: 'other', name: 'Разное' },
  ],
  utilities: [
    { id: 'communal', name: 'Коммуналка' }, // Вода + Отопление + Содержание
    { id: 'elec', name: 'Электричество' },
    { id: 'gas', name: 'Газ' },
    { id: 'trash', name: 'Вывоз мусора' },
    { id: 'fkr', name: 'ФКР' },
    { id: 'intercom', name: 'Домофон' },
    { id: 'other', name: 'Разное' },
  ],
  communication: [
    { id: 'mobile', name: 'Мобильный' },
    { id: 'internet_tv', name: 'Интернет и ТВ' },
    { id: 'other', name: 'Прочее' }, // Специфично для Связи по спеке
  ],
  health: [
    { id: 'consult', name: 'Консультации' },
    { id: 'tests', name: 'Анализы' },
    { id: 'procedures', name: 'Процедуры' },
    { id: 'other', name: 'Разное' },
  ],
  gifts: [
    { id: 'birthday', name: 'Дни рождения' },
    { id: 'holiday', name: 'Праздники' },
    { id: 'grandkids', name: 'Внукам' },
    { id: 'other', name: 'Разное' },
  ],
  home: [
    { id: 'furniture', name: 'Мебель' },
    { id: 'repair', name: 'Ремонт' },
    { id: 'chem', name: 'Бытовая химия' },
    { id: 'other', name: 'Разное' },
  ],
  clothes: [
    { id: 'daily', name: 'Повседневная' },
    { id: 'season', name: 'Сезонная' },
    { id: 'shoes', name: 'Обувь' },
    { id: 'other', name: 'Разное' },
  ],
  study: [
    { id: 'courses', name: 'Курсы' },
    { id: 'books', name: 'Книги' },
    { id: 'other', name: 'Разное' },
  ],
  savings: [
    { id: 'bank', name: 'На счёт в банке' },
    { id: 'cash', name: 'Наличные' },
    { id: 'other', name: 'Разное' },
  ],
  other: [
    { id: 'unexpected', name: 'Непредвиденное' },
    { id: 'hobby', name: 'Хобби' },
    { id: 'other_sub', name: 'Прочее' },
  ],
};

// Список категорий доходов (v2.0)
const INCOME_CATEGORIES = [
  { id: 'gift', name: 'Подарки', emoji: '🎁' },
  { id: 'help', name: 'Помощь от детей/родственников', emoji: '👪' },
  { id: 'work', name: 'Подработка', emoji: '💼' },
  { id: 'debt', name: 'Возврат долга', emoji: '💰' },
  { id: 'refund', name: 'Возврат переплаты', emoji: '💸' }, // Новое
  { id: 'interest', name: 'Проценты по счёту', emoji: '📈' }, // Новое
  { id: 'other', name: 'Разное', emoji: '📦' }, // Глобальное переименование
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
  window.appData = appData; // Делаем appData глобальной для ui.js

  // Одноразовая миграция: переименование старых имён
  const CATEGORY_RENAME = {
    'Аптека/Лекарства': 'Аптека',
    'Транспорт/Топливо': 'Транспорт',
    'Здоровье/Врачи': 'Здоровье',
  };
  const SUBCATEGORY_RENAME = {
    'Наличные в копилку': 'Наличные',
  };
  let renamedAny = false;
  appData.transactions.forEach((t) => {
    if (CATEGORY_RENAME[t.category]) {
      t.category = CATEGORY_RENAME[t.category];
      renamedAny = true;
    }
    if (SUBCATEGORY_RENAME[t.subcategory]) {
      t.subcategory = SUBCATEGORY_RENAME[t.subcategory];
      renamedAny = true;
    }
  });
  if (renamedAny) {
    saveData(appData);
    console.log('🔄 Миграция: имена обновлены');
  }

  // Отрисовываем всё
  renderAll(appData);

  // Навешиваем обработчики
  setupEventListeners();
    initDeleteRange();

  console.log('Приложение инициализировано', appData);
}

// Регистрация Service Worker для PWA (офлайн-режим)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker зарегистрирован:', registration.scope);
      })
      .catch((error) => {
        console.log('[PWA] Ошибка регистрации Service Worker:', error);
      });
  });
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

  // === Кнопка "Использовать НЗ" ===
  const btnUseReserve = document.getElementById('btn-use-reserve');
  if (btnUseReserve) {
    btnUseReserve.addEventListener('click', useReserve);
  }

  expenseCategorySelect.addEventListener('change', () => {
    fillSubcategories(expenseCategorySelect.value);
  });

  // При смене категории в модалке редактирования — пересоздаём подкатегории
  const editCategorySelect = document.getElementById('edit-category');
  editCategorySelect.addEventListener('change', () => {
    const categoryId = editCategorySelect.value;
    const subSelect = document.getElementById('edit-subcategory');
    subSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- выберите --';
    subSelect.appendChild(placeholder);
    const subs = SUBCATEGORIES[categoryId] || [];
    subs.forEach((sub) => {
      const option = document.createElement('option');
      option.value = sub.id;
      option.textContent = sub.name;
      subSelect.appendChild(option);
    });
  });

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
    .getElementById('input-initial-balance')
    .addEventListener('change', handleSettingsChange);
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

  // === Обработчик кнопки "Отметить поступление пенсии" ===
  const btnMarkPension = document.getElementById('btn-mark-pension');
  if (btnMarkPension) {
    btnMarkPension.addEventListener('click', () => {
      // === ПЕРЕНОС ОСТАТКА (если это не первый период) ===
      let newInitialBalance = appData.settings.initialBalance;
      if (appData.settings.currentPeriodStart) {
        const oldBalance = calculateDailyLimit(
          appData.settings,
          appData.fixedExpenses,
          appData.transactions,
        );
        // Новый начальный остаток = текущий баланс - фиксированные платежи
        newInitialBalance = oldBalance.currentBalance - oldBalance.fixedTotal;
        console.log('🔄 Перенос остатка:', newInitialBalance);
      }
      // ==========================================

      const transferMessage = appData.settings.currentPeriodStart
        ? `\n\nОстаток с прошлого периода (${newInitialBalance.toFixed(2)} ₽) будет перенесён как начальный баланс.`
        : '';

      if (
        confirm(
          `Отметить поступление пенсии сегодня?${transferMessage}\n\nДневной лимит будет пересчитан с учётом остатка.`,
        )
      ) {
        // Устанавливаем новый начальный баланс
        appData.settings.initialBalance = newInitialBalance;

        // 1. Сохраняем текущую дату как начало нового периода
        appData.settings.currentPeriodStart = new Date().toISOString();

        // 2. Сохраняем данные
        saveData(appData);

        // 3. Перерисовываем экран "Сегодня" (кнопка превратится в текст статуса)
        renderTodayScreen(
          appData.settings,
          appData.fixedExpenses,
          appData.transactions,
        );

        // 4. Если открыта статистика, обновляем и её
        if (window.expenseChartInstance) {
          renderStatsChart(appData.settings, appData.transactions);
        }
      }
    });
  }
  // ======================================================
  // === Обработчик изменения/сброса даты пенсии на главном экране ===
  const btnEditPensionDate = document.getElementById('btn-edit-pension-date');
  if (btnEditPensionDate) {
    btnEditPensionDate.addEventListener('click', () => {
      const currentDate = appData.settings.currentPeriodStart
        ? appData.settings.currentPeriodStart.split('T')[0]
        : '';

      const userChoice = prompt(
        'Введите новую дату (в формате ГГГГ-ММ-ДД, например 2026-09-23)\n\nИли оставьте поле ПУСТЫМ и нажмите ОК, чтобы ПОЛНОСТЬЮ ОТМЕНИТЬ отметку.',
        currentDate,
      );

      if (userChoice === null) return;

      if (userChoice.trim() === '') {
        if (
          confirm('Отменить отметку о получении пенсии? Кнопка появится снова.')
        ) {
          delete appData.settings.currentPeriodStart;
          saveData(appData);
          renderTodayScreen(
            appData.settings,
            appData.fixedExpenses,
            appData.transactions,
          );
          renderPensionPeriodInfo(appData.settings);
          if (window.expenseChartInstance)
            renderStatsChart(appData.settings, appData.transactions);
        }
      } else {
        const newDate = new Date(userChoice);
        if (!isNaN(newDate.getTime())) {
          // === ЯВНЫЙ ПЕРЕНОС ОСТАТКА (Наблюдение 14) ===
          const oldStart = appData.settings.currentPeriodStart
            ? new Date(appData.settings.currentPeriodStart)
            : null;

          if (oldStart && newDate.getTime() > oldStart.getTime()) {
            const oldBalance = calculateDailyLimit(
              appData.settings,
              appData.fixedExpenses,
              appData.transactions,
            );
            const carryOver = oldBalance.currentBalance - oldBalance.fixedTotal;

            const userAgrees = confirm(
              `Вы переносите период вперёд.\n\n` +
                `Нераспределённый остаток: ${carryOver.toFixed(2)} ₽\n` +
                `Он будет перенесён как начальный баланс нового периода.\n\n` +
                `Продолжить? (Нажмите "Отмена", чтобы изменить дату без переноса остатка)`,
            );

            if (!userAgrees) return;

            appData.settings.initialBalance = Math.round(carryOver * 100) / 100;
            console.log(
              '🔄 Перенос остатка:',
              appData.settings.initialBalance.toFixed(2),
              '₽',
            );
          }
          // ==========================================

          appData.settings.currentPeriodStart = newDate.toISOString();
          saveData(appData);
          renderTodayScreen(
            appData.settings,
            appData.fixedExpenses,
            appData.transactions,
          );
          renderPensionPeriodInfo(appData.settings);
          if (window.expenseChartInstance)
            renderStatsChart(appData.settings, appData.transactions);
          alert('✅ Дата успешно изменена!');
        } else {
          alert(
            '❌ Неверный формат даты. Попробуйте снова (пример: 2026-09-23).',
          );
        }
      }
    });
  }
  // ================================================================
}

// Открытие модального окна доходов
function openIncomeModal() {
  // Очищаем список
  incomeCategorySelect.innerHTML = '';

  // Заполняем список категориями с эмодзи
  INCOME_CATEGORIES.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id; // <-- ВАЖНО: сохраняем ID ('work'), а не имя!
    option.textContent = `${category.emoji} ${category.name}`.trim(); // <-- Собираем: эмодзи + чистое имя
    incomeCategorySelect.appendChild(option);
  });

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
  const category = INCOME_CATEGORIES.find((c) => c.id === categoryId);
  const categoryName = category ? category.name : categoryId;

  // Создаём транзакцию с типом "income"
  const transaction = {
    id: Date.now(),
    date: new Date().toISOString(),
    category: categoryName,
    amount: amount,
    type: 'income', // Важно! Отличает доход от расхода
  };

  // Добавляем в данные
  appData.transactions.push(transaction);

  // Сохраняем
  saveData(appData);

  // Закрываем модалку и перерисовываем
  closeIncomeModal();
  renderTodayScreen(
    appData.settings,
    appData.fixedExpenses,
    appData.transactions,
  );
  renderTransactionList(appData.transactions, appData.settings.pensionDay);

  console.log('Добавлен доход:', transaction);
}

// Элементы модального окна расходов
let expenseModal,
  expenseCategorySelect,
  expenseAmountInput,
  expenseSaveBtn,
  expenseCancelBtn;

// Элементы модального окна доходов
let incomeModal,
  incomeCategorySelect,
  incomeAmountInput,
  incomeSaveBtn,
  incomeCancelBtn;

// Заполняем селект подкатегорий по выбранной категории
function fillSubcategories(categoryId) {
  const select = document.getElementById('expense-subcategory');
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- выберите --';
  select.appendChild(placeholder);
  const subs = SUBCATEGORIES[categoryId] || [];
  subs.forEach((sub) => {
    const option = document.createElement('option');
    option.value = sub.id;
    option.textContent = sub.name;
    select.appendChild(option);
  });
}

// Открытие модального окна расходов с гарантированным заполнением категорий
function openExpenseModal() {
  // 1. Очищаем список (на случай, если он уже был заполнен)
  expenseCategorySelect.innerHTML = '';

  // // 2. Заполняем список категориями с эмодзи из нашего исправленного массива
  EXPENSE_CATEGORIES.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id; // Сохраняем чистое имя (без эмодзи)
    option.textContent = `${category.emoji || ''} ${category.name}`.trim(); // Показываем с эмодзи
    expenseCategorySelect.appendChild(option);
  });

  // 3. Открываем окно и ставим фокус на список
  expenseModal.classList.add('is-open');
  expenseCategorySelect.focus();
  fillSubcategories(expenseCategorySelect.value);
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

  const itemInput = document.getElementById('expense-item');
  const itemValue = itemInput.value.trim();

  const subSelect = document.getElementById('expense-subcategory');
  const subId = subSelect.value;
  if (!subId) {
    alert('Пожалуйста, выберите подкатегорию');
    subSelect.focus();
    return;
  }
  const subs = SUBCATEGORIES[categoryId] || [];
  const sub = subs.find((s) => s.id === subId);
  const subName = sub ? sub.name : subId;

  const category = EXPENSE_CATEGORIES.find((c) => c.id === categoryId);
  const categoryName = category ? category.name : categoryId;

  const transaction = {
    id: Date.now(),
    date: new Date().toISOString(),
    category: categoryName,
    subcategory: subName,
    amount: amount,
    type: 'expense',
    item: itemValue,
  };

  appData.transactions.push(transaction);
  saveData(appData);
  itemInput.value = '';
  closeExpenseModal();
  renderTodayScreen(
    appData.settings,
    appData.fixedExpenses,
    appData.transactions,
  );
  renderTransactionList(appData.transactions, appData.settings.pensionDay);

  console.log('Добавлен расход:', transaction);
}

// === Использование Неприкосновенного запаса ===
function useReserve() {
  const currentReserve = appData.settings.reserveAmount || 0;

  if (currentReserve <= 0) {
    alert('❌ Неприкосновенный запас равен нулю. Брать нечего!');
    return;
  }

  // 1. Запрос суммы
  const amountStr = prompt(
    `🔓 Использование НЗ\n\n` +
      `Текущий НЗ: ${currentReserve} ₽\n\n` +
      `На какую сумму взять из НЗ?\n` +
      `(Введите число, например: 1500)`,
    '',
  );

  if (amountStr === null) return; // Отмена

  const amount = parseFloat(amountStr.replace(',', '.'));

  if (isNaN(amount) || amount <= 0) {
    alert('❌ Введите корректную положительную сумму');
    return;
  }

  if (amount > currentReserve) {
    if (
      !confirm(
        `⚠️ Внимание!\n\nВы хотите взять ${amount} ₽, но НЗ всего ${currentReserve} ₽.\n\nВзять только ${currentReserve} ₽ (весь НЗ)?`,
      )
    ) {
      return;
    }
    // Берём только то, что есть
    amount = currentReserve;
  }

  // 2. Запрос причины (необязательно)
  const reason = prompt(
    '📝 На что берёте из НЗ? (необязательно)\n\nНапример: "ремонт холодильника"',
    '',
  );

  if (reason === null) return; // Отмена

  const categorySuffix = reason && reason.trim() ? `: ${reason.trim()}` : '';

  // 3. Предупреждение и подтверждение
  if (
    !confirm(
      `🔓 Подтвердите использование НЗ:\n\n` +
        `Сумма: ${amount} ₽\n` +
        `Причина: ${reason || 'не указана'}\n\n` +
        `Неприкосновенный запас УМЕНЬШИТСЯ с ${currentReserve} ₽ до ${currentReserve - amount} ₽.\n` +
        `Дневной лимит НЕ изменится.\n\n` +
        `Продолжить?`,
    )
  ) {
    return;
  }

  // 4. Создаём транзакцию (особый тип 'reserve')
  const transaction = {
    id: Date.now(),
    date: new Date().toISOString(),
    category: `🔓 Из НЗ${categorySuffix}`,
    amount: amount,
    type: 'reserve', // новый тип транзакции
  };

  appData.transactions.push(transaction);

  // 5. Уменьшаем НЗ
  appData.settings.reserveAmount = currentReserve - amount;
  const reserveInput =
    document.getElementById('input-reserve') ||
    document.getElementById('input-reserve-amount');
  if (reserveInput) {
    reserveInput.value = appData.settings.reserveAmount;
  }

  // 6. Сохраняем
  saveData(appData);

  // 7. Перерисовываем
  renderTodayScreen(
    appData.settings,
    appData.fixedExpenses,
    appData.transactions,
  );
  renderTransactionList(appData.transactions, appData.settings.pensionDay);

  console.log('🔓 Использован НЗ:', transaction);
  console.log('Новый НЗ:', appData.settings.reserveAmount);
}

// Обработчик изменения настроек
function handleSettingsChange() {
  const initialBalance =
    parseFloat(
      document.getElementById('input-initial-balance').value.replace(',', '.'),
    ) || 0;

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
  appData.settings.initialBalance = initialBalance; // ← НОВАЯ СТРОКА
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
    // Находим транзакцию ДО удаления, чтобы узнать её тип и сумму
    const transaction = appData.transactions.find(
      (t) => t.id === transactionId,
    );

    if (confirm('Удалить эту запись о расходе?')) {
      appData.transactions = appData.transactions.filter(
        (t) => t.id !== transactionId,
      );

      // === ВОССТАНОВЛЕНИЕ НЗ при удалении записи о снятии ===
      if (transaction && transaction.type === 'reserve') {
        appData.settings.reserveAmount += transaction.amount;
        const reserveInput =
          document.getElementById('input-reserve') ||
          document.getElementById('input-reserve-amount');
        if (reserveInput) {
          reserveInput.value = appData.settings.reserveAmount;
        }
        console.log('🔓 НЗ восстановлен:', appData.settings.reserveAmount);
      }
      // =====================================================

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

  // Редактирование платежа
  if (target.dataset.action === 'edit-payment') {
    const paymentId = parseInt(target.dataset.id);
    const payment = appData.fixedExpenses.find((p) => p.id === paymentId);

    if (payment) {
      const newName = prompt('Название платежа:', payment.name);
      if (newName === null) return; // Отмена

      const newAmountStr = prompt('Сумма:', payment.amount);
      if (newAmountStr === null) return;

      const newAmount = parseFloat(newAmountStr.replace(',', '.'));
      if (isNaN(newAmount) || newAmount <= 0) {
        alert('Некорректная сумма');
        return;
      }

      const newDayStr = prompt('День месяца (1-28):', payment.day);
      if (newDayStr === null) return;

      const newDay = parseInt(newDayStr);
      if (isNaN(newDay) || newDay < 1 || newDay > 28) {
        alert('День должен быть от 1 до 28');
        return;
      }

      // Обновляем данные
      payment.name = newName.trim();
      payment.amount = newAmount;
      payment.day = newDay;

      saveData(appData);
      renderAll(appData);
      console.log('Платёж обновлён:', payment);
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
  const transaction = appData.transactions.find((t) => t.id === transactionId);
  if (!transaction) return;

  // Сохраняем ID для последующего сохранения
  editingTransactionId = transactionId;

  // Определяем тип транзакции (расход или доход)
  const incomeFlag = isIncome(transaction);
  const categories = incomeFlag ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // Заполняем выпадающий список категориями
  const categorySelect = document.getElementById('edit-category');
  categorySelect.innerHTML = '';
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = `${category.emoji || ''} ${category.name}`.trim(); // Добавили эмодзи
    // Выбираем текущую категорию транзакции
    if (category.name === transaction.category) {
      option.selected = true;
    }
    categorySelect.appendChild(option);
  });

  // Заполняем подкатегории (только для расходов)
  const subcategoryLabel = document.getElementById('edit-subcategory-label');
  const subcategorySelect = document.getElementById('edit-subcategory');
  if (isIncome) {
    subcategoryLabel.style.display = 'none';
  } else {
    subcategoryLabel.style.display = 'block';
    subcategorySelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- выберите --';
    subcategorySelect.appendChild(placeholder);
    const currentCategory = EXPENSE_CATEGORIES.find(
      (c) => c.name === transaction.category,
    );
    const currentCategoryId = currentCategory ? currentCategory.id : '';
    const subs = SUBCATEGORIES[currentCategoryId] || [];
    subs.forEach((sub) => {
      const option = document.createElement('option');
      option.value = sub.id;
      option.textContent = sub.name;
      subcategorySelect.appendChild(option);
    });
    if (transaction.subcategory) {
      const currentSub = subs.find((s) => s.name === transaction.subcategory);
      if (currentSub) {
        subcategorySelect.value = currentSub.id;
      }
    }
  }

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
  const transactionIndex = appData.transactions.findIndex(
    (t) => t.id === editingTransactionId,
  );
  if (transactionIndex === -1) {
    alert('Транзакция не найдена');
    return;
  }

  // Определяем тип транзакции (сохраняем оригинальный тип)
  const originalTransaction = appData.transactions[transactionIndex];
  const incomeFlag = isIncome(originalTransaction);
  const categories = incomeFlag ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // Находим название категории
  const category = categories.find((c) => c.id === categoryId);
  const categoryName = category ? category.name : categoryId;

  // Определяем подкатегорию (только для расходов)
  let subName = originalTransaction.subcategory || '';
  if (!isIncome) {
    const subSelect = document.getElementById('edit-subcategory');
    const subId = subSelect.value;
    if (!subId) {
      alert('Пожалуйста, выберите подкатегорию');
      subSelect.focus();
      return;
    }
    const currentCategoryId = category ? category.id : categoryId;
    const subs = SUBCATEGORIES[currentCategoryId] || [];
    const sub = subs.find((s) => s.id === subId);
    subName = sub ? sub.name : subId;
  }

  // Создаём новую дату (сохраняем оригинальное время)
  const originalDate = new Date(originalTransaction.date);
  const newDate = new Date(dateStr);
  newDate.setHours(
    originalDate.getHours(),
    originalDate.getMinutes(),
    originalDate.getSeconds(),
  );

  // Обновляем транзакцию
  appData.transactions[transactionIndex] = {
    ...originalTransaction, // Сохраняем id и type
    category: categoryName,
    subcategory: subName,
    amount: amount,
    date: newDate.toISOString(),
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

  // ✅ Сохраняем дату последнего успешного экспорта
  appData.settings.lastExportDate = new Date().toISOString();
  saveData(appData);

  // ✅ Обновляем индикатор на экране
  updateSyncIndicator(appData.transactions, appData.settings.lastExportDate);

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
  reader.onload = function (e) {
    try {
      const importedData = JSON.parse(e.target.result);

      // Проверяем структуру данных
      if (
        !importedData.settings ||
        !importedData.fixedExpenses ||
        !importedData.transactions
      ) {
        throw new Error('Неверный формат файла');
      }

      // Подтверждение
      if (!confirm('⚠️ Это заменит все текущие данные. Продолжить?')) {
        return;
      }

      // Заменяем данные
      appData = importedData;
      window.appData = appData; // Синхронизируем с глобальной
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
    // 1. Переключаем тему
    document.body.classList.toggle('dark-theme');

    if (document.body.classList.contains('dark-theme')) {
      localStorage.setItem('theme', 'dark');
      themeIcon.textContent = '☀️';
    } else {
      localStorage.setItem('theme', 'light');
      themeIcon.textContent = '🌙';
    }

    // 2. === ГАРАНТИРОВАННАЯ ПЕРЕРИСОВКА ДИАГРАММЫ ===
    if (window.expenseChartInstance) {
      // Полностью уничтожаем старую диаграмму
      window.expenseChartInstance.destroy();

      // Рисуем новую с правильными цветами темы
      // ВНИМАНИЕ: замените appData.settings и appData.transactions
      // на те переменные, которые вы используете в своём коде для хранения данных!
      // (например, state.settings, store.transactions и т.д.)
      renderStatsChart(appData.settings, appData.transactions);
    }
    // =================================
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

// === УНИВЕРСАЛЬНАЯ НАВИГАЦИЯ ПО ВСЕМ ВКЛАДКАМ ===
document.addEventListener('click', (e) => {
  const navBtn = e.target.closest('.bottom-nav__item');
  if (!navBtn) return;

  const screenId = navBtn.dataset.screen;
  if (!screenId) return;

  // Убираем active у всех кнопок
  document.querySelectorAll('.bottom-nav__item').forEach((btn) => {
    btn.classList.remove('active');
  });
  navBtn.classList.add('active');

  // Скрываем все экраны
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.style.display = 'none';
    screen.classList.remove('active');
  });

  // Показываем нужный экран
  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.style.display = 'block';
    targetScreen.classList.add('active');
  }

  // Если открыли Статистику — рисуем график и отчёт периода
  if (screenId === 'screen-stats') {
    setTimeout(() => {
      const savedData = localStorage.getItem('pensionBudget');
      if (savedData) {
        const data = JSON.parse(savedData);

        // 1. Рисуем график
        if (typeof renderStatsChart === 'function') {
          renderStatsChart(data.settings, data.transactions);
        }

        // 2. Заполняем отчёт "Нефиксированные / Фиксированные"
        if (typeof calculateDailyLimit === 'function') {
          const stats = calculateDailyLimit(
            data.settings,
            data.fixedExpenses,
            data.transactions,
          );
          const summaryEl = document.getElementById('stats-period-summary');

          if (summaryEl) {
            const format =
              typeof formatMoney === 'function'
                ? formatMoney
                : (val) => val.toFixed(2) + ' ₽';

            summaryEl.innerHTML = `
            <div style="margin-bottom: 8px; color: var(--color-text, #2c3e50);">
              <strong>Нефиксированные:</strong> ${format(stats.spent)}
            </div>
            <div style="color: var(--color-text-secondary, #7f8c8d);">
              <strong>Фиксированные:</strong> ${format(stats.committedTotal)}
            </div>
          `;
          }
        }
      }
    }, 100);
  }

  // === НОВОЕ: Если открыли Настройки — обновляем блок периода ===
  if (screenId === 'screen-settings') {
    setTimeout(() => {
      if (typeof renderPensionPeriodInfo === 'function' && window.appData) {
        renderPensionPeriodInfo(window.appData.settings);
      }
    }, 100);
  }
  // ================================================================
}); // ← закрывающая скобка обработчика

function toInputDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isInDeleteRange(t, from, to) {
  const d = new Date(t.date);
  const fromD = new Date(`${from}T00:00:00`);
  const toD = new Date(`${to}T23:59:59`);
  return d >= fromD && d <= toD;
}

function updateDeletePreview() {
  const from = document.getElementById('delete-from').value;
  const to = document.getElementById('delete-to').value;
  const previewEl = document.getElementById('delete-preview');
  if (!from || !to) {
    previewEl.textContent = 'Укажите обе даты';
    return;
  }
  const victims = appData.transactions.filter((t) =>
    isInDeleteRange(t, from, to),
  );
  if (victims.length === 0) {
    previewEl.textContent = 'В этом периоде записей нет';
    return;
  }
  const expenseSum = victims
    .filter(isExpense)
    .reduce((s, t) => s + t.amount, 0);
  previewEl.textContent = `Будет удалено: ${victims.length} записей, расходы на ${formatMoney(expenseSum)}`;
}

function initDeleteRange() {
  const fromInput = document.getElementById('delete-from');
  const toInput = document.getElementById('delete-to');
  if (!fromInput || !toInput) return;
  if (appData.transactions.length > 0) {
    const oldest = new Date(
      Math.min(...appData.transactions.map((t) => new Date(t.date))),
    );
    fromInput.value = toInputDate(oldest);
  }
  const periodStart = new Date(appData.settings.currentPeriodStart);
  toInput.value = toInputDate(new Date(periodStart.getTime() - 86400000));
  fromInput.addEventListener('change', updateDeletePreview);
  toInput.addEventListener('change', updateDeletePreview);
    document
      .getElementById('delete-range-btn')
      .addEventListener('click', () => {
        const dateFrom = fromInput.value;
        const dateTo = toInput.value;

        if (!dateFrom || !dateTo) {
          alert('⚠️ Пожалуйста, укажите обе даты: "От" и "До"');
          return;
        }

        const confirmed = confirm(
          `Вы уверены, что хотите удалить все записи с ${dateFrom} по ${dateTo}?\n\n` +
            `Это действие нельзя отменить!`,
        );

        if (confirmed) {
          handleDeleteRange();
        }
      });
  updateDeletePreview();
}

function handleDeleteRange() {
  const from = document.getElementById('delete-from').value;
  const to = document.getElementById('delete-to').value;
  if (!from || !to) {
    alert('Укажите обе даты периода');
    return;
  }
  const victims = appData.transactions.filter((t) =>
    isInDeleteRange(t, from, to),
  );
  if (victims.length === 0) {
    alert('В выбранном периоде записей нет — удалять нечего');
    return;
  }
  const expenseSum = victims
    .filter(isExpense)
    .reduce((s, t) => s + t.amount, 0);
  const message =
    `Будет удалено записей: ${victims.length}\n` +
    `Расходы на сумму: ${formatMoney(expenseSum)}\n\n` +
    'Рекомендуем сначала сделать Экспорт!\nПродолжить?';
  if (!confirm(message)) return;
  appData.transactions = appData.transactions.filter(
    (t) => !isInDeleteRange(t, from, to),
  );
  saveData(appData);
  renderAll(appData);
  updateDeletePreview();
  alert(`Готово! Удалено записей: ${victims.length}`);
}

// === СВЕРКА С БАНКОМ ===

// Обработчик кнопки загрузки файла
document.getElementById('reconcile-upload-btn').addEventListener('click', () => {
  document.getElementById('reconcile-file').click();
});

document.getElementById('reconcile-file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const csvText = e.target.result;
    const bankTransactions = parseCSV(csvText);
    reconcileTransactions(bankTransactions);
  };
  reader.readAsText(file, 'UTF-8');
});

// Умный парсер CSV — сам определяет кодировку
function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  const transactions = [];

  // Пропускаем первую строку (заголовок)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === ';') continue; // Пропускаем пустые строки

    const parts = line.split(';');
    if (parts.length < 3) continue;

    const date = parts[0].trim();
    // Заменяем запятую на точку в сумме (на случай разных форматов)
    const amountStr = parts[1].trim().replace(',', '.');
    const amount = parseFloat(amountStr);
    const description = parts[2].trim();

    if (date && !isNaN(amount) && description) {
      transactions.push({ date, amount, description });
    }
  }

  return transactions;
}

// Умное сравнение транзакций с допуском по дате ±1 день
function reconcileTransactions(bankTransactions) {
  const appTransactions = appData.transactions || [];
  
  const matches = [];
  const groupMatches = [];
  const mismatches = [];
  const missingInApp = [];
  const missingInBank = [];

  const pendingHypotheses = {};  // Гипотезы по датам

  // Группируем транзакции приложения по дате
  const appByDate = {};
  appTransactions.forEach((tx, index) => {
    const date = normalizeDate(tx.date);
    if (!appByDate[date]) appByDate[date] = [];
    appByDate[date].push({ tx, index });
  });

  const appUsed = new Array(appTransactions.length).fill(false);

  bankTransactions.forEach((bankTx) => {
    const bankDate = normalizeDate(bankTx.date);
    const bankAmount = bankTx.amount; // ✅ Со знаком!
    let found = false;

    // Ищем совпадения в диапазоне ±1 день
    const datesToCheck = [
      bankDate,
      getAdjacentDate(bankDate, -1),
      getAdjacentDate(bankDate, 1),
    ];

    for (const checkDate of datesToCheck) {
      if (found) break;

      if (appByDate[checkDate]) {
        // 1. Точное совпадение 1 к 1 (по модулю суммы)
        for (const { tx: appTx, index } of appByDate[checkDate]) {
          if (appUsed[index]) continue;
          const bankAmountAbs = Math.abs(bankAmount);
          const appAmountAbs = Math.abs(appTx.amount);

          if (Math.abs(bankAmountAbs - appAmountAbs) < 0.01) {
            matches.push({ bank: bankTx, app: appTx });
            appUsed[index] = true;
            found = true;
            break;
          }
        }

        // 2. Групповое совпадение (алгебраическая сумма)
        if (!found) {
          const dayTransactions = appByDate[checkDate].filter(
            ({ index }) => !appUsed[index],
          );
          const combinations = findCombinations(
            dayTransactions.map(({ tx, index }) => ({ tx, index })),
            bankAmount,
          );

          if (combinations.found) {
            groupMatches.push({
              bank: bankTx,
              app: combinations.items.map(({ tx }) => tx),
            });
            combinations.items.forEach(({ index }) => {
              appUsed[index] = true;
            });
            found = true;
          }
        }

        // 3. Поиск гипотез (если не нашли точное или групповое)
        if (!found) {
          const dayTransactions = appByDate[checkDate].filter(
            ({ index }) => !appUsed[index],
          );
          const bankAmountAbs = Math.abs(bankAmount);

          // Пробуем найти комбинацию по алгебраической сумме (для случаев с возвратом)
          let hypotheses = findCombinations(
            dayTransactions.map(({ tx, index }) => ({ tx, index })),
            bankAmount,
            5,
          );

          // Если не нашли, пробуем по сумме модулей (для случаев с несколькими расходами)
          if (!hypotheses.found) {
            hypotheses = findCombinationsByAbsoluteSum(
              dayTransactions.map(({ tx, index }) => ({ tx, index })),
              bankAmountAbs,
              5,
            );
          }

          if (hypotheses.found) {
            // Сохраняем как гипотезу, не помечаем как использованные
            if (!pendingHypotheses[bankDate]) pendingHypotheses[bankDate] = [];

            // Вычисляем разницу
            const appSum = hypotheses.items.reduce(
              (sum, { tx }) => sum + tx.amount,
              0,
            );
            const appAbsSum = hypotheses.items.reduce(
              (sum, { tx }) => sum + Math.abs(tx.amount),
              0,
            );
            const difference = Math.abs(bankAmountAbs - appAbsSum);

            pendingHypotheses[bankDate].push({
              bank: bankTx,
              app: hypotheses.items.map(({ tx }) => tx),
              difference: difference,
            });
            found = true;
          }
        }
      }
    }

    

    if (!found) {
      missingInApp.push(bankTx);
    }
  });

  appTransactions.forEach((appTx, i) => {
    if (!appUsed[i]) {
      missingInBank.push(appTx);
    }
  });

    displayReconcileResults(matches, groupMatches, mismatches, missingInApp, missingInBank, pendingHypotheses);
}

// Вспомогательная функция: получить соседнюю дату
function getAdjacentDate(dateStr, daysOffset) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

// Вспомогательная функция для поиска комбинаций сумм (алгебраическая сумма)
function findCombinations(items, targetSum, tolerance = 2) {
  const result = { found: false, items: [] };
  
  function algebraicSum(items) {
    return items.reduce((sum, { tx }) => sum + tx.amount, 0);
  }
  
  function findSubset(items, target, current = [], startIndex = 0) {
    if (result.found) return;
    
    const currentSum = algebraicSum(current);
    
    if (Math.abs(target - currentSum) <= tolerance) {
      result.found = true;
      result.items = [...current];
      return;
    }
    
    for (let i = startIndex; i < items.length; i++) {
      current.push(items[i]);
      findSubset(items, target, current, i + 1);
      if (result.found) return;
      current.pop();
    }
  }
  
  findSubset(items, targetSum);
  return result;
}

// Поиск комбинаций по сумме модулей (для гипотез)
function findCombinationsByAbsoluteSum(items, targetSum, tolerance = 5) {
  const result = { found: false, items: [] };
  
  function absoluteSum(items) {
    return items.reduce((sum, { tx }) => sum + Math.abs(tx.amount), 0);
  }
  
  function findSubset(items, target, current = [], startIndex = 0) {
    if (result.found) return;
    
    const currentSum = absoluteSum(current);
    
    if (Math.abs(target - currentSum) <= tolerance) {
      result.found = true;
      result.items = [...current];
      return;
    }
    
    if (currentSum > target + tolerance) return;
    
    for (let i = startIndex; i < items.length; i++) {
      current.push(items[i]);
      findSubset(items, target, current, i + 1);
      if (result.found) return;
      current.pop();
    }
  }
  
  findSubset(items, targetSum);
  return result;
}

// Нормализация даты — приводит к формату YYYY-MM-DD
function normalizeDate(dateStr) {
  if (!dateStr) return '';
  
  // Если это ISO-формат (2026-08-22T06:13:13.000Z)
  if (dateStr.includes('T')) {
    return dateStr.split('T')[0]; // Берём только дату: 2026-08-22
  }
  
  // Если это формат DD.MM.YYYY (14.09.2026)
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // 2026-09-14
    }
  }
  
  // Если уже в формате YYYY-MM-DD
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  
  return dateStr;
}

// Отображение результатов сверки
function displayReconcileResults(matches, groupMatches, mismatches, missingInApp, missingInBank, pendingHypotheses = {}) {
  const resultsDiv = document.getElementById('reconcile-results');
  resultsDiv.style.display = 'flex';

  // ✅ Добавили подсчёт общих совпадений (точные + групповые)
  const totalMatches = matches.length + groupMatches.length;
  
  // Пересчитали общее количество, чтобы цифры сходились
  const totalBank = totalMatches + mismatches.length + missingInApp.length;
  const totalApp = totalMatches + mismatches.length + missingInBank.length;

  resultsDiv.innerHTML = `
    <div class="reconcile-summary">
      <div class="reconcile-summary__item">
        <span class="reconcile-summary__value">${totalBank}</span>
        <span class="reconcile-summary__label">В банке</span>
      </div>
      <div class="reconcile-summary__item">
        <span class="reconcile-summary__value">${totalApp}</span>
        <span class="reconcile-summary__label">В приложении</span>
      </div>
      <div class="reconcile-summary__item">
        <span class="reconcile-summary__value" style="color: #27ae60;">${totalMatches}</span>
        <span class="reconcile-summary__label">Совпадений</span>
      </div>
      <div class="reconcile-summary__item">
        <span class="reconcile-summary__value" style="color: #f39c12;">${mismatches.length}</span>
        <span class="reconcile-summary__label">Расхождений</span>
      </div>
    </div>

    ${renderReconcileGroup(
      '✅ Точные совпадения (1 к 1)',
      'match',
      matches,
      (item) => `
      <div class="reconcile-item__date">${item.bank.date}</div>
      <div class="reconcile-item__description">${item.bank.description}</div>
      <div class="reconcile-item__amount">${formatMoney(item.bank.amount)}</div>
    `
    )}

    ${renderReconcileGroup(
      '✅ Групповые совпадения (1 операция в банке = несколько в приложении)',
      'match',
      groupMatches,
      (item) => `
      <div class="reconcile-item__info" style="width: 100%;">
        <div class="reconcile-item__date">${item.bank.date}</div>
        <div class="reconcile-item__description" style="font-weight: 600;">${item.bank.description}</div>
        <div style="font-size: 0.9em; color: #27ae60; margin-top: 6px; font-weight: 600;">
          Банк: ${formatMoney(item.bank.amount)} | В приложении: ${item.app.length} операций на ${formatMoney(item.app.reduce((sum, tx) => sum + Math.abs(tx.amount), 0))}
        </div>
        <div style="font-size: 0.85em; color: #555; margin-top: 4px; line-height: 1.4;">
          ${item.app.map(tx => `• ${tx.category || tx.description}: ${formatMoney(tx.amount)}`).join('<br>')}
        </div>
      </div>
    `
    )}

    ${renderReconcileGroup(
      '⚠️ Расхождения (суммы отличаются)',
      'mismatch',
      mismatches,
      (item) => `
      <div class="reconcile-item__info">
        <div class="reconcile-item__date">${item.bank.date}</div>
        <div class="reconcile-item__description">${item.bank.description}</div>
        <div style="font-size: 0.85em; color: #f39c12;">
          Банк: ${formatMoney(item.bank.amount)} | Приложение: ${formatMoney(item.app.amount)}
        </div>
      </div>
    `
    )}

    ${renderReconcileGroup(
      '🔴 Не учтено в приложении',
      'missing',
      missingInApp,
      (item) => `
      <div class="reconcile-item__info">
        <div class="reconcile-item__date">${item.date}</div>
        <div class="reconcile-item__description">${item.description}</div>
      </div>
      <div class="reconcile-item__amount">${formatMoney(item.amount)}</div>
      <button class="reconcile-item__action" onclick="addTransactionFromBank('${item.date}', ${item.amount}, '${item.description.replace(/'/g, "\\'")}')">
        Добавить
      </button>
    `
    )}

        ${renderReconcileGroup(
      '📝 Не отражено в банке',
      'extra',
      missingInBank,
      (item) => `
      <div class="reconcile-item__info">
        <div class="reconcile-item__date">${item.date.includes('T') ? item.date.split('T')[0] : item.date}</div>
        <div class="reconcile-item__description">${item.description || item.category}</div>
      </div>
      <div class="reconcile-item__amount">${formatMoney(item.amount)}</div>
    `
    )}

    ${renderHypotheses(pendingHypotheses)}
  `;
}



// Вспомогательная функция для рендеринга группы
function renderReconcileGroup(title, type, items, renderFn) {
  if (items.length === 0) return '';

  const itemsHtml = items.map((item) => `
    <div class="reconcile-item">
      ${renderFn(item)}
    </div>
  `).join('');

  return `
    <div class="reconcile-group reconcile-group--${type}">
      <div class="reconcile-group__title">${title} (${items.length})</div>
      ${itemsHtml}
    </div>
  `;
}

// Добавление транзакции из банка в приложение
window.addTransactionFromBank = function(date, amount, description) {
  const newTransaction = {
    id: Date.now().toString(),
    date: date,
    amount: amount,
    category: amount < 0 ? 'Продукты' : 'Доходы',
    subcategory: 'Разное',
    description: description,
    type: amount < 0 ? 'expense' : 'income'
  };

  appData.transactions.push(newTransaction);
  saveData(appData);
  renderAll(appData);

  alert(`✅ Транзакция добавлена: ${description} (${formatMoney(amount)})`);
};

// === ПАРСЕР СЫРОГО ТЕКСТА ИЗ PDF ===

// Обработчик кнопки "Разобрать текст"
document.getElementById('reconcile-parse-btn').addEventListener('click', () => {
  const rawText = document.getElementById('reconcile-raw-text').value.trim();
  if (!rawText) {
    alert('️ Вставьте текст из PDF-выписки');
    return;
  }

  const bankTransactions = parseRawPDFText(rawText);
  
  if (bankTransactions.length === 0) {
    alert('⚠️ Не удалось найти транзакции в тексте. Проверьте формат выписки.');
    return;
  }

  alert(`✅ Найдено транзакций: ${bankTransactions.length}`);
  reconcileTransactions(bankTransactions);
});

// Парсер "сырого" текста из PDF Сбербанка
function parseRawPDFText(text) {
  const transactions = [];
  
  // Регулярное выражение для поиска транзакций
  const regex = /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+([А-Яа-яA-Za-z][А-Яа-яA-Za-z\s]*?)\s+([\d\s]+,\d{2})\s+([\d\s]+,\d{2})\s+(\d{2}\.\d{2}\.\d{4})\s+(\d+)\s+(.+?)(?=\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}|$)/gs;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    const date = match[1];
    const amountStr = match[4].replace(/\s/g, '').replace(',', '.');
    const description = match[8].trim();
    
    // Определяем тип: если в описании есть "+" или "Перевод", "Зачисление" — это доход
    const isIncome = description.includes('+') || 
                     description.toLowerCase().includes('перевод') ||
                     description.toLowerCase().includes('зачислен');
    
    const amount = isIncome ? parseFloat(amountStr) : -parseFloat(amountStr);
    
    if (date && !isNaN(amount) && description) {
      transactions.push({ date, amount, description });
    }
  }

  return transactions;
}

// Отображение гипотез
function renderHypotheses(pendingHypotheses) {
  const rawHypotheses = Object.values(pendingHypotheses).flat();
  const confirmedHypotheses = appData.confirmedHypotheses || [];

  const activeHypotheses = rawHypotheses.filter(hypothesis => {
    const hypothesisKey = `${hypothesis.bank.date}_${Math.abs(hypothesis.bank.amount)}_${hypothesis.app.map(tx => tx.id).join(',')}`;
    return !confirmedHypotheses.includes(hypothesisKey);
  });

  if (activeHypotheses.length === 0) return '';

  // Кнопка "Подтвердить все" (показываем, если гипотез больше 1)
  const confirmAllBtn = activeHypotheses.length > 1 
    ? `<button class="reconcile-group__action-all" onclick="confirmAllHypotheses()" style="margin: 12px 0; padding: 10px 16px; background: #27ae60; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.95em; font-weight: 600; width: 100%; transition: background 0.2s;">
         ✅ Подтвердить все (${activeHypotheses.length})
       </button>` 
    : '';

  const itemsHtml = activeHypotheses.map((hypothesis) => {
    const hypothesisKey = `${hypothesis.bank.date}_${Math.abs(hypothesis.bank.amount)}_${hypothesis.app.map(tx => tx.id).join(',')}`;

    return `
      <div class="reconcile-item" data-key="${hypothesisKey}" style="margin-bottom: 12px;">
        <div class="reconcile-item__info" style="width: 100%;">
          <div class="reconcile-item__date">${hypothesis.bank.date}</div>
          <div class="reconcile-item__description" style="font-weight: 600;">${hypothesis.bank.description}</div>
          <div style="font-size: 0.9em; color: #f39c12; margin-top: 6px;">
            Банк: ${formatMoney(hypothesis.bank.amount)} | Возможно в приложении:
          </div>
          <div style="font-size: 0.85em; color: #555; margin-top: 4px; line-height: 1.4;">
            ${hypothesis.app.map(tx => `• ${tx.category || tx.description}: ${formatMoney(tx.amount)}`).join('<br>')}
          </div>
          <div style="font-size: 0.8em; color: #777; margin-top: 4px;">
            Разница: ${formatMoney(hypothesis.difference)}
          </div>
          <button class="reconcile-item__action" onclick="confirmHypothesis('${hypothesisKey}', this)" style="margin-top: 8px; background: #3498db;">
            ✅ Подтвердить
          </button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="reconcile-group reconcile-group--mismatch" id="hypotheses-group">
      <div class="reconcile-group__title">⚠️ Требует проверки (${activeHypotheses.length})</div>
      ${confirmAllBtn}
      ${itemsHtml}
    </div>
  `;
}

// Подтверждение гипотезы (без перезагрузки)
window.confirmHypothesis = function(hypothesisKey, btnElement) {
  // 1. Сохраняем в память
  if (!appData.confirmedHypotheses) {
    appData.confirmedHypotheses = [];
  }
  appData.confirmedHypotheses.push(hypothesisKey);
  saveData(appData);
  
  // 2. Мгновенно скрываем элемент из интерфейса
  const item = btnElement.closest('.reconcile-item');
  if (item) {
    item.style.transition = 'opacity 0.3s ease';
    item.style.opacity = '0';
    setTimeout(() => {
      item.style.display = 'none';
    }, 300);
  }
  
  // 3. Обновляем счётчик в заголовке
  const group = btnElement.closest('.reconcile-group');
  const title = group.querySelector('.reconcile-group__title');
  const match = title.textContent.match(/\d+/);
  
  if (match) {
    const currentCount = parseInt(match[0]);
    const newCount = currentCount - 1;
    title.textContent = `⚠️ Требует проверки (${newCount})`;
    
    // 3.1. Обновляем текст большой кнопки "Подтвердить все"
    const confirmAllBtn = group.querySelector('.reconcile-group__action-all');
    if (confirmAllBtn) {
      confirmAllBtn.textContent = `✅ Подтвердить все (${newCount})`;
    }
    
    // 4. Если гипотез больше не осталось, скрываем весь блок
    if (newCount === 0) {
      group.style.transition = 'opacity 0.3s ease';
      group.style.opacity = '0';
      setTimeout(() => {
        group.style.display = 'none';
      }, 300);
    }
  }
}; // <-- Вот правильный конец: одна } закрывает функцию, одна ; завершает присваивание.

// Подтверждение ВСЕХ гипотез сразу
window.confirmAllHypotheses = function() {
  if (!confirm('Подтвердить все предложенные гипотезы? Они будут сохранены и не появятся при следующей сверке.')) {
    return;
  }

  if (!appData.confirmedHypotheses) {
    appData.confirmedHypotheses = [];
  }

  // Собираем ключи всех видимых гипотез из DOM
  const items = document.querySelectorAll('#hypotheses-group .reconcile-item');
  items.forEach(item => {
    const key = item.getAttribute('data-key');
    if (key && !appData.confirmedHypotheses.includes(key)) {
      appData.confirmedHypotheses.push(key);
    }
  });

  // Сохраняем в localStorage
  saveData(appData);

  // Красиво скрываем весь блок целиком
  const group = document.getElementById('hypotheses-group');
  if (group) {
    group.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    group.style.opacity = '0';
    group.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      group.style.display = 'none';
    }, 300);
  }
};