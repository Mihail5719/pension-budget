import { saveData, } from './storage.js';
import { formatMoney, formatDateOnly, getCurrentPeriod } from './utils.js';
import {
  calculateDailyLimit,
  getIndicatorState,
  getTodayPayments,
} from './budget.js';

// Текущий выбранный счёт на экране "Сегодня" ('all' или ID счёта)
let currentTodayAccountId = 'all';

// Список регулярных доходов (с фиксированной датой поступления)
// Аванс убран, так как он просто увеличивает остаток при поступлении
const REGULAR_INCOME_TYPES = ['Стипендия', 'Зарплата', 'Пенсия'];

// === Глобальная переменная для табов статистики (v2.4) ===
let currentStatsAccountId = 'all';
// ========================================================

// ─── Предикаты типов операций (v2.0, коммит 2 + проценты) ───
const isIncome = (t) => t.type === 'income' || t.type === 'interest'; // ← ДОБАВИЛИ interest
const isExpense = (t) => t.type === 'expense';
const isCommitted = (t) => t.type === 'committed';
const isMoneyOut = (t) => isExpense(t) || isCommitted(t);
// ─── конец блока предикатов ───

// Обновление экрана "Сегодня" (Упрощённая версия: только общий расчёт)
export function renderTodayScreen(settings, fixedExpenses, transactions) {
  console.log('🚨 ФУНКЦИЯ renderTodayScreen ЗАПУЩЕНА (Упрощённая)!');

  // 1. Расчёт дней до следующего поступления
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let endDate;
  if (settings.currentPeriodStart) {
    endDate = new Date(settings.currentPeriodStart);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(settings.pensionDay);
  } else {
    endDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      settings.pensionDay,
    );
    if (endDate <= today) {
      endDate.setMonth(endDate.getMonth() + 1);
    }
  }
  endDate.setHours(0, 0, 0, 0);

  const diffTime = endDate.getTime() - today.getTime();

  // Реальное количество дней (для отображения) - может быть 0
  const realDaysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Защищённое количество дней (для расчёта) - всегда ≥ 1
  const safeDaysLeft = Math.max(realDaysLeft, 1);

  // 2. ТОЛЬКО глобальный расчёт (убрали логику переключения счетов)
  const result = calculateDailyLimit(settings, fixedExpenses, transactions);

  // Перезаписываем дни и лимит на наши точные значения
  result.daysLeft = realDaysLeft; // Показываем реальное значение (0, 1, 2...)
  result.dailyLimit = result.remaining / safeDaysLeft; // Считаем с защитой от деления на 0

  // 3. Отрисовка на экране
  const indicatorState = getIndicatorState(
    result.dailyLimit,
    result.freeBudget,
  );
  renderTodayPayments(getTodayPayments(fixedExpenses));

  document.getElementById('remaining-amount').textContent = formatMoney(
    result.remaining,
  );

  const indicatorEl = document.getElementById('indicator');
  indicatorEl.className = 'today-card__indicator indicator--' + indicatorState;

  document.getElementById('daily-limit').textContent = formatMoney(
    result.dailyLimit,
  );

    let spentFormatted = formatMoney(result.spent);
    if (!spentFormatted.includes('₽') && !spentFormatted.includes('руб')) {
      spentFormatted += ' ₽';
    }
    document.getElementById('spent-total').textContent = spentFormatted;


  document.getElementById('days-left').textContent = result.daysLeft;

  const headerSubtitle = document.querySelector('.header__subtitle');
  if (headerSubtitle) {
    headerSubtitle.textContent = `${settings.incomeName || 'Пенсия'}: ${settings.pensionDay} числа`;
  }

  // Кнопка отметки поступления
  const btnMarkPension = document.getElementById('btn-mark-pension');
  const pensionStatusText = document.getElementById('pension-status-text');
  const pensionDateDisplay = document.getElementById('pension-date-display');

  if (btnMarkPension && pensionStatusText && pensionDateDisplay) {
    const isMarked = !!settings.currentPeriodStart;
    const incomeName = settings.incomeName || 'Пенсия';

    document.getElementById('remaining-label').textContent =
      'Осталось до следующего поступления';
    document.getElementById('daily-limit-hint').textContent =
      'чтобы хватило до следующего поступления';

    if (isMarked) {
      btnMarkPension.style.display = 'none';
      pensionStatusText.style.display = 'flex';
      const d = new Date(settings.currentPeriodStart);
      const dateStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
      pensionDateDisplay.textContent = `✅ Поступление: ${incomeName} (${dateStr})`;
    } else {
      btnMarkPension.style.display = 'block';
      pensionStatusText.style.display = 'none';
    }
  }

  // Предупреждения о резерве
  const noReserveWarning = document.getElementById('no-reserve-warning');
  if (noReserveWarning)
    noReserveWarning.style.display =
      settings.reserveAmount <= 0 ? 'flex' : 'none';

  const btnUseReserve = document.getElementById('btn-use-reserve');
  if (btnUseReserve)
    btnUseReserve.style.display = settings.reserveAmount > 0 ? 'block' : 'none';

  // === СКРЫВАЕМ ТАБЫ, ЕСЛИ ОНИ ОСТАЛИСЬ В HTML ===
  const tabsContainer =
    document.querySelector('.tabs-container') ||
    document.getElementById('today-tabs');
  if (tabsContainer) {
    tabsContainer.style.display = 'none';
  }
}

