import { saveData } from './storage.js';
import { formatMoney, formatDateOnly, getCurrentPeriod } from './utils.js';
import {
  calculateDailyLimit,
  getIndicatorState,
  getTodayPayments,
} from './budget.js';

// ─── Предикаты типов операций (v2.0, коммит 2) ───
const isIncome = (t) => t.type === 'income';
const isExpense = (t) => t.type === 'expense';
const isCommitted = (t) => t.type === 'committed';
// деньги, покинувшие кошелёк: влияют на баланс,
// но в круг жизни попадает только isExpense
const isMoneyOut = (t) => isExpense(t) || isCommitted(t);
// ─── конец блока предикатов ───

// Обновление экрана "Сегодня"
export function renderTodayScreen(settings, fixedExpenses, transactions) {
  const result = calculateDailyLimit(settings, fixedExpenses, transactions);
  const indicatorState = getIndicatorState(
    result.dailyLimit,
    result.freeBudget,
  );
  const todayPayments = getTodayPayments(fixedExpenses);
  renderTodayPayments(todayPayments);

  const remainingEl = document.getElementById('remaining-amount');
  remainingEl.textContent = formatMoney(result.remaining);

  const indicatorEl = document.getElementById('indicator');
  indicatorEl.className = 'today-card__indicator';
  indicatorEl.classList.add(`indicator--${indicatorState}`);

  const dailyLimitEl = document.getElementById('daily-limit');
  dailyLimitEl.textContent = formatMoney(result.dailyLimit);

  document.getElementById('spent-total').textContent = formatMoney(
    result.spent,
  );
  document.getElementById('days-left').textContent = result.daysLeft;

  const headerSubtitle = document.querySelector('.header__subtitle');
  headerSubtitle.textContent = `Пенсия: ${settings.pensionDay} числа`;

  const btnMarkPension = document.getElementById('btn-mark-pension');
  const pensionStatusText = document.getElementById('pension-status-text');
  const pensionDateDisplay = document.getElementById('pension-date-display');

  if (btnMarkPension && pensionStatusText && pensionDateDisplay) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let isMarked = false;
    if (settings.currentPeriodStart) {
      const startDate = new Date(settings.currentPeriodStart);
      if (
        startDate.getMonth() === currentMonth &&
        startDate.getFullYear() === currentYear
      ) {
        isMarked = true;
      }
    }

    if (isMarked) {
      btnMarkPension.style.display = 'none';
      pensionStatusText.style.display = 'flex';
      const d = new Date(settings.currentPeriodStart);
      const dateStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
      pensionDateDisplay.textContent = `✅ Пенсия получена: ${dateStr}`;
    } else {
      btnMarkPension.style.display = 'block';
      pensionStatusText.style.display = 'none';
    }
  }

  const noReserveWarning = document.getElementById('no-reserve-warning');
  if (noReserveWarning) {
    noReserveWarning.style.display =
      settings.reserveAmount <= 0 ? 'flex' : 'none';
  }

  const btnUseReserve = document.getElementById('btn-use-reserve');
  if (btnUseReserve) {
    btnUseReserve.style.display = settings.reserveAmount > 0 ? 'block' : 'none';
  }
}

