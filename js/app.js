import { loadData, saveData } from './storage.js';
import {
  renderAll,
  renderTodayScreen,
  renderTransactionList,
  renderSettings,
  renderStats,
  renderPensionPeriodInfo,
  updateSyncIndicator,
  renderAccountsList,
} from './ui.js';
import { formatDateKey, getCurrentPeriod, formatMoney, } from './utils.js';
import { calculateDailyLimit,} from './budget.js';
import {
  isIncome,
  isExpense,
  isCommitted,
  isMoneyOut,
  EXPENSE_CATEGORIES,
  SUBCATEGORIES,
  INCOME_CATEGORIES,
} from './constants.js';
import {
  createExpense,
  createIncome,
  createTransfer, 
  updateTransaction,
  deleteTransaction,
  deleteTransactionsByRange,
  isValidAmount,
  getCategoriesByType,
} from './transactions.js';
import { initReconcileListeners } from './reconcile.js'; // ← ДОБАВЬТЕ ЭТУ СТРОКУ!

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

  // === НОВОЕ: Обновляем индикатор синхронизации при загрузке страницы ===
  if (typeof updateSyncIndicator === 'function') {
    const timeToShow =
      appData.lastModified ||
      appData.settings.lastExportDate ||
      new Date().toISOString();
    updateSyncIndicator(appData.transactions, timeToShow);
  }

  // === НОВОЕ: Обновляем баннер сверки при загрузке страницы ===
  if (typeof window.updateReconcileBanner === 'function') {
    window.updateReconcileBanner();
  }
  // ================================================================

  // Навешиваем обработчики
  setupEventListeners();
  initDeleteRange();
  initReconcileListeners();

  // === НОВОЕ: Обновляем баннер сверки при загрузке ===
  if (typeof window.updateReconcileBanner === 'function') {
    window.updateReconcileBanner();
  }

  console.log('Приложение инициализировано', appData);
}