// === НОВОЕ: Отрисовка табов для экрана Истории ===
function renderHistoryTabs() {
  const listEl = document.getElementById('transaction-list');
  if (!listEl) return;

  // Находим или создаем контейнер для табов
  let tabsContainer = document.getElementById('history-tabs-container');
  if (!tabsContainer) {
    tabsContainer = document.createElement('div');
    tabsContainer.id = 'history-tabs-container';
    tabsContainer.style.cssText =
      'display: flex; gap: 8px; overflow-x: auto; padding: 10px 0; margin-bottom: 15px; -webkit-overflow-scrolling: touch;';
    listEl.parentElement.insertBefore(tabsContainer, listEl);
  }
  tabsContainer.innerHTML = '';

  const accounts = window.appData.settings.accounts;
  const currentId = window.currentHistoryAccountId || 'all';

  console.log(
    '📊 [renderHistoryTabs] Доступные счета:',
    accounts.map((a) => `${a.name} (${a.id}) isSavings:${a.isSavings}`),
  );
  console.log(' [renderHistoryTabs] Текущий выбранный счёт:', currentId);

  // 1. Таб "Все"
  const allTab = document.createElement('button');
  allTab.className = `stats-tab ${currentId === 'all' ? 'active' : ''}`;
  allTab.textContent = 'Все счета';
  allTab.onclick = () => {
    window.currentHistoryAccountId = 'all';
    console.log('✅ [renderHistoryTabs] Выбрано: ВСЕ счета');
    renderHistoryTabs();
    renderTransactionList(
      window.appData.transactions,
      window.appData.settings.pensionDay,
    );
  };
  tabsContainer.appendChild(allTab);

  // 2. Табы по активным счетам
  if (accounts && accounts.length > 0) {
    accounts.forEach((acc) => {
      if (acc.isSavings) {
        console.log(
          `⏭️ [renderHistoryTabs] Пропускаем накопительный счёт: ${acc.name}`,
        );
        return;
      }

      const tab = document.createElement('button');
      tab.className = `stats-tab ${currentId === acc.id ? 'active' : ''}`;
      tab.textContent = `${acc.emoji || '💼'} ${acc.name}`;
      tab.onclick = () => {
        window.currentHistoryAccountId = acc.id;
        console.log(
          `✅ [renderHistoryTabs] Выбран счёт: ${acc.name} (ID: ${acc.id})`,
        );
        renderHistoryTabs();
        renderTransactionList(
          window.appData.transactions,
          window.appData.settings.pensionDay,
        );
      };
      tabsContainer.appendChild(tab);
    });
  }
}

// Отрисовка списка транзакций с группировкой по дням и раздельными итогами
export function renderTransactionList(transactions, pensionDay) {
  const listEl = document.getElementById('transaction-list');
  if (!listEl) return;

  // === ВАЖНО: Полностью очищаем список перед новой отрисовкой ===
  listEl.innerHTML = '';
  // ===============================================================

  // === НОВОЕ: Сначала рисуем табы ===
  if (typeof renderHistoryTabs === 'function') {
    renderHistoryTabs();
  }
  // ==================================

  // Инициализируем переменную, если её еще нет
  if (typeof window.currentHistoryAccountId === 'undefined') {
    window.currentHistoryAccountId = 'all';
  }

  // === ФИЛЬТР ПО СЧЁТУ (Многоконточность) ===
  console.log(
    '🔄 Обновление истории. Выбранный счёт:',
    window.currentHistoryAccountId,
  );

  const filteredTransactions =
    window.currentHistoryAccountId === 'all'
      ? transactions
      : transactions.filter(
          (t) =>
            t.accountId === window.currentHistoryAccountId ||
            t.fromAccountId === window.currentHistoryAccountId ||
            t.toAccountId === window.currentHistoryAccountId,
        );
  // ==========================================

  if (filteredTransactions.length === 0) {
    const emptyMessage =
      window.currentHistoryAccountId === 'all'
        ? 'Пока нет операций'
        : 'По этому счёту операций пока нет';

    listEl.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 40px;">${emptyMessage}</p>`;
    return;
  }

  // ВАЖНО: сортируем и группируем уже отфильтрованный массив!
  const sorted = [...filteredTransactions].sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );
  const grouped = {};

  sorted.forEach((tx) => {
    const dateKey = tx.date.split('T')[0];
    if (!grouped[dateKey]) {
      grouped[dateKey] = { transactions: [], income: 0, expense: 0 };
    }
    grouped[dateKey].transactions.push(tx);

    if (isIncome(tx)) {
      grouped[dateKey].income += tx.amount;
    } else if (tx.type === 'transfer') {
      // Переводы НЕ считаются ни доходом, ни расходом
    } else {
      grouped[dateKey].expense += tx.amount;
    }
  });

  Object.keys(grouped).forEach((dateKey) => {
    const group = grouped[dateKey];
    const firstTxDate = group.transactions[0].date;

    let summaryHtml = '';
    if (group.income > 0 && group.expense > 0) {
      summaryHtml = `
        <span class="day-header__income">Доход: +${formatMoney(group.income)}</span>
        <span class="day-header__divider">|</span>
        <span class="day-header__expense">Расход: -${formatMoney(group.expense)}</span>
      `;
    } else if (group.income > 0) {
      summaryHtml = `<span class="day-header__income">Доход: +${formatMoney(group.income)}</span>`;
    } else if (group.expense > 0) {
      summaryHtml = `<span class="day-header__expense">Расход: -${formatMoney(group.expense)}</span>`;
    }

    const groupHeader = document.createElement('div');
    groupHeader.className = 'day-header';
    groupHeader.style.cssText = `
      background-color: var(--bg-secondary, #f8f9fa);
      border-left: 4px solid #3498db;
      color: var(--text-primary, #555);
      padding-left: 12px;
    `;

    groupHeader.innerHTML = `
      <span class="day-header__date">${formatDateOnly(firstTxDate)}</span>
      <span class="day-header__summary">${summaryHtml}</span>
    `;
    listEl.appendChild(groupHeader);

    group.transactions.forEach((transaction) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'transaction';
      itemEl.dataset.id = transaction.id;
      if (transaction.type === 'reserve') {
        itemEl.classList.add('transaction--reserve');
      }

      if (transaction.type === 'transfer') {
        const fromAccount = window.appData?.settings?.accounts?.find(
          (a) => a.id === transaction.fromAccountId,
        );
        const toAccount = window.appData?.settings?.accounts?.find(
          (a) => a.id === transaction.toAccountId,
        );
        const fromName = fromAccount ? fromAccount.name : 'Счёт';
        const toName = toAccount ? toAccount.name : 'Счёт';

        itemEl.innerHTML = `
          <div class="transaction__info">
              <span class="transaction__category">⇄ Перевод</span>
              <span class="transaction__subcategory">С ${fromName} на ${toName}</span>
              ${transaction.note ? `<span class="transaction__item">💬 ${transaction.note}</span>` : ''}
          </div>
          <div class="transaction__right">
              <span class="transaction__amount transaction__amount--transfer">${formatMoney(transaction.amount)}</span>
              <div class="transaction__actions">
                  <button class="btn-edit" data-action="edit-transaction" data-id="${transaction.id}" title="Редактировать">✎</button>
                  <button class="btn-delete" data-action="delete-transaction" data-id="${transaction.id}" title="Удалить">✕</button>
              </div>
          </div>
        `;
        listEl.appendChild(itemEl);
        return;
      }

      const incomeFlag = isIncome(transaction);
      const amountClass = incomeFlag
        ? 'transaction__amount--income'
        : 'transaction__amount';
      const amountPrefix = incomeFlag ? '+' : '-';
      const deleteAction = incomeFlag ? 'delete-income' : 'delete-transaction';

      const catStyle = categoryConfig[transaction.category] || {
        emoji: '📦',
        color: '#95a5a6',
      };
      const committedFlag = isCommitted(transaction);
      const emoji = committedFlag ? '📋' : catStyle.emoji;
      const displayName = `${emoji} ${transaction.category}`;

      const account = window.appData?.settings?.accounts?.find(
        (a) => a.id === transaction.accountId,
      );
      const accountIcon = account ? account.emoji : '💼';
      const accountColor = account ? account.color : '#95a5a6';
      const accountName = account ? account.name : 'Счёт';

      // === ГИБРИДНОЕ ПРЕДСТАВЛЕНИЕ: Цветной кружок подкатегории в истории ===
      let subLine = '';
      if (transaction.subcategory) {
        const subColor = getSubcategoryColor(transaction.subcategory);
        subLine = `<span class="transaction__subcategory">
                     <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${subColor}; margin-right: 6px; vertical-align: middle;"></span>
                     ${transaction.subcategory}
                   </span>`;
      }
      // ======================================================================
      const itemLine = transaction.item
        ? `<span class="transaction__item">${transaction.item}</span>`
        : '';
      const storeLine = transaction.store
        ? `<span class="transaction__store">📍 ${transaction.store}</span>`
        : '';
      const noteLine =
        committedFlag && transaction.note
          ? `<span class="transaction__subcategory">${transaction.note}</span>`
          : '';

      itemEl.innerHTML = `
        <div class="transaction__info">
            <span class="transaction__category">${displayName}</span>
            ${subLine}${itemLine}${storeLine}${noteLine}
            <span class="transaction__account-name">${accountName}</span>
        </div>
        <div class="transaction__right">
            <span class="transaction__amount ${amountClass}">${amountPrefix}${formatMoney(transaction.amount)}</span>
            <div class="transaction__actions">
                <button class="btn-edit" data-action="edit-transaction" data-id="${transaction.id}" title="Редактировать">✎</button>
                <button class="btn-delete" data-action="${deleteAction}" data-id="${transaction.id}" title="Удалить">✕</button>
            </div>
        </div>
      `;
      listEl.appendChild(itemEl);
    });
  });
}