// Отрисовка списка транзакций с группировкой по дням и раздельными итогами
export function renderTransactionList(transactions, pensionDay) {
  const listEl = document.getElementById('transaction-list');
  listEl.innerHTML = '';

  if (transactions.length === 0) {
    listEl.innerHTML =
      '<p style="text-align: center; color: var(--color-text-secondary); padding: 40px;">Пока нет операций</p>';
    return;
  }

  const sorted = [...transactions].sort(
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
    } else {
      grouped[dateKey].expense += tx.amount;
    }
  });

  Object.keys(grouped).forEach((dateKey) => {
    const group = grouped[dateKey];
    const firstTxDate = group.transactions[0].date;

    let summaryHtml = '';
    if (group.income > 0 && group.expense > 0) {
      summaryHtml =
        '<span style="color: #27ae60; font-weight: 700;">Доход: +' +
        formatMoney(group.income) +
        '</span> &nbsp;|&nbsp; <span style="color: #e74c3c; font-weight: 700;">Расход: -' +
        formatMoney(group.expense) +
        '</span>';
    } else if (group.income > 0) {
      summaryHtml =
        '<span style="color: #27ae60; font-weight: 700;">Доход: +' +
        formatMoney(group.income) +
        '</span>';
    } else {
      summaryHtml =
        '<span style="color: #e74c3c; font-weight: 700;">Расход: -' +
        formatMoney(group.expense) +
        '</span>';
    }

    const groupHeader = document.createElement('div');
    groupHeader.className = 'day-header';
    groupHeader.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      background-color: #f8f9fa;
      border-radius: 8px;
      margin: 16px 0 8px 0;
      font-size: 0.9em;
      font-weight: 600;
      color: #555;
      border-left: 4px solid #3498db;
    `;

    groupHeader.innerHTML = `<span>${formatDateOnly(firstTxDate)}</span><span>${summaryHtml}</span>`;
    listEl.appendChild(groupHeader);

    group.transactions.forEach((transaction) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'transaction';
      itemEl.dataset.id = transaction.id;
      if (transaction.type === 'reserve') {
        itemEl.classList.add('transaction--reserve');
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

      const subLine = transaction.subcategory
        ? `<span class="transaction__subcategory">${transaction.subcategory}</span>`
        : '';
      const noteLine =
        committedFlag && transaction.note
          ? `<span class="transaction__subcategory">${transaction.note}</span>`
          : '';
      const itemLine = transaction.item
        ? `<span class="transaction__item">${transaction.item}</span>`
        : '';

      itemEl.innerHTML = `
        <div class="transaction__info">
            <span class="transaction__category">${displayName}</span>
            ${subLine}${itemLine}${noteLine}
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
  document.getElementById('input-initial-balance').value =
    settings.initialBalance || 0;
  document.getElementById('input-pension').value = settings.pensionAmount || 0;
  document.getElementById('input-pension-day').value = settings.pensionDay;
  document.getElementById('input-reserve').value = settings.reserveAmount || 0;

  const listEl = document.getElementById('fixed-expenses-list');
  listEl.innerHTML = '';

  fixedExpenses.forEach((expense) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'fixed-expense';
    itemEl.dataset.id = expense.id;

    itemEl.innerHTML = `
      <div class="fixed-expense__info">
          <span class="fixed-expense__name">${expense.name}</span>
          <span class="fixed-expense__day">${expense.day ? expense.day + '-го числа' : ''}</span>
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

  const allTransactions = window.appData ? window.appData.transactions : [];
  updateSyncIndicator(allTransactions, settings.lastExportDate);
}

export function updateSyncIndicator(transactions, lastExportDate) {
  const indicatorText = document.getElementById('sync-indicator-text');
  if (!indicatorText) return;

  const count = transactions ? transactions.length : 0;
  let dateStr = 'не экспортировалось';
  if (lastExportDate) {
    const date = new Date(lastExportDate);
    dateStr = date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  indicatorText.textContent = `Записей: ${count} | Обновлено: ${dateStr}`;
}

// Обновление всей страницы
export function renderAll(data) {
  renderTodayScreen(data.settings, data.fixedExpenses, data.transactions);
  renderTransactionList(data.transactions, data.settings.pensionDay);
  // ВЫЗЫВАЕМ НОВУЮ ЕДИНУЮ ФУНКЦИЮ СТАТИСТИКИ
  renderStats(data.settings, data.fixedExpenses, data.transactions);
  renderSettings(data.settings, data.fixedExpenses);
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
  const appData = JSON.parse(localStorage.getItem('pensionBudget') || '{}');
  const payment = appData.fixedExpenses.find((p) => p.id === paymentId);
  if (!payment) return;

  if (
    !confirm(
      `Отметить "${payment.name}" (${formatMoney(payment.amount)}) как оплаченное?`,
    )
  )
    return;

  const today = new Date().toISOString().split('T')[0];
  const transaction = {
    id: Date.now(),
    type: 'committed',
    category: payment.name,
    amount: payment.amount,
    date: today,
    paymentId: paymentId,
    note: 'Автоматически: фиксированный платёж',
  };

  appData.transactions = appData.transactions || [];
  appData.transactions.push(transaction);
  localStorage.setItem('pensionBudget', JSON.stringify(appData));

  renderTodayScreen(
    appData.settings,
    appData.fixedExpenses,
    appData.transactions,
  );
  if (typeof renderTransactionList === 'function')
    renderTransactionList(appData.transactions);
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
  // 1. Точное совпадение с настройками
  if (categoryConfig[name]) return categoryConfig[name];

  const lowerName = name.toLowerCase();

  // 2. Явные переопределения для проблемных категорий (высокая контрастность)
  if (
    lowerName.includes('кредит') ||
    lowerName.includes('долг') ||
    lowerName.includes('займ')
  ) {
    return { emoji: '💳', color: '#E67E22' }; // Яркий насыщенный оранжевый
  }
  if (
    lowerName.includes('разное') ||
    lowerName.includes('другое') ||
    lowerName.includes('прочее')
  ) {
    return { emoji: '📦', color: '#34495E' }; // Глубокий тёмно-синий/графит (идеальный контраст и на белом, и на чёрном)
  }

  // 3. Поиск по частичному совпадению в categoryConfig
  for (const key in categoryConfig) {
    if (lowerName.includes(key.toLowerCase())) return categoryConfig[key];
  }

  // 4. Фолбэк по умолчанию (вместо бледного #95a5a6)
  return { emoji: '📦', color: '#2C3E50' }; // Тёмный асфальтовый цвет
}

// ========================================================================
// 🌟 НОВАЯ ЕДИНАЯ ФУНКЦИЯ СТАТИСТИКИ (Идея 10 + Исправление пенсии + Отладка) 🌟
// ========================================================================
export function renderStats(settings, fixedExpenses, transactions) {
  const topContainer = document.getElementById('stats-top');
  const bottomContainer = document.getElementById('stats-bottom');
  const canvas = document.getElementById('expense-chart');
  const emptyMsg = document.getElementById('stats-empty');

  if (!topContainer || !bottomContainer || !canvas) {
    console.error('❌ Контейнеры статистики не найдены');
    return;
  }

  // 1. Определяем период
  const startDate = settings.currentPeriodStart
    ? new Date(settings.currentPeriodStart)
    : getCurrentPeriod(settings.pensionDay).startDate;
  const { endDate } = getCurrentPeriod(settings.pensionDay);

  // 2. Считаем итоги
  let totalIncome = settings.currentPeriodStart ? settings.pensionAmount : 0;
  let totalNonFixed = 0;
  let totalFixed = 0;

  const nonFixedByCat = {};
  const fixedByCat = {};

  transactions.forEach((t) => {
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

  // 3. Верхняя часть
  let topHtml = `
    <h2 class="stats-title">Статистика</h2>
    <div class="stats-summary-block">
      <div class="stats-row income">
        <span>Доходы:</span>
        <span>+${formatMoney(totalIncome)}</span>
      </div>
      <div class="stats-row expense">
        <span>Расходы:</span>
        <span>-${formatMoney(totalExpenses)}</span>
      </div>
      <div class="stats-divider"></div>
      <div class="stats-row">
        <span>Нефиксированные:</span>
        <span>${formatMoney(totalNonFixed)}</span>
      </div>
      <div class="stats-row">
        <span>Фиксированные:</span>
        <span>${formatMoney(totalFixed)}</span>
      </div>
    </div>
  `;
  topContainer.innerHTML = topHtml;

  // 4. Нижняя часть
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
      sectionHtml += `<div class="breakdown__header">`;
      sectionHtml += `<span>${style.emoji} ${cat}</span>`;
      sectionHtml += `<span>${formatMoney(entry.total)} (${catPercent}%)</span></div>`;

      const subs = Object.keys(entry.subs).sort(
        (a, b) => entry.subs[b] - entry.subs[a],
      );
      subs.forEach((sub) => {
        const sum = entry.subs[sub];
        const subPercent =
          entry.total > 0 ? ((sum / entry.total) * 100).toFixed(1) : '0.0';

        sectionHtml += `<div class="breakdown__row">`;
        sectionHtml += `<div class="breakdown__line">`;
        sectionHtml += `<span>${sub}</span>`;
        sectionHtml += `<span>${formatMoney(sum)} (${subPercent}%)</span></div>`;
        sectionHtml += `<div class="breakdown__bar">`;
        sectionHtml += `<div class="breakdown__bar-fill" style="width:${subPercent}%;background:${style.color}"></div>`;
        sectionHtml += `</div></div>`;
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

  // 5. Диаграмма
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

    if (window.expenseChartInstance) {
      window.expenseChartInstance.destroy();
    }

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
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 15 },
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
// ========================================================================

export function renderPensionPeriodInfo(settings) {
  const periodInfoEl = document.getElementById('period-info');
  if (!periodInfoEl) return;

  const currentAppData = window.appData || { settings: settings };
  const appSettings = currentAppData.settings;

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

    const formatDate = (date) => {
      return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
    };

    periodInfoEl.innerHTML = `
      <div class="period-info__row">
        <span class="period-info__label">Начало периода:</span>
        <span class="period-info__value">${formatDate(startDate)}</span>
      </div>
      <div class="period-info__row">
        <span class="period-info__label">Следующая пенсия:</span>
        <span class="period-info__value">${formatDate(nextPensionDate)}</span>
      </div>
      <div class="period-info__row">
        <span class="period-info__label">Осталось дней:</span>
        <span class="period-info__value">${daysLeft}</span>
      </div>
      <button class="btn-new-period" id="btn-new-period">
        🔄 Изменить или сбросить период
      </button>
    `;

    const btnNewPeriod = document.getElementById('btn-new-period');
    if (btnNewPeriod) {
      const freshBtn = btnNewPeriod.cloneNode(true);
      btnNewPeriod.parentNode.replaceChild(freshBtn, btnNewPeriod);

      freshBtn.addEventListener('click', () => {
        const currentDate =
          window.appData && window.appData.settings.currentPeriodStart
            ? window.appData.settings.currentPeriodStart.split('T')[0]
            : '';

        const userChoice = prompt(
          'Введите новую дату начала периода (в формате ГГГГ-ММ-ДД, например 2026-09-23)\n\nИли оставьте поле ПУСТЫМ и нажмите ОК, чтобы ПОЛНОСТЬЮ СБРОСИТЬ отметку.',
          currentDate,
        );

        if (userChoice === null) return;

        if (userChoice.trim() === '') {
          if (
            confirm(
              'Сбросить отметку о получении пенсии? Кнопка на главном экране появится снова.',
            )
          ) {
            if (window.appData) {
              delete window.appData.settings.currentPeriodStart;
              saveData(window.appData);
              renderPensionPeriodInfo(window.appData.settings);
              renderTodayScreen(
                window.appData.settings,
                window.appData.fixedExpenses,
                window.appData.transactions,
              );
              if (window.expenseChartInstance)
                renderStats(
                  window.appData.settings,
                  window.appData.fixedExpenses,
                  window.appData.transactions,
                );
            }
          }
        } else {
          const newDate = new Date(userChoice);
          if (!isNaN(newDate.getTime())) {
            if (window.appData) {
              const oldStart = window.appData.settings.currentPeriodStart
                ? new Date(window.appData.settings.currentPeriodStart)
                : null;

              if (oldStart && newDate.getTime() > oldStart.getTime()) {
                const oldBalance = calculateDailyLimit(
                  window.appData.settings,
                  window.appData.fixedExpenses,
                  window.appData.transactions,
                );
                const carryOver =
                  oldBalance.currentBalance - oldBalance.fixedTotal;

                const userAgrees = confirm(
                  `Вы переносите период вперёд.\n\nНераспределённый остаток: ${carryOver.toFixed(2)} ₽\nОн будет перенесён как начальный баланс нового периода.\n\nПродолжить? (Нажмите "Отмена", чтобы изменить дату без переноса остатка)`,
                );

                if (!userAgrees) return;

                window.appData.settings.initialBalance =
                  Math.round(carryOver * 100) / 100;
                const initialInput = document.getElementById(
                  'input-initial-balance',
                );
                if (initialInput) initialInput.value = carryOver.toFixed(2);
              }

              window.appData.settings.currentPeriodStart =
                newDate.toISOString();
              saveData(window.appData);
              renderPensionPeriodInfo(window.appData.settings);
              renderTodayScreen(
                window.appData.settings,
                window.appData.fixedExpenses,
                window.appData.transactions,
              );
              renderStats(
                window.appData.settings,
                window.appData.fixedExpenses,
                window.appData.transactions,
              );
              alert('✅ Период успешно обновлён!');
            }
          } else {
            alert(
              '❌ Неверный формат даты. Попробуйте снова (пример: 2026-09-23).',
            );
          }
        }
      });
    }
  } else {
    periodInfoEl.innerHTML =
      '<em>Период ещё не начат. Отметьте поступление пенсии на главном экране.</em>';
  }
}

// Инициализация красивых денежных полей (Format-on-blur)
function initMoneyFields() {
  const moneyInputs = document.querySelectorAll('.money-field');

  moneyInputs.forEach((input) => {
    const rawValue = parseFloat(input.value);
    if (!isNaN(rawValue)) {
      input.value = formatMoney(rawValue);
    }

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
          if (typeof window.saveData === 'function') {
            window.saveData(window.appData);
          }
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