// Регистрация Service Worker для PWA (офлайн-режим)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        console.log(
          '[PWA] Service Worker зарегистрирован:',
          registration.scope,
        );
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

  // === Инициализация элементов модального окна переводов (v2.5) ===
  const transferModal = document.getElementById('transfer-modal');
  const transferFromSelect = document.getElementById('transfer-from-account');
  const transferToSelect = document.getElementById('transfer-to-account');
  const transferAmountInput = document.getElementById('transfer-amount');
  const transferSaveBtn = document.getElementById('btn-save-transfer');
  const transferCancelBtn = document.getElementById('btn-cancel-transfer');
  // =================================================================

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

  // Обработчик кнопки "Перевод между счетами" (v2.5)
  const btnAddTransfer = document.getElementById('btn-add-transfer');
  if (btnAddTransfer) {
    btnAddTransfer.addEventListener('click', openTransferModal);
  }

  // === Кнопка "Использовать НЗ" ===
  const btnUseReserve = document.getElementById('btn-use-reserve');
  if (btnUseReserve) {
    btnUseReserve.addEventListener('click', useReserve);
  }

  expenseCategorySelect.addEventListener('change', () => {
    fillSubcategories(expenseCategorySelect.value);
  });

  // === НОВОЕ: Обновляем цветной кружок при выборе подкатегории в модалке ===
  const expenseSubcategorySelect = document.getElementById(
    'expense-subcategory',
  );
  if (expenseSubcategorySelect) {
    expenseSubcategorySelect.addEventListener('change', () => {
      updateSubcategoryColorIndicator(expenseSubcategorySelect);
    });
  }
  // ===========================================================================

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

    // === НОВОЕ: Обновляем цветной кружок сразу после пересоздания списка ===
    updateSubcategoryColorIndicator(subSelect);
    // =======================================================================
  });

  // === НОВОЕ: Обновляем цветной кружок при выборе подкатегории в модалке редактирования ===
  const editSubcategorySelect = document.getElementById('edit-subcategory');
  if (editSubcategorySelect) {
    editSubcategorySelect.addEventListener('change', () => {
      updateSubcategoryColorIndicator(editSubcategorySelect);
    });
  }
  // ===========================================================================

  expenseSaveBtn.addEventListener('click', saveExpense);

  expenseSaveBtn.addEventListener('click', saveExpense);
  expenseCancelBtn.addEventListener('click', closeExpenseModal);

  // Кнопки в модальном окне доходов
  incomeSaveBtn.addEventListener('click', saveIncome);
  incomeCancelBtn.addEventListener('click', closeIncomeModal);

  // === Кнопки в модальном окне переводов (v2.5) ===
  if (transferSaveBtn) transferSaveBtn.addEventListener('click', saveTransfer);
  if (transferCancelBtn)
    transferCancelBtn.addEventListener('click', closeTransferModal);
  // ================================================

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

  // === Закрытие по клику на оверлей (переводы, v2.5) ===
  if (transferModal) {
    transferModal.addEventListener('click', (e) => {
      if (e.target === transferModal.querySelector('.modal__overlay')) {
        closeTransferModal();
      }
    });
  }
  // ==================================================

  // Закрытие по Escape и сохранение по Enter
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (expenseModal.classList.contains('is-open')) closeExpenseModal();
      if (incomeModal.classList.contains('is-open')) closeIncomeModal();
      // <-- НОВОЕ (v2.5)
      if (transferModal && transferModal.classList.contains('is-open'))
        closeTransferModal();
    }
    if (e.key === 'Enter') {
      if (expenseModal.classList.contains('is-open')) saveExpense();
      if (incomeModal.classList.contains('is-open')) saveIncome();
      // <-- НОВОЕ (v2.5)
      if (transferModal && transferModal.classList.contains('is-open'))
        saveTransfer();
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
          renderStats(
            appData.settings,
            appData.fixedExpenses,
            appData.transactions,
          );
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
            renderStats(
              appData.settings,
              appData.fixedExpenses,
              appData.transactions,
            );
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
            renderStats(
              appData.settings,
              appData.fixedExpenses,
              appData.transactions,
            );
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
  // === ОБРАБОТЧИКИ ДЛЯ УПРАВЛЕНИЯ СЧЕТАМИ (v2.1) ===

  // Переменная для хранения ID редактируемого счёта (null если добавляем новый)
  let editingAccountId = null;

  // Кнопка "Добавить счёт"
  const btnAddAccount = document.getElementById('btn-add-account');
  if (btnAddAccount) {
    btnAddAccount.addEventListener('click', () => {
      editingAccountId = null;
      document.getElementById('account-modal-title').textContent =
        'Добавить счёт';
      document.getElementById('account-name').value = '';
      // Убрали поля эмодзи и цвета — они больше не нужны
      document.getElementById('account-modal').classList.add('is-open');
    });
  }

  // Кнопка "Отмена" в модалке счёта
  const btnCancelAccount = document.getElementById('btn-cancel-account');
  if (btnCancelAccount) {
    btnCancelAccount.addEventListener('click', () => {
      document.getElementById('account-modal').classList.remove('is-open');
    });
  }

  // Кнопка "Сохранить" в модалке счёта
  const btnSaveAccount = document.getElementById('btn-save-account');
  if (btnSaveAccount) {
    btnSaveAccount.addEventListener('click', () => {
      const name = document.getElementById('account-name').value.trim();
          const balance =
            parseFloat(
              document
                .getElementById('account-balance')
                .value.replace(',', '.'),
            ) || 0;

      if (!name) {
        alert('Пожалуйста, введите название счёта');
        return;
      }

      if (editingAccountId) {
        // === 1. РЕДАКТИРОВАНИЕ существующего счёта ===
        const account = appData.settings.accounts.find(
          (a) => a.id === editingAccountId,
        );
        if (account) {
          account.name = name;
          account.balance = balance; // <-- ДОБАВИТЬ

          // Умное определение эмодзи и цвета
          const lowerName = name.toLowerCase();
          if (lowerName.includes('сбер')) {
            account.emoji = '🏦';
            account.color = '#27ae60';
          } else if (
            lowerName.includes('тинькофф') ||
            lowerName.includes('т-банк') ||
            lowerName.includes('т банк')
          ) {
            account.emoji = '🏦';
            account.color = '#ffdd2d';
          } else if (lowerName.includes('втб')) {
            account.emoji = '🏦';
            account.color = '#002882';
          } else {
            account.emoji = account.emoji || '💼';
            account.color = account.color || '#3498db';
          }
          console.log('✅ Счёт обновлён:', account);
        }
      } else {
        // === 2. ДОБАВЛЕНИЕ нового счёта ===
        const newAccount = {
          id: 'account_' + Date.now(),
          name: name,
          emoji: '💼',
          color: '#3498db',
          balance: balance, // <-- ДОБАВИТЬ
        };

        // Применяем умные цвета и к новому счёту тоже!
        const lowerName = name.toLowerCase();
        if (lowerName.includes('сбер')) {
          newAccount.emoji = '🏦';
          newAccount.color = '#27ae60';
        } else if (
          lowerName.includes('тинькофф') ||
          lowerName.includes('т-банк') ||
          lowerName.includes('т банк')
        ) {
          newAccount.emoji = '🏦';
          newAccount.color = '#ffdd2d';
        } else if (lowerName.includes('втб')) {
          newAccount.emoji = '🏦';
          newAccount.color = '#002882';
        }

        appData.settings.accounts.push(newAccount);

        // === ВАЖНО: Если это первый счёт или defaultAccountId потерян, делаем его дефолтным ===
        if (
          !appData.settings.defaultAccountId ||
          appData.settings.accounts.length === 1
        ) {
          appData.settings.defaultAccountId = newAccount.id;
          console.log('🏆 Счёт назначен счетом по умолчанию:', newAccount.id);
        }

        console.log('✅ Счёт добавлен:', newAccount);
      }

      // === 3. ЕДИНОЕ сохранение и обновление интерфейса ===
      saveData(appData);

      if (typeof window.updateReconcileBanner === 'function') {
        window.updateReconcileBanner();
        console.log('✅ Баннер сверки обновлён после сохранения счёта');
      }

      if (typeof renderAccountsList === 'function') {
        renderAccountsList(); // ← ВАЖНО: вызываем БЕЗ аргументов!
      }

      if (typeof renderTodayScreen === 'function') {
        renderTodayScreen(
          appData.settings,
          appData.fixedExpenses,
          appData.transactions,
        );
      }

      // Закрываем модалку и сбрасываем ID редактирования
      document.getElementById('account-modal').classList.remove('is-open');
      editingAccountId = null;
    });
  }

  // Делегирование событий для кнопок редактирования и удаления счетов
  document.addEventListener('click', (e) => {
    // Кнопка редактирования счёта
    if (e.target.closest('.btn-edit-account')) {
      const accountId = e.target.closest('.btn-edit-account').dataset.accountId;
      const account = appData.settings.accounts.find((a) => a.id === accountId);
      if (account) {
        editingAccountId = accountId;
        document.getElementById('account-modal-title').textContent =
          'Редактировать счёт';
        document.getElementById('account-name').value = account.name;
        // Убрали поля эмодзи и цвета — они больше не нужны
                document.getElementById('account-balance').value =
                  account.balance || 0;
        document.getElementById('account-modal').classList.add('is-open');
      }
    }

    // Кнопка удаления счёта
    if (e.target.closest('.btn-delete-account')) {
      const accountId = e.target.closest('.btn-delete-account').dataset
        .accountId;
      const account = appData.settings.accounts.find((a) => a.id === accountId);

      if (account) {
        // Проверяем, есть ли транзакции на этом счёте
        const transactionsCount = appData.transactions.filter(
          (t) => t.accountId === accountId,
        ).length;

        if (transactionsCount > 0) {
          const confirmDelete = confirm(
            `На счёте "${account.name}" есть ${transactionsCount} транзакций.\n\n` +
              `Если вы удалите счёт, все транзакции будут перенесены на счёт по умолчанию.\n\n` +
              `Продолжить?`,
          );

          if (!confirmDelete) return;

          // Переносим транзакции на счёт по умолчанию
          const defaultAccountId =
            appData.settings.defaultAccountId ||
            appData.settings.accounts[0].id;
          appData.transactions.forEach((t) => {
            if (t.accountId === accountId) {
              t.accountId = defaultAccountId;
            }
          });
          console.log(`🔄 Транзакции перенесены на счёт "${defaultAccountId}"`);
        } else {
          const confirmDelete = confirm(`Удалить счёт "${account.name}"?`);
          if (!confirmDelete) return;
        }

        // Удаляем счёт
        appData.settings.accounts = appData.settings.accounts.filter(
          (a) => a.id !== accountId,
        );

        // Если удалили счёт по умолчанию, устанавливаем новый
        if (
          appData.settings.defaultAccountId === accountId &&
          appData.settings.accounts.length > 0
        ) {
          appData.settings.defaultAccountId = appData.settings.accounts[0].id;
        }

        saveData(appData);
        renderAccountsList();
        console.log('✅ Счёт удалён:', account.name);
      }
    }
  });
}