// Отрисовка настроек
export function renderSettings(settings, fixedExpenses) {
  // === ИЗМЕНЕНИЕ: Делаем поле "Начальный остаток" только для чтения ===
  const initialBalanceInput = document.getElementById('input-initial-balance');
  if (initialBalanceInput) {
    initialBalanceInput.value = settings.initialBalance || 0;
    initialBalanceInput.readOnly = true; // Запрещаем ручной ввод
    initialBalanceInput.style.backgroundColor = '#f1f3f5'; // Серый фон (визуально неактивно)
    initialBalanceInput.style.cursor = 'not-allowed'; // Курсор "запрещено"
    initialBalanceInput.title =
      'Автоматически рассчитывается как сумма балансов всех счетов'; // Подсказка при наведении
  }
  // =====================================================================

  // === НОВОЕ: Восстанавливаем выбранный источник дохода ===
  const incomeSelect = document.getElementById('select-income-type');
  if (incomeSelect) {
    const incomeName = settings.incomeName || 'Пенсия';
    // Если значение есть в списке — выбираем его, иначе "Свой вариант"
    const optionExists = Array.from(incomeSelect.options).some(
      (opt) => opt.value === incomeName,
    );
    if (optionExists) {
      incomeSelect.value = incomeName;
      document.getElementById('custom-income-label').style.display = 'none';
    } else {
      incomeSelect.value = 'custom';
      document.getElementById('custom-income-label').style.display = 'block';
      document.getElementById('input-custom-income').value = incomeName;
    }
  }
  // ==========================================

  // Динамически меняем метку "Размер пенсии" → "Размер [дохода]"
  const incomeAmountLabel = document.getElementById('income-amount-label');
  if (incomeAmountLabel) {
    const displayName = settings.incomeName || 'Пенсия';
    incomeAmountLabel.textContent = `Сумма поступления`;
  }

  document.getElementById('input-pension').value = settings.pensionAmount || 0;
  document.getElementById('input-pension-day').value = settings.pensionDay;
  document.getElementById('input-reserve').value = settings.reserveAmount || 0;

  const listEl = document.getElementById('fixed-expenses-list');
  listEl.innerHTML = '';

  fixedExpenses.forEach((expense) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'fixed-expense';
    itemEl.dataset.id = expense.id;

    // === НОВОЕ: Находим название счёта ===
    const account = window.appData?.settings?.accounts?.find(
      (a) => a.id === expense.accountId,
    );
    const accountName = account
      ? `${account.emoji || '💼'} ${account.name}`
      : 'Не указан';
    // ======================================

    itemEl.innerHTML = `
      <div class="fixed-expense__info">
          <span class="fixed-expense__name">${expense.name}</span>
          <span class="fixed-expense__day">${expense.day ? expense.day + '-го числа' : ''}</span>
          <span class="fixed-expense__account" style="display: block; font-size: 12px; color: var(--text-secondary, #666); margin-top: 4px;">
            Со счёта: ${accountName}
          </span>
      </div>
      <span class="fixed-expense__amount">${formatMoney(expense.amount)}</span>
      <div class="fixed-expense__actions">
          <button class="btn-edit" data-action="edit-payment" data-id="${expense.id}" title="Редактировать">✎</button>
          <button class="btn-delete-payment" data-action="delete-payment" data-id="${expense.id}" title="Удалить">✕</button>
      </div>
    `;
    listEl.appendChild(itemEl);
  });

  initMoneyFields();
  renderPensionPeriodInfo(settings);

  

  // === ДИНАМИЧЕСКАЯ НАДПИСЬ "Текущий период" (v2.1, Идея 1) ===
  const currentPeriodLabel = document.getElementById('current-period-label');
  if (currentPeriodLabel) {
    const incomeName = settings.incomeName || 'Пенсия';
    currentPeriodLabel.textContent = `📅 Текущий период: ${incomeName}`;
  }
  // ============================================================

  // === Восстанавливаем видимость поля "День получения" при загрузке (v2.1) ===
  // Примечание: Убедитесь, что REGULAR_INCOME_TYPES импортирован в этом файле или доступен
  const pensionDayLabel = document
    .getElementById('input-pension-day')
    .closest('.settings-label');
  if (pensionDayLabel) {
    const currentIncomeName = settings.incomeName || 'Пенсия';
    // Если REGULAR_INCOME_TYPES не определен в ui.js, эта строка может вызвать ошибку.
    // Если всё работает, оставляем как есть.
    const isRegular =
      typeof REGULAR_INCOME_TYPES !== 'undefined' &&
      REGULAR_INCOME_TYPES.includes(currentIncomeName);
    pensionDayLabel.style.display = isRegular ? 'block' : 'none';
  }
  // ==========================================================================
}