// Открытие модального окна доходов
function openIncomeModal() {
  // Очищаем список категорий
  incomeCategorySelect.innerHTML = '';

  // Заполняем список категориями с эмодзи
  INCOME_CATEGORIES.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = `${category.emoji || ''} ${category.name}`.trim();
    incomeCategorySelect.appendChild(option);
  });

  // === ВСТАВЛЯЕМ ЗДЕСЬ: Заполняем список счетов (v2.1) ===
  const accountSelect = document.getElementById('income-account');
  if (accountSelect) {
    accountSelect.innerHTML = '';
    appData.settings.accounts.forEach((account) => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = `${account.emoji || ''} ${account.name}`.trim();
      // Выбираем счёт по умолчанию
      if (account.id === appData.settings.defaultAccountId) {
        option.selected = true;
      }
      accountSelect.appendChild(option);
    });
  }
  // ========================================================

  // Открываем модальное окно и фокусируемся на категории
  incomeModal.classList.add('is-open');
  incomeCategorySelect.focus();
}

// Закрытие модального окна доходов
function closeIncomeModal() {
  incomeModal.classList.remove('is-open');
  incomeCategorySelect.value = 'gift'; // Сброс на первую категорию
  incomeAmountInput.value = '';
}

/**
 * Открыть модальное окно перевода (v2.5)
 */
function openTransferModal() {
  const fromSelect = document.getElementById('transfer-from-account');
  const toSelect = document.getElementById('transfer-to-account');
  
  if (!fromSelect || !toSelect) return;

  // Очищаем списки
  fromSelect.innerHTML = '';
  toSelect.innerHTML = '';

  // Заполняем счетами
  const accounts = appData.settings.accounts || [];
  const defaultAccountId = appData.settings.defaultAccountId || 'sber';

  accounts.forEach(acc => {
    // Для "Откуда"
    const optionFrom = document.createElement('option');
    optionFrom.value = acc.id;
    optionFrom.textContent = acc.name;
    if (acc.id === defaultAccountId) optionFrom.selected = true;
    fromSelect.appendChild(optionFrom);

    // Для "Куда"
    const optionTo = document.createElement('option');
    optionTo.value = acc.id;
    optionTo.textContent = acc.name;
    toSelect.appendChild(optionTo);
  });

  // Очищаем поля
  document.getElementById('transfer-amount').value = '';
  document.getElementById('transfer-note').value = '';

  // Открываем модалку
  document.getElementById('transfer-modal').classList.add('is-open');
  document.getElementById('transfer-amount').focus();
}

/**
 * Закрыть модальное окно перевода (v2.5)
 */
function closeTransferModal() {
  document.getElementById('transfer-modal').classList.remove('is-open');
}

// Обработчик кнопки "Отмена" в модалке перевода (v2.5)
const btnCancelTransfer = document.getElementById('btn-cancel-transfer');
if (btnCancelTransfer) {
  btnCancelTransfer.addEventListener('click', closeTransferModal);
}