export function updateSyncIndicator(transactions, lastModifiedDate) {
  const indicatorText = document.getElementById('sync-indicator-text');
  if (!indicatorText) return;

  const count = transactions ? transactions.length : 0;
  let dateStr = 'не сохранялось'; // Более честная начальная фраза

  if (lastModifiedDate) {
    const date = new Date(lastModifiedDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    dateStr = `${day}.${month}.${year}, ${hours}:${minutes}`;
  }

  // Меняем слово "Обновлено" на "Сохранено"
  indicatorText.textContent = `Записей: ${count} | Сохранено: ${dateStr}`;
}

export function renderAll(data) {
  renderTodayScreen(data.settings, data.fixedExpenses, data.transactions);
  renderTransactionList(data.transactions, data.settings.pensionDay);
  renderStats(data.settings, data.fixedExpenses, data.transactions);
  renderSettings(data.settings, data.fixedExpenses);

  // === ВОЗВРАЩАЕМ: Чтобы список счетов рисовался при обычной загрузке страницы ===
  if (typeof renderAccountsList === 'function') {
    renderAccountsList();
  }
  // ==============================================================================
  renderAccountsList();
}

function renderTodayPayments(payments) {
  const container = document.getElementById('today-payments-container');
  if (!container) return;
  container.innerHTML = '';

  const unpaidPayments = payments.filter((p) => !isPaymentPaidToday(p.id));

  if (unpaidPayments.length === 0) {
    container.innerHTML =
      '<p class="today-payments__empty">Сегодня платежей нет 🎉</p>';
    return;
  }

  const title = document.createElement('h3');
  title.className = 'today-payments__title';
  title.textContent = 'Сегодня к оплате';
  container.appendChild(title);

  const list = document.createElement('div');
  list.className = 'today-payments__list';

  unpaidPayments.forEach((payment) => {
    const item = document.createElement('div');
    item.className = 'today-payment-item';
    item.innerHTML = `
      <div class="today-payment-item__info">
        <span class="today-payment-item__name">${payment.name}</span>
        <span class="today-payment-item__amount">${formatMoney(payment.amount)}</span>
      </div>
      <div class="today-payment-item__actions">
        <button class="btn-paid" data-action="mark-paid" data-id="${payment.id}" title="Отметить как оплачено">✓</button>
        <button class="btn-postpone" data-action="postpone" data-id="${payment.id}" title="Отложить до завтра">⏸</button>
      </div>
    `;
    list.appendChild(item);
  });

  container.appendChild(list);

  container
    .querySelectorAll('[data-action="mark-paid"]')
    .forEach((btn) => btn.addEventListener('click', handleMarkPaid));
  container
    .querySelectorAll('[data-action="postpone"]')
    .forEach((btn) => btn.addEventListener('click', handlePostpone));
}

function isPaymentPaidToday(paymentId) {
  const today = new Date().toISOString().split('T')[0];
  const appData = JSON.parse(localStorage.getItem('pensionBudget') || '{}');
  const transactions = appData.transactions || [];
  return transactions.some(
    (t) => t.date === today && t.paymentId === paymentId,
  );
}

function handleMarkPaid(event) {
  const paymentId = parseInt(event.currentTarget.dataset.id);

  // ИСПРАВЛЕНИЕ 1: Используем глобальный объект, чтобы не было рассинхронизации
  const currentAppData =
    window.appData || JSON.parse(localStorage.getItem('pensionBudget') || '{}');
  const payment = currentAppData.fixedExpenses.find((p) => p.id === paymentId);
  if (!payment) return;

  if (
    !confirm(
      `Отметить "${payment.name}" (${formatMoney(payment.amount)}) как оплаченное?`,
    )
  ) {
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const transaction = {
    id: Date.now(),
    type: 'committed', // ← ИСПРАВЛЕНИЕ 2: Возвращаем 'committed', чтобы работали иконки и статистика!
    category: payment.name,
    amount: payment.amount,
    date: today,
    accountId: payment.accountId, // ← ИСПРАВЛЕНИЕ 3: Оставляем привязку к счёту, чтобы баланс ВТБ уменьшался!
    paymentId: paymentId,
    note: 'Автоматически: фиксированный платёж',
  };

  currentAppData.transactions = currentAppData.transactions || [];
  currentAppData.transactions.push(transaction);

  // Сохраняем в localStorage
  localStorage.setItem('pensionBudget', JSON.stringify(currentAppData));

  // ИСПРАВЛЕНИЕ 4: Синхронизируем глобальную переменную для мгновенного обновления UI
  window.appData = currentAppData;

  // Перерисовываем экраны
  if (typeof renderTodayScreen === 'function') {
    renderTodayScreen(
      currentAppData.settings,
      currentAppData.fixedExpenses,
      currentAppData.transactions,
    );
  }
  if (typeof renderTransactionList === 'function') {
    renderTransactionList(currentAppData.transactions);
  }
  // На всякий случай обновляем и статистику, если функция доступна
  if (typeof renderStats === 'function') {
    renderStats(
      currentAppData.settings,
      currentAppData.fixedExpenses,
      currentAppData.transactions,
    );
  }

  // === НОВОЕ: Обновляем балансы счетов ===
  if (typeof renderAccountsList === 'function') {
    renderAccountsList();
  }
}

function handlePostpone(event) {
  const paymentId = parseInt(event.currentTarget.dataset.id);
  const appData = JSON.parse(localStorage.getItem('pensionBudget') || '{}');
  const payment = appData.fixedExpenses.find((p) => p.id === paymentId);
  if (!payment) return;

  const postponed = appData.postponedPayments || {};
  postponed[paymentId] = new Date().toISOString().split('T')[0];
  appData.postponedPayments = postponed;
  localStorage.setItem('pensionBudget', JSON.stringify(appData));

  renderTodayScreen(
    appData.settings,
    appData.fixedExpenses,
    appData.transactions,
  );
}

const categoryConfig = {
  Продукты: { emoji: '🛒', color: '#c0392b' },
  Аптека: { emoji: '💊', color: '#2ecc71' },
  Транспорт: { emoji: '🚗', color: '#e67e22' },
  ЖКХ: { emoji: '🏠', color: '#d2b4de' },
  Связь: { emoji: '📱', color: '#2980b9' },
  Здоровье: { emoji: '🩺', color: '#a8e6cf' },
  Подарки: { emoji: '🎁', color: '#f1c40f' },
  'Для дома': { emoji: '🏡', color: '#2c3e50' },
  Одежда: { emoji: '👕', color: '#fd79a8' },
  Другое: { emoji: '📦', color: '#b2bec3' },
  Учёба: { emoji: '📚', color: '#9b59b6' },
  Накопления: { emoji: '🐷', color: '#1abc9c' },
  'Возврат долга': { emoji: '💰', color: '#27ae60' },
  Подработка: { emoji: '💼', color: '#16a085' },
  'Помощь от детей/родственников': { emoji: '👪', color: '#8e44ad' },
};

function getCategoryStyle(name) {
  if (categoryConfig[name]) return categoryConfig[name];
  const lowerName = name.toLowerCase();
  if (
    lowerName.includes('кредит') ||
    lowerName.includes('долг') ||
    lowerName.includes('займ')
  ) {
    return { emoji: '💳', color: '#E67E22' };
  }
  if (
    lowerName.includes('разное') ||
    lowerName.includes('другое') ||
    lowerName.includes('прочее')
  ) {
    return { emoji: '📦', color: '#34495E' };
  }
  for (const key in categoryConfig) {
    if (lowerName.includes(key.toLowerCase())) return categoryConfig[key];
  }
  return { emoji: '📦', color: '#2C3E50' };
}

function renderStatsTabs(accounts) {
  const container = document.getElementById('stats-tabs-container');
  if (!container) return;
  container.innerHTML = '';

  const allTab = document.createElement('button');
  allTab.className = `stats-tab ${currentStatsAccountId === 'all' ? 'active' : ''}`;
  allTab.textContent = 'Все счета';
  allTab.onclick = () => {
    currentStatsAccountId = 'all';
    renderStatsTabs(accounts);
    renderStats(
      window.appData.settings,
      window.appData.fixedExpenses,
      window.appData.transactions,
    );
  };
  container.appendChild(allTab);

  if (accounts && accounts.length > 0) {
    accounts.forEach((acc) => {
      // === НОВОЕ: Пропускаем накопительные счета ===
      if (acc.isSavings) return;
      // ============================================

      const tab = document.createElement('button');
      tab.className = `stats-tab ${currentStatsAccountId === acc.id ? 'active' : ''}`;
      tab.textContent = `${acc.emoji || '💼'} ${acc.name}`;
      tab.onclick = () => {
        currentStatsAccountId = acc.id;
        renderStatsTabs(accounts);
        renderStats(
          window.appData.settings,
          window.appData.fixedExpenses,
          window.appData.transactions,
        );
      };
      container.appendChild(tab);
    });
  }
}

function renderTodayTabs(accounts) {
  const container = document.getElementById('today-tabs-container');
  if (!container) return;
  container.innerHTML = '';

  const allTab = document.createElement('button');
  allTab.className = `stats-tab ${currentTodayAccountId === 'all' ? 'active' : ''}`;
  allTab.textContent = 'Все счета';
  allTab.onclick = () => {
    currentTodayAccountId = 'all';
    renderTodayTabs(accounts);
    renderTodayScreen(
      window.appData.settings,
      window.appData.fixedExpenses,
      window.appData.transactions,
    );
    // === ДОБАВЛЕНО: Обновляем список транзакций при смене вкладки ===
    renderTransactionList(
      window.appData.transactions,
      window.appData.settings.pensionDay,
    );
  };
  container.appendChild(allTab);

  if (accounts && accounts.length > 0) {
    accounts.forEach((acc) => {
      const tab = document.createElement('button');
      tab.className = `stats-tab ${currentTodayAccountId === acc.id ? 'active' : ''}`;
      tab.textContent = acc.name;
      tab.onclick = () => {
        currentTodayAccountId = acc.id;
        renderTodayTabs(accounts);
        renderTodayScreen(
          window.appData.settings,
          window.appData.fixedExpenses,
          window.appData.transactions,
        );
        // === ДОБАВЛЕНО: Обновляем список транзакций при смене вкладки ===
        renderTransactionList(
          window.appData.transactions,
          window.appData.settings.pensionDay,
        );
      };
      container.appendChild(tab);
    });
  }
}

export function renderStats(settings, fixedExpenses, transactions) {
  const topContainer = document.getElementById('stats-top');
  const bottomContainer = document.getElementById('stats-bottom');
  const canvas = document.getElementById('expense-chart');
  const emptyMsg = document.getElementById('stats-empty');

  if (!topContainer || !bottomContainer || !canvas) return;

  renderStatsTabs(settings.accounts || []);

  const startDate = settings.currentPeriodStart
    ? new Date(settings.currentPeriodStart)
    : getCurrentPeriod(settings.pensionDay).startDate;
  const { endDate } = getCurrentPeriod(settings.pensionDay);

  // Пенсия учитывается только для "Все счета" или счёта по умолчанию
  const isDefaultOrAll =
    currentStatsAccountId === 'all' ||
    currentStatsAccountId === settings.defaultAccountId;
  let totalIncome =
    settings.currentPeriodStart && isDefaultOrAll ? settings.pensionAmount : 0;
  let totalNonFixed = 0;
  let totalFixed = 0;
  const nonFixedByCat = {};
  const fixedByCat = {};

  transactions.forEach((t) => {
    if (
      currentStatsAccountId !== 'all' &&
      t.accountId !== currentStatsAccountId
    )
      return;
    const tDate = new Date(t.date);
    if (tDate >= startDate && tDate <= endDate) {
      const sub = t.subcategory || 'Без подкатегории';
      if (isIncome(t)) {
        totalIncome += t.amount;
      } else if (isExpense(t)) {
        totalNonFixed += t.amount;
        if (!nonFixedByCat[t.category])
          nonFixedByCat[t.category] = { total: 0, subs: {} };
        nonFixedByCat[t.category].total += t.amount;
        nonFixedByCat[t.category].subs[sub] =
          (nonFixedByCat[t.category].subs[sub] || 0) + t.amount;
      } else if (isCommitted(t)) {
        totalFixed += t.amount;
        if (!fixedByCat[t.category])
          fixedByCat[t.category] = { total: 0, subs: {} };
        fixedByCat[t.category].total += t.amount;
        fixedByCat[t.category].subs[sub] =
          (fixedByCat[t.category].subs[sub] || 0) + t.amount;
      }
    }
  });

  const totalExpenses = totalNonFixed + totalFixed;
  const accountName =
    currentStatsAccountId === 'all'
      ? 'Все счета'
      : settings.accounts?.find((a) => a.id === currentStatsAccountId)?.name ||
        'Счёт';

  let topHtml = `
    <h2 class="stats-title">Статистика: ${accountName}</h2>
    <div class="stats-summary-block">
      <div class="stats-row income"><span>Доходы:</span><span>+${formatMoney(totalIncome)}</span></div>
      <div class="stats-row expense"><span>Расходы:</span><span>-${formatMoney(totalExpenses)}</span></div>
      <div class="stats-divider"></div>
      <div class="stats-row"><span>Нефиксированные:</span><span>${formatMoney(totalNonFixed)}</span></div>
      <div class="stats-row"><span>Фиксированные:</span><span>${formatMoney(totalFixed)}</span></div>
    </div>
  `;
  topContainer.innerHTML = topHtml;

  const renderSection = (categoriesObj) => {
    let sectionHtml = '';
    const cats = Object.keys(categoriesObj).sort(
      (a, b) => categoriesObj[b].total - categoriesObj[a].total,
    );
    cats.forEach((cat) => {
      const entry = categoriesObj[cat];
      const style = getCategoryStyle(cat);
      const catPercent =
        totalExpenses > 0
          ? ((entry.total / totalExpenses) * 100).toFixed(1)
          : '0.0';
      sectionHtml += `<div class="breakdown__card">`;
      let accountDotHtml = '';
      if (currentStatsAccountId !== 'all') {
        const acc = settings.accounts?.find(
          (a) => a.id === currentStatsAccountId,
        );
        if (acc && acc.color)
          accountDotHtml = `<span class="stats-account-dot" style="background-color: ${acc.color};" title="${acc.name}"></span>`;
      }
      sectionHtml += `<div class="breakdown__header"><span>${style.emoji} ${cat} ${accountDotHtml}</span><span>${formatMoney(entry.total)} (${catPercent}%)</span></div>`;
      const subs = Object.keys(entry.subs).sort(
        (a, b) => entry.subs[b] - entry.subs[a],
      );
      subs.forEach((sub) => {
        const sum = entry.subs[sub];
        const subPercent =
          entry.total > 0 ? ((sum / entry.total) * 100).toFixed(1) : '0.0';
        sectionHtml += `<div class="breakdown__row"><div class="breakdown__line"><span>${sub}</span><span>${formatMoney(sum)} (${subPercent}%)</span></div><div class="breakdown__bar"><div class="breakdown__bar-fill" style="width:${subPercent}%;background:${style.color}"></div></div></div>`;
      });
      sectionHtml += `</div>`;
    });
    return sectionHtml;
  };

  let bottomHtml = '<h3 class="stats-breakdown-title">По подкатегориям</h3>';
  bottomHtml += renderSection(nonFixedByCat);
  bottomHtml += renderSection(fixedByCat);

  if (totalExpenses === 0) {
    bottomHtml +=
      '<p style="text-align: center; color: #7f8c8d; padding: 20px;">Нет расходов за этот период</p>';
  }
  bottomContainer.innerHTML = bottomHtml;

  if (totalExpenses > 0 && Object.keys(nonFixedByCat).length > 0) {
    if (emptyMsg) emptyMsg.hidden = true;
    canvas.style.display = 'block';
    const labels = [],
      data = [],
      backgroundColors = [];
    Object.keys(nonFixedByCat).forEach((cat) => {
      const style = getCategoryStyle(cat);
      labels.push(cat);
      data.push(nonFixedByCat[cat].total);
      backgroundColors.push(style.color);
    });

    if (window.expenseChartInstance) window.expenseChartInstance.destroy();
    Chart.defaults.animation.duration = 2000;
    Chart.defaults.animation.easing = 'easeOutQuart';

    window.expenseChartInstance = new Chart(canvas, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [
          {
            data: data,
            backgroundColor: backgroundColors,
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 2000,
          easing: 'easeOutQuart',
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 20,
              font: {
                size: 14,
                weight: '500',
              },
            },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const style = getCategoryStyle(context.label);
                const percentage = (
                  (context.parsed / totalExpenses) *
                  100
                ).toFixed(1);
                return `${style.emoji} ${context.label}: ${formatMoney(context.parsed)} (${percentage}%)`;
              },
            },
          },
        },
      },
    });
  } else {
    if (emptyMsg) emptyMsg.hidden = false;
    canvas.style.display = 'none';
    if (window.expenseChartInstance) window.expenseChartInstance.destroy();
  }
}

export function renderPensionPeriodInfo(settings) {
  const periodInfoEl = document.getElementById('period-info');
  if (!periodInfoEl) return;

  const currentAppData = window.appData || { settings: settings };
  const appSettings = currentAppData.settings;

  // === ДИНАМИЧЕСКОЕ НАЗВАНИЕ ДОХОДА (v2.1) ===
  const incomeName = appSettings.incomeName || 'Пенсия';
  // ============================================

  if (appSettings.currentPeriodStart) {
    const startDate = new Date(appSettings.currentPeriodStart);
    const pensionDay = appSettings.pensionDay;
    const nextPensionDate = new Date(startDate);
    nextPensionDate.setMonth(nextPensionDate.getMonth() + 1);
    nextPensionDate.setDate(pensionDay);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = nextPensionDate - today;
    const daysLeft = Math.max(Math.floor(diffTime / (1000 * 60 * 60 * 24)), 0);

    const formatDate = (date) =>
      `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;

    periodInfoEl.innerHTML = `
      <div class="period-info__row"><span class="period-info__label">Начало периода:</span><span class="period-info__value">${formatDate(startDate)}</span></div>
      <div class="period-info__row"><span class="period-info__label">Конец периода:</span><span class="period-info__value">${formatDate(nextPensionDate)}</span></div>
      <div class="period-info__row"><span class="period-info__label">Осталось дней:</span><span class="period-info__value">${daysLeft}</span></div>
    `;
  } else {
    // === НОВОЕ: Показываем ожидаемые даты вместо "Период ещё не начат" ===
    const pensionDay = appSettings.pensionDay || 23;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Ожидаемая дата начала = сегодня (или ближайший день получения)
    const expectedStart = new Date(today);
    const expectedEnd = new Date(today);
    expectedEnd.setMonth(expectedEnd.getMonth() + 1);
    expectedEnd.setDate(pensionDay);

    const formatDate = (date) =>
      `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;

    periodInfoEl.innerHTML = `
      <div class="period-info__row">
        <span class="period-info__label">Ожидаемый период:</span>
        <span class="period-info__value">${formatDate(expectedStart)} — ${formatDate(expectedEnd)}</span>
      </div>
      <div class="period-info__row">
        <em>Период ещё не начат. Отметьте поступление ${incomeName.toLowerCase()} на главном экране.</em>
      </div>
    `;
    // ============================================
  }
}