// Сохранение дохода (v2.3 + исправление индикатора)
function saveIncome() {
  const categoryId = incomeCategorySelect.value;
  const amount = parseFloat(incomeAmountInput.value.replace(',', '.'));

  // Получаем выбранный счёт
  const accountId = document.getElementById('income-account').value;

  // === ИСПРАВЛЕНО: Получаем предмет и источник из правильных полей модалки дохода ===
  const itemValue = document.getElementById('income-item')?.value.trim() || '';
  const storeValue = document.getElementById('income-store')?.value.trim() || '';
  // ==================================================================================

  // 1. Валидация
  if (isNaN(amount) || amount <= 0) {
    alert('Пожалуйста, введите корректную сумму');
    incomeAmountInput.focus();
    return;
  }

  // 2. Создаём и сохраняем транзакцию
  createIncome(appData, {
    categoryId,
    amount,
    item: itemValue,
    store: storeValue,
    accountId,
  });

  // === НОВОЕ: Сохраняем в localStorage и обновляем индикатор ===
  saveData(appData);
  if (typeof updateSyncIndicator === 'function') {
    updateSyncIndicator(appData.transactions, appData.lastModified);
  }
  // ============================================================

  // 3. UI-реакция: очищаем поля, закрываем модалку и перерисовываем экраны
  incomeAmountInput.value = '';
  document.getElementById('income-item').value = ''; 
  document.getElementById('income-store').value = ''; 

  closeIncomeModal();

  renderTodayScreen(
    appData.settings,
    appData.fixedExpenses,
    appData.transactions,
  );
  renderTransactionList(appData.transactions, appData.settings.pensionDay);

  console.log(
    '✅ Добавлен доход, категория:',
    categoryId,
    'сумма:',
    amount,
    'счёт:',
    accountId,
  );
}

// ... конец функции saveIncome() ...


// === НОВОЕ: Сохранение перевода между счетами (v2.5) ===
function saveTransfer() {
  const fromAccountId = document.getElementById('transfer-from-account').value;
  const toAccountId = document.getElementById('transfer-to-account').value;
  const amount = parseFloat(document.getElementById('transfer-amount').value.replace(',', '.'));
  const noteValue = document.getElementById('transfer-note').value.trim();

  if (fromAccountId === toAccountId) {
    alert('❌ Выберите разные счета для перевода');
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    alert('Пожалуйста, введите корректную сумму');
    document.getElementById('transfer-amount').focus();
    return;
  }

  try {
    createTransfer(appData, {
      fromAccountId,
      toAccountId,
      amount,
      note: noteValue,
    });

    document.getElementById('transfer-amount').value = '';
    document.getElementById('transfer-note').value = '';
    closeTransferModal();
    renderAll(appData);

    console.log('✅ Перевод выполнен:', amount, '₽');
  } catch (error) {
    alert('❌ Ошибка: ' + error.message);
  }
}
// ======================================================

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