function initMoneyFields() {
  const moneyInputs = document.querySelectorAll('.money-field');
  moneyInputs.forEach((input) => {
    const rawValue = parseFloat(input.value);
    if (!isNaN(rawValue)) input.value = formatMoney(rawValue);

    input.addEventListener('focus', function () {
      let raw = this.value
        .replace(/\s/g, '')
        .replace('₽', '')
        .replace(',', '.')
        .trim();
      this.value = raw;
      this.select();
    });

    input.addEventListener('blur', function () {
      let raw = this.value
        .replace(/\s/g, '')
        .replace('₽', '')
        .replace(',', '.')
        .trim();
      let num = parseFloat(raw);
      if (!isNaN(num)) {
        const fieldName = this.dataset.field;
        if (fieldName && window.appData.settings) {
          window.appData.settings[fieldName] = num;
          if (typeof window.saveData === 'function')
            window.saveData(window.appData);
        }
        this.value = formatMoney(num);
      } else {
        const fieldName = this.dataset.field;
        if (fieldName && window.appData.settings) {
          this.value = formatMoney(window.appData.settings[fieldName]);
        } else {
          this.value = '';
        }
      }
    });
  });
}

export function renderAccountsList() {
  const container = document.getElementById('accounts-list');
  if (!container) return;
  container.innerHTML = '';

  const appData = window.appData;
  if (
    !appData ||
    !appData.settings ||
    !appData.settings.accounts ||
    appData.settings.accounts.length === 0
  ) {
    container.innerHTML =
      '<p style="text-align: center; color: var(--text-secondary);">Нет добавленных счетов</p>';
    return;
  }

  const accounts = appData.settings.accounts;
  const transactions = appData.transactions || [];
  const periodStartStr = appData.settings.currentPeriodStart;
  const defaultAccountId = appData.settings.defaultAccountId;
  const pensionAmount = appData.settings.pensionAmount || 0;
  const periodStartDate = periodStartStr ? periodStartStr.split('T')[0] : null;

  // === НОВОЕ: Переменные для раздельного подсчета ===
  let totalBalanceAll = 0;
  let totalBalanceActive = 0;
  let totalBalanceSavings = 0;
  const accountElements = [];

  accounts.forEach((account) => {
    const accountTransactions = transactions.filter((t) => {
      if (periodStartDate) {
        const txDate = t.date.split('T')[0];
        if (txDate < periodStartDate) return false;
      }
      return (
        t.accountId === account.id ||
        t.fromAccountId === account.id ||
        t.toAccountId === account.id
      );
    });

        let balance = accountTransactions.reduce((sum, t) => {
          // ДОБАВЛЕНО: || t.type === 'interest'
          if (t.type === 'income' || t.type === 'interest')
            return sum + t.amount;
          if (t.type === 'expense' || t.type === 'committed')
            return sum - t.amount;
          if (t.type === 'transfer') {
            if (t.fromAccountId === account.id) return sum - t.amount;
            if (t.toAccountId === account.id) return sum + t.amount;
          }
          return sum;
        }, 0);

    // Добавляем начальный баланс этого счёта
    balance += account.initialBalance || 0;

    // Если это счёт по умолчанию, добавляем пенсию
    if (account.id === defaultAccountId && periodStartDate) {
      balance += pensionAmount;
    }

    // === НОВОЕ: Распределяем баланс по категориям ===
    totalBalanceAll += balance;
    if (account.isSavings) {
      totalBalanceSavings += balance;
    } else {
      totalBalanceActive += balance;
    }

    const item = document.createElement('div');
    item.className = 'account-item';
    item.style.borderLeft = 'none';
    item.style.paddingLeft = '16px';

    item.innerHTML = `
      <div class="account-item__info">
        <div class="account-item__name">
          ${account.name} 
          ${account.isSavings ? '<span style="font-size:0.8em; color:var(--text-secondary); margin-left: 8px;">(Накопительный)</span>' : ''}
        </div>
        <div class="account-item__balance">Баланс: ${formatMoney(balance)}</div>
      </div>
      <div class="account-item__actions">
        <button class="btn-edit-account" data-account-id="${account.id}" title="Редактировать">✎</button>
        <button class="btn-delete-account" data-account-id="${account.id}" title="Удалить">🗑️</button>
      </div>
    `;
    accountElements.push(item);
  });

  // === НОВОЕ: Создаём красивый блок сводки ===
  const summaryBlock = document.createElement('div');
  summaryBlock.className = 'account-item';
  summaryBlock.style.backgroundColor = 'var(--bg-secondary, #f0f4f8)';
  summaryBlock.style.borderLeft = '4px solid var(--primary-color, #27ae60)';
  summaryBlock.style.fontWeight = 'bold';
  summaryBlock.style.marginBottom = '16px';
  summaryBlock.style.borderRadius = '8px';
  summaryBlock.style.padding = '16px';

  // Определяем, мобильный ли экран
  const isMobile = window.innerWidth < 400;

  // Короткие подписи для мобильных (с эмодзи!)
  const labelTotal = isMobile
    ? '💰 Общий баланс'
    : '💰 Общий баланс всех счетов';
  const labelActive = isMobile ? '🔹 Активные' : '🔹 Активные счета';
  const labelSavings = isMobile ? '🔸 Накопительные' : '🔸 Накопительные счета';

            summaryBlock.innerHTML = `
    <div class="summary-block">
      <!-- Общий баланс -->
      <div class="summary-row">
        <span class="summary-label">💰 Общий баланс всех счетов</span>
        <span class="summary-value summary-value-main">${formatMoney(totalBalanceAll)}</span>
      </div>
      
      <!-- Разделитель -->
      <div class="summary-divider"></div>
      
      <!-- Активные счета -->
      <div class="summary-row">
        <span class="summary-label">🔹 Активные счета</span>
        <span class="summary-value">${formatMoney(totalBalanceActive)}</span>
      </div>
      
      <!-- Накопительные счета -->
      <div class="summary-row">
        <span class="summary-label">🔸 Накопительные счета</span>
        <span class="summary-value">${formatMoney(totalBalanceSavings)}</span>
      </div>
    </div>
  `;

  // Очищаем контейнер и добавляем сначала сводку, потом все счета
  container.innerHTML = '';
  container.appendChild(summaryBlock);
  accountElements.forEach((el) => container.appendChild(el));
  // ================================================================

  // === ДИАГНОСТИКА ===
  console.log('📊 [renderAccountsList] Отрисовка счетов:');
  console.log('  Общий баланс:', totalBalanceAll.toFixed(2), '₽');
  console.log('  Активные:', totalBalanceActive.toFixed(2), '₽');
  console.log('  Накопительные:', totalBalanceSavings.toFixed(2), '₽');
}