// Генератор стабильного цвета для подкатегории по её названию
function getSubcategoryColor(name) {
  if (!name) return '#95a5a6'; // Серый по умолчанию

  // === ЯРКИЕ ЦВЕТА ДЛЯ КЛЮЧЕВЫХ ПОДКАТЕГОРИЙ ===
    const brightColors = {
      Мясо: '#e74c3c', // Ярко-красный
      Рыба: '#2196F3', // Ярко-синий (как вода)
      'Овощи и фрукты': '#2ecc71', // Ярко-зелёный
      Молочное: '#3498db', // Ярко-синий
      'Хлеб и бакалея': '#FF9800', // Ярко-оранжевый
      Бензин: '#9b59b6', // Фиолетовый
      Коммуналка: '#1abc9c', // Бирюзовый
      Лекарства: '#e91e63', // Розовый
      Мобильный: '#00bcd4', // Голубой
      Разное: '#95a5a6', // Серый (нейтральный)
    };
  // ===============================================

  // Если есть явный цвет — используем его
  if (brightColors[name]) {
    return brightColors[name];
  }

  // Иначе генерируем на основе хэша
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 75%, 50%)`; // Увеличили насыщенность и контраст
}
window.getSubcategoryColor = getSubcategoryColor;

// Заполняем селект подкатегорий по выбранной категории
function fillSubcategories(categoryId) {
  const select = document.getElementById('expense-subcategory');
  if (!select) return; // Защита от ошибок, если элемента нет на странице
  
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

  // Сразу обновляем цветной индикатор после заполнения списка
  updateSubcategoryColorIndicator(select);
}

window.fillSubcategories = fillSubcategories;

// Вспомогательная функция: рисует цветной кружок рядом с выпадающим списком
function updateSubcategoryColorIndicator(selectElement) {
  // Ищем существующий индикатор или создаем новый
  let indicator = selectElement.parentNode.querySelector('.subcategory-color-indicator');
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = 'subcategory-color-indicator';
        indicator.style.cssText = indicator.style.cssText =
          'position: absolute; right: 20px; top: 68%; transform: translateY(-50%); width: 12px; height: 12px; border-radius: 50%; transition: background-color 0.2s ease; pointer-events: none;';
        selectElement.parentNode.style.position = 'relative';
    selectElement.parentNode.insertBefore(indicator, selectElement.nextSibling);
  }

  // Определяем цвет на основе текста выбранной опции
  const selectedOption = selectElement.options[selectElement.selectedIndex];
  if (selectedOption && selectedOption.value !== '') {
    indicator.style.backgroundColor = getSubcategoryColor(selectedOption.textContent);
    indicator.style.opacity = '1';
  } else {
    indicator.style.backgroundColor = '#cbd5e1'; // Бледно-серый, если ничего не выбрано
    indicator.style.opacity = '0.5';
  }
}

// Открытие модального окна расходов с гарантированным заполнением категорий
function openExpenseModal() {
  // 1. Очищаем список (на случай, если он уже был заполнен)
  expenseCategorySelect.innerHTML = '';

  // 2. Заполняем список категориями с эмодзи
  EXPENSE_CATEGORIES.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = `${category.emoji || ''} ${category.name}`.trim();
    expenseCategorySelect.appendChild(option);
  });

  // 2.5. === ВСТАВЛЯЕМ ЗДЕСЬ: Заполняем список счетов (v2.1) ===
  const accountSelect = document.getElementById('expense-account');
  if (accountSelect) {
    accountSelect.innerHTML = '';
    appData.settings.accounts.forEach((account) => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = `${account.emoji || ''} ${account.name}`.trim();
      // Выбираем счёт по умолчанию
      if (account.id === appData.settings.defaultAccountId) {
        option.selected = true;
      }
      accountSelect.appendChild(option);
    });
  }
  // ========================================================

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
  const itemValue = document.getElementById('expense-item').value.trim();
  const storeValue = document.getElementById('expense-store').value.trim(); // ← НОВОЕ
  const subId = document.getElementById('expense-subcategory').value;
  const accountId = document.getElementById('expense-account').value;

  // 1. Валидация
  if (isNaN(amount) || amount <= 0) {
    alert('Пожалуйста, введите корректную сумму');
    expenseAmountInput.focus();
    return;
  }

  if (!subId) {
    alert('Пожалуйста, выберите подкатегорию');
    document.getElementById('expense-subcategory').focus();
    return;
  }

  // 2. Создаём и сохраняем через модуль (передаем accountId!)
    createExpense(appData, {
      categoryId,
      amount,
      subId,
      item: itemValue,
      store: storeValue,
      accountId,
    });

  // === НОВОЕ: Сохраняем в localStorage и обновляем индикатор ===
  saveData(appData);
  if (typeof updateSyncIndicator === 'function') {
    updateSyncIndicator(appData.transactions, appData.lastModified);
  }
  // ============================================================

  // 3. UI-реакция
  document.getElementById('expense-item').value = ''; // Очищаем поле
  document.getElementById('expense-store').value = ''; // ← НОВОЕ
  closeExpenseModal();

  renderTodayScreen(
    appData.settings,
    appData.fixedExpenses,
    appData.transactions,
  );
  renderTransactionList(appData.transactions, appData.settings.pensionDay);

  console.log('✅ Добавлен расход, категория:', categoryId, 'сумма:', amount, 'счёт:', accountId);

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

  // === НОВОЕ: Обновляем индикатор после изменения настроек ===
  if (typeof updateSyncIndicator === 'function') {
    updateSyncIndicator(appData.transactions, appData.lastModified);
  }
  // ============================================================

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

// Обработчик клика по кнопкам удаления и редактирования
function handleDeleteClick(event) {
  const target = event.target;

  // 1. Редактирование транзакции
  if (target.dataset.action === 'edit-transaction') {
    const transactionId = parseInt(target.dataset.id);
    openEditModal(transactionId);
    return; // Выходим, чтобы не срабатывали другие обработчики
  }

  // 2. Удаление транзакции (расхода)
  if (target.dataset.action === 'delete-transaction') {
    const transactionId = parseInt(target.dataset.id);
    if (confirm('Удалить эту запись о расходе?')) {
      deleteTransaction(appData, transactionId);
      
      // === НОВОЕ: Сохраняем и обновляем индикатор после удаления ===
      saveData(appData);
      if (typeof updateSyncIndicator === 'function') {
        updateSyncIndicator(appData.transactions, appData.lastModified);
      }
      // ============================================================
      
      renderAll(appData);
      console.log('Транзакция удалена:', transactionId);
    }
  }

  // 3. Удаление дохода
  if (target.dataset.action === 'delete-income') {
    const transactionId = parseInt(target.dataset.id);
    if (confirm('Удалить эту запись о доходе?')) {
      appData.transactions = appData.transactions.filter(
        (t) => t.id !== transactionId,
      );
      
      // === НОВОЕ: Явно сохраняем и обновляем индикатор ===
      saveData(appData);
      if (typeof updateSyncIndicator === 'function') {
        updateSyncIndicator(appData.transactions, appData.lastModified);
      }
      // ==================================================
      
      renderAll(appData);
      console.log('Доход удалён:', transactionId);
    }
  }

  // 4. Редактирование платежа
  if (target.dataset.action === 'edit-payment') {
    const paymentId = parseInt(target.dataset.id);
    const payment = appData.fixedExpenses.find((p) => p.id === paymentId);

    if (payment) {
      const newName = prompt('Название платежа:', payment.name);
      if (newName === null) return;

      const currentAmountFormatted = formatMoney(payment.amount);
      const newAmountStr = prompt(
        `Сумма (текущая: ${currentAmountFormatted}):`,
        currentAmountFormatted,
      );
      if (newAmountStr === null) return;

      const cleanAmountStr = newAmountStr
        .replace(/\s/g, '')
        .replace('₽', '')
        .replace(',', '.')
        .trim();
      const newAmount = parseFloat(cleanAmountStr);

      if (isNaN(newAmount) || newAmount <= 0) {
        alert('Некорректная сумма. Введите число, например: 4395.06');
        return;
      }

      const newDayStr = prompt('День месяца (1-28):', payment.day);
      if (newDayStr === null) return;

      const newDay = parseInt(newDayStr);
      if (isNaN(newDay) || newDay < 1 || newDay > 28) {
        alert('День должен быть от 1 до 28');
        return;
      }

      payment.name = newName.trim();
      payment.amount = newAmount;
      payment.day = newDay;

      saveData(appData); // saveData уже обновит индикатор, но для надёжности:
      if (typeof updateSyncIndicator === 'function') {
        updateSyncIndicator(appData.transactions, appData.lastModified);
      }
      
      renderAll(appData);
      console.log('Платёж обновлён:', payment);
    }
  }

  // 5. Удаление платежа
  if (target.dataset.action === 'delete-payment') {
    const paymentId = parseInt(target.dataset.id);
    if (confirm('Удалить этот обязательный платёж?')) {
      appData.fixedExpenses = appData.fixedExpenses.filter(
        (p) => p.id !== paymentId,
      );
      
      // === НОВОЕ: Сохраняем и обновляем индикатор ===
      saveData(appData);
      if (typeof updateSyncIndicator === 'function') {
        updateSyncIndicator(appData.transactions, appData.lastModified);
      }
      // ================================================
      
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
  const incomeFlag = isIncome(transaction); // ← ИСПРАВЛЕНО: была просто isIncome
  const categories = incomeFlag ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // Заполняем выпадающий список категориями
  const categorySelect = document.getElementById('edit-category');
  categorySelect.innerHTML = '';
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    // ← ИСПРАВЛЕНО: возвращаем название категории (возможно, с эмодзи, как было изначально)
    option.textContent = `${category.emoji || ''} ${category.name}`.trim();
    if (category.name === transaction.category) {
      option.selected = true;
    }
    categorySelect.appendChild(option);
  });

  // Заполняем подкатегории (только для расходов)
  const subcategoryLabel = document.getElementById('edit-subcategory-label');
  const subcategorySelect = document.getElementById('edit-subcategory');
  if (incomeFlag) {
    // ← ИСПРАВЛЕНО: была просто isIncome
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

  // Заполняем предмет покупки
  document.getElementById('edit-item').value = transaction.item || '';

  // Заполняем место покупки (НОВОЕ)
  document.getElementById('edit-store').value = transaction.store || '';

  // Заполняем комментарий (НОВОЕ)
  document.getElementById('edit-note').value = transaction.note || '';

  // === НОВОЕ: Заполняем выбор счёта ===
  const accountSelect = document.getElementById('edit-account');
  accountSelect.innerHTML = '';
  const accounts = window.appData?.settings?.accounts || [];
  const defaultAccountId = window.appData?.settings?.defaultAccountId || 'sber';

  accounts.forEach((acc) => {
    const option = document.createElement('option');
    option.value = acc.id;
    option.textContent = acc.name;

    // Выбираем текущий счёт транзакции (или дефолтный, если его нет у старых записей)
    if (acc.id === (transaction.accountId || defaultAccountId)) {
      option.selected = true;
    }
    accountSelect.appendChild(option);
  });
  // ======================================

  // Заполняем дату (формат YYYY-MM-DD для input type="date")
  const transactionDate = new Date(transaction.date);
  const dateStr = transactionDate.toISOString().split('T')[0];
  document.getElementById('edit-date').value = dateStr;

  // Открываем модальное окно
  document.getElementById('edit-modal').classList.add('is-open');
  document.getElementById('edit-amount').focus();

  // === НОВОЕ: Умное отображение полей в зависимости от типа транзакции (v2.5) ===
  const isTransfer = transaction.type === 'transfer'; // ИСПРАВЛЕНО: используем transaction, а не originalTransaction

  // Получаем ссылки на лейблы (используем уже объявленные переменные, чтобы не было дублирования const)
  const categoryLabel = categorySelect.closest('.modal__label');
  // subcategoryLabel и subcategorySelect уже объявлены выше в функции, используем их!
  const itemLabel = document
    .getElementById('edit-item')
    ?.closest('.modal__label');
  const storeLabel = document
    .getElementById('edit-store')
    ?.closest('.modal__label');
  const accountLabel = accountSelect.closest('.modal__label');

  const fromLabel = document.getElementById('edit-transfer-from-label');
  const toLabel = document.getElementById('edit-transfer-to-label');
  const fromSelect = document.getElementById('edit-transfer-from');
  const toSelect = document.getElementById('edit-transfer-to');

  if (isTransfer) {
    // Для переводов: скрываем категорию, подкатегорию, предмет, магазин, обычный счёт
    if (categoryLabel) categoryLabel.style.display = 'none';
    if (subcategoryLabel) subcategoryLabel.style.display = 'none';
    if (itemLabel) itemLabel.style.display = 'none';
    if (storeLabel) storeLabel.style.display = 'none';
    if (accountLabel) accountLabel.style.display = 'none';

    // === СКРЫВАЕМ поле "Счёт" (прямое скрытие) ===
    const editAccountSelect = document.getElementById('edit-account');
    if (editAccountSelect) {
      editAccountSelect.parentElement.style.display = 'none'; // Скрываем родительский label
    }

    // Показываем поля "Откуда" и "Куда"
    if (fromLabel) fromLabel.style.display = 'block';
    if (toLabel) toLabel.style.display = 'block';

    // Заполняем списки счетов для перевода
    if (fromSelect && toSelect) {
      fromSelect.innerHTML = '';
      toSelect.innerHTML = '';
      const accounts = appData.settings.accounts || [];
      accounts.forEach((acc) => {
        const optFrom = document.createElement('option');
        optFrom.value = acc.id;
        optFrom.textContent = acc.name;
        if (acc.id === transaction.fromAccountId) optFrom.selected = true; // ИСПРАВЛЕНО
        fromSelect.appendChild(optFrom);

        const optTo = document.createElement('option');
        optTo.value = acc.id;
        optTo.textContent = acc.name;
        if (acc.id === transaction.toAccountId) optTo.selected = true; // ИСПРАВЛЕНО
        toSelect.appendChild(optTo);
      });
    }
  } else {
    // Для обычных транзакций: показываем все стандартные поля
    if (categoryLabel) categoryLabel.style.display = 'block';
    if (subcategoryLabel) subcategoryLabel.style.display = 'block';
    if (itemLabel) itemLabel.style.display = 'block';
    if (storeLabel) storeLabel.style.display = 'block';
    if (accountLabel) accountLabel.style.display = 'block';

    // Скрываем поля "Откуда" и "Куда"
    if (fromLabel) fromLabel.style.display = 'none';
    if (toLabel) toLabel.style.display = 'none';
  }
  // ===========================================================================
}

/**
 * Закрыть модальное окно редактирования
 */
function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('is-open');
  editingTransactionId = null;
}

/**
 * Сохранить изменения транзакции (v2.5 — с поддержкой переводов и комментария)
 */
function saveEditTransaction() {
  if (!editingTransactionId) return;

  // 1. Получаем базовые значения
  const categoryId = document.getElementById('edit-category').value;
  const amount = parseFloat(
    document.getElementById('edit-amount').value.replace(',', '.'),
  );
  const dateStr = document.getElementById('edit-date').value;
  const accountId = document.getElementById('edit-account').value;

  // === НОВОЕ: Читаем комментарий (работает и для расходов, и для переводов) ===
  const noteValue = document.getElementById('edit-note')?.value.trim() || '';
  // ===========================================================================

  // Объявляем переменные для предмета, магазина и подкатегории (заполним их ниже)
  let itemValue = '';
  let storeValue = '';
  let subName = '';

  // 2. Валидация суммы
  if (isNaN(amount) || amount <= 0) {
    alert('Пожалуйста, введите корректную сумму');
    document.getElementById('edit-amount').focus();
    return;
  }

  // 3. Валидация даты
  if (!dateStr) {
    alert('Пожалуйста, выберите дату');
    return;
  }

  // 4. Находим транзакцию
  const transactionIndex = appData.transactions.findIndex(
    (t) => t.id === editingTransactionId,
  );
  if (transactionIndex === -1) {
    alert('Транзакция не найдена');
    return;
  }

  const originalTransaction = appData.transactions[transactionIndex];
  const incomeFlag = isIncome(originalTransaction);
  const categories = incomeFlag ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const category = categories.find((c) => c.id === categoryId);
  const categoryName = category ? category.name : categoryId;

  // 5. === Умная обработка полей в зависимости от типа транзакции (v2.5) ===
  if (originalTransaction.type === 'transfer') {
    // Для переводов: подкатегории, предмета и магазина не существует.
    subName = '';
    itemValue = '';
    storeValue = '';
  } else {
    // Стандартная логика только для расходов и доходов
    if (!incomeFlag) {
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

    // Читаем предмет и место покупки из полей ввода (только для обычных транзакций)
    itemValue = document.getElementById('edit-item')?.value.trim() || '';
    storeValue = document.getElementById('edit-store')?.value.trim() || '';
  }
  // ===========================================================================

  // 6. Создаём новую дату (сохраняем оригинальное время)
  const originalDate = new Date(originalTransaction.date);
  const newDate = new Date(dateStr);
  newDate.setHours(
    originalDate.getHours(),
    originalDate.getMinutes(),
    originalDate.getSeconds(),
  );

  // 7. Обновляем транзакцию
  const updatedTransaction = {
    ...originalTransaction, // Сохраняем id, type и т.д.
    category: categoryName,
    subcategory: subName,
    amount: amount,
    date: newDate.toISOString(),
    item: itemValue,
    store: storeValue,
    note: noteValue, // === НОВОЕ: Сохраняем комментарий ===
    accountId:
      accountId ||
      originalTransaction.accountId ||
      appData.settings.defaultAccountId,
  };

  // Если это перевод — обновляем счета "Откуда" и "Куда"
  if (originalTransaction.type === 'transfer') {
    updatedTransaction.fromAccountId =
      document.getElementById('edit-transfer-from')?.value ||
      originalTransaction.fromAccountId;
    updatedTransaction.toAccountId =
      document.getElementById('edit-transfer-to')?.value ||
      originalTransaction.toAccountId;
  }

  appData.transactions[transactionIndex] = updatedTransaction;

  // 8. Сохраняем данные и перерисовываем интерфейс
  saveData(appData);

  // === НОВОЕ: Гарантируем обновление индикатора после редактирования ===
  if (typeof updateSyncIndicator === 'function') {
    updateSyncIndicator(appData.transactions, appData.lastModified);
  }
  // ====================================================================

  closeEditModal();
  renderAll(appData);

  console.log(
    '✅ Транзакция обновлена:',
    appData.transactions[transactionIndex],
  );
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
  updateSyncIndicator(appData.transactions, appData.lastModified);

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

      // 1. Проверяем базовую структуру данных
      if (
        !importedData.settings ||
        !importedData.fixedExpenses ||
        !importedData.transactions
      ) {
        throw new Error(
          'Неверный формат файла: отсутствуют основные разделы данных',
        );
      }

      // 2. Подтверждение
      if (
        !confirm(
          '⚠️ Это заменит все текущие данные на данные из файла. Продолжить?',
        )
      ) {
        return;
      }

      // 3. Заменяем данные
      appData = importedData;
      window.appData = appData;

      // 4. Страховка совместимости (v2.5)
      if (
        !appData.settings.accounts ||
        appData.settings.accounts.length === 0
      ) {
        appData.settings.accounts = [
          {
            id: 'account_default_' + Date.now(),
            name: 'Основной счёт',
            emoji: '💼',
            color: '#3498db',
          },
        ];
        appData.settings.defaultAccountId = appData.settings.accounts[0].id;
      }

      if (!appData.settings.lastExportDate) {
        appData.settings.lastExportDate = new Date().toISOString();
      }

      // === КРИТИЧЕСКИ ВАЖНО: Миграция транзакций без accountId (v2.1) ===
      const defaultAccountId =
        appData.settings.defaultAccountId || appData.settings.accounts[0].id;
      let migratedCount = 0;

      appData.transactions.forEach((t) => {
        if (!t.accountId) {
          t.accountId = defaultAccountId;
          migratedCount++;
        }
      });

      if (migratedCount > 0) {
        console.log(
          `🔄 Миграция: присвоен accountId для ${migratedCount} транзакций`,
        );
      }
      // ====================================================================

      // 5. Всегда обновляем lastModified на время импорта
      appData.lastModified = new Date().toISOString();

      // 6. Сохраняем данные
      saveData(appData);

      // 7. Обновляем индикатор синхронизации
      if (typeof updateSyncIndicator === 'function') {
        updateSyncIndicator(appData.transactions, appData.lastModified);
      }

      // 8. Явный пересчет баланса счетов ПОСЛЕ миграции
      if (typeof renderAccountsList === 'function') {
        renderAccountsList();
        console.log('✅ Баланс счетов пересчитан после импорта');
      }

      // === НОВОЕ: Обновляем баннер сверки после импорта ===
      if (typeof window.updateReconcileBanner === 'function') {
        window.updateReconcileBanner();
        console.log('✅ Баннер сверки обновлён после импорта');
      }

      // 9. Перерисовываем остальные экраны
      renderTodayScreen(
        appData.settings,
        appData.fixedExpenses,
        appData.transactions,
      );
      renderTransactionList(appData.transactions, appData.settings.pensionDay);
      renderStats(
        appData.settings,
        appData.fixedExpenses,
        appData.transactions,
      );
      renderSettings(appData.settings, appData.fixedExpenses);

      alert('✅ Данные успешно восстановлены!');
    } catch (error) {
      console.error('Ошибка импорта:', error);
      alert('❌ Ошибка при импорте: ' + error.message);
    }
  };

  reader.readAsText(file);
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
      window.expenseChartInstance.destroy();
      renderStats(
        appData.settings,
        appData.fixedExpenses,
        appData.transactions,
      );
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
        if (typeof renderStats === 'function') {
          renderStats(data.settings, data.fixedExpenses, data.transactions);
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
  document.getElementById('delete-range-btn').addEventListener('click', () => {
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
  const count = deleteTransactionsByRange(appData, from, to);
  saveData(appData);
  renderAll(appData);
  updateDeletePreview();
  alert(`Готово! Удалено записей: ${victims.length}`);
}

// ========================================================================
// 📱 СВАЙП-НАВИГАЦИЯ (ВРЕМЕННО ОТКЛЮЧЕНО)
// Причина: Конфликт событий Hammer.js с кликами по навигации в PWA.
// Будет переделано на библиотеку Swiper.js на этапе финальной полировки.
// ========================================================================
if (false) {
  let hammerInstance = null;

  function initSwipeNavigation() {
    if (hammerInstance) {
      hammerInstance.destroy();
    }

    if (typeof Hammer !== 'undefined') {
      hammerInstance = new Hammer(document.body, {
        touchAction: 'pan-y',
      });

      hammerInstance.get('swipe').set({
        direction: Hammer.DIRECTION_HORIZONTAL,
        threshold: 50,
        velocity: 0.3,
      });

      hammerInstance.on('swipeleft', () => {
        navigateScreens(1);
      });

      hammerInstance.on('swiperight', () => {
        navigateScreens(-1);
      });
    }
  }

  function navigateScreens(direction) {
    const screens = [
      'screen-today',
      'screen-history',
      'screen-stats',
      'screen-reconcile',
      'screen-settings',
    ];
    const currentHash = window.location.hash || '#screen-today';
    const currentScreenId = currentHash.replace('#', '');
    const currentIndex = screens.indexOf(currentScreenId);

    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < screens.length) {
      window.location.hash = `#${screens[newIndex]}`;
      setTimeout(initSwipeNavigation, 100);
    }
  }

  initSwipeNavigation();
}
// ========================================================================

// Обновляем иконку "Сегодня" на текущее число месяца
function updateTodayIcon() {
  const today = new Date();
  const day = today.getDate();

  // Находим первую кнопку навигации (Сегодня)
  const firstNavItem = document.querySelector('.bottom-nav__item:first-child');

  if (firstNavItem) {
    const icon = firstNavItem.querySelector('.bottom-nav__icon');
    if (icon) {
      // Заменяем эмодзи на число
      icon.textContent = day;
      icon.style.fontSize = '22px';
      icon.style.fontWeight = 'bold';
      icon.style.color = 'var(--color-primary)';
    }
  }
}

// Вызываем при загрузке
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateTodayIcon);
} else {
  updateTodayIcon();
}