// === Обработчик изменения источника дохода (v2.1, Идея 1) ===
document.addEventListener('DOMContentLoaded', () => {
  const incomeSelect = document.getElementById('select-income-type');
  const customLabel = document.getElementById('custom-income-label');
  const customInput = document.getElementById('input-custom-income');

  if (incomeSelect) {
    incomeSelect.addEventListener('change', (e) => {
      const selectedValue = e.target.value;

      // 1. Показываем/скрываем поле "Свой вариант"
      if (selectedValue === 'custom') {
        customLabel.style.display = 'block';
        customInput.focus();
      } else {
        customLabel.style.display = 'none';
        customInput.value = '';
      }

      // 2. Определяем итоговое имя дохода
      const finalIncomeName =
        selectedValue === 'custom'
          ? customInput.value.trim() || 'Пенсия'
          : selectedValue;

      // 3. === НОВОЕ: Проверяем, регулярный ли это доход ===
      const isRegular = REGULAR_INCOME_TYPES.includes(finalIncomeName);
      const pensionDayLabel = document
        .getElementById('input-pension-day')
        .closest('.settings-label');

      if (pensionDayLabel) {
        if (isRegular) {
          pensionDayLabel.style.display = 'block'; // Показываем поле "День получения"
        } else {
          pensionDayLabel.style.display = 'none'; // Скрываем поле "День получения"
          document.getElementById('input-pension-day').value = ''; // Очищаем его
        }
      }
      // ==========================================

      // 4. Сохраняем в localStorage и window.appData
      const appData = JSON.parse(localStorage.getItem('pensionBudget') || '{}');
      appData.settings = appData.settings || {};
      appData.settings.incomeName = finalIncomeName;

      // Если доход нерегулярный, обнуляем день получения в данных
      if (!isRegular) {
        appData.settings.pensionDay = null;
      }

      localStorage.setItem('pensionBudget', JSON.stringify(appData));

      if (window.appData) {
        window.appData.settings.incomeName = finalIncomeName;
        if (!isRegular) {
          window.appData.settings.pensionDay = null;
        }
      }

      // 5. Мгновенное обновление интерфейса
      const incomeAmountLabel = document.getElementById('income-amount-label');
      if (incomeAmountLabel) {
        incomeAmountLabel.textContent = 'Сумма поступления';
      }

      const currentPeriodLabel = document.getElementById(
        'current-period-label',
      );
      if (currentPeriodLabel) {
        currentPeriodLabel.textContent = `📅 Текущий период: ${finalIncomeName}`;
      }

      if (typeof renderTodayScreen === 'function' && window.appData) {
        renderTodayScreen(
          window.appData.settings,
          window.appData.fixedExpenses,
          window.appData.transactions,
        );
      }

      console.log(
        '✅ Источник дохода:',
        finalIncomeName,
        isRegular ? '(регулярный)' : '(нерегулярный)',
      );
    });
  }

  // Обработчик для поля "Свой вариант" (чтобы обновлялось при вводе текста)
  if (customInput) {
    customInput.addEventListener('input', (e) => {
      const appData = JSON.parse(localStorage.getItem('pensionBudget') || '{}');
      appData.settings = appData.settings || {};
      appData.settings.incomeName = e.target.value.trim() || 'Пенсия';
      localStorage.setItem('pensionBudget', JSON.stringify(appData));

      if (window.appData) {
        window.appData.settings.incomeName = appData.settings.incomeName;
      }

      // Мгновенно обновляем фиолетовый блок и главный экран
      const currentPeriodLabel = document.getElementById(
        'current-period-label',
      );
      if (currentPeriodLabel) {
        currentPeriodLabel.textContent = `📅 Текущий период: ${appData.settings.incomeName}`;
      }

      if (typeof renderTodayScreen === 'function' && window.appData) {
        renderTodayScreen(
          window.appData.settings,
          window.appData.fixedExpenses,
          window.appData.transactions,
        );
      }
    });
  }
});
// ============================================================
