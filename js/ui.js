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

  // Обновляем ГЛАВНОЕ число - остаток до пенсии
  const remainingEl = document.getElementById('remaining-amount');
  remainingEl.textContent = formatMoney(result.remaining);

  // Обновляем индикатор (цвет)
  const indicatorEl = document.getElementById('indicator');
  indicatorEl.className = 'today-card__indicator';
  indicatorEl.classList.add(`indicator--${indicatorState}`);

  // Обновляем ВТОРОЕ число - безопасный дневной лимит
  const dailyLimitEl = document.getElementById('daily-limit');
  dailyLimitEl.textContent = formatMoney(result.dailyLimit);

  // Обновляем статистику
  document.getElementById('spent-total').textContent = formatMoney(
    result.spent,
  );
  document.getElementById('days-left').textContent = result.daysLeft;

  // Обновляем подзаголовок в шапке
  const headerSubtitle = document.querySelector('.header__subtitle');
  headerSubtitle.textContent = `Пенсия: ${settings.pensionDay} числа`;

  // === НОВОЕ: Логика кнопки "Пенсия пришла" ===
  const btnMarkPension = document.getElementById('btn-mark-pension');
  const pensionStatusText = document.getElementById('pension-status-text');
  const pensionDateDisplay = document.getElementById('pension-date-display');

  if (btnMarkPension && pensionStatusText && pensionDateDisplay) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Проверяем, отмечена ли пенсия в текущем месяце
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
      // Пенсия уже отмечена: скрываем кнопку, показываем статус
      btnMarkPension.style.display = 'none';
      pensionStatusText.style.display = 'flex'; // Используем flex для выравнивания текста и кнопки

      // Форматируем дату (ДД.ММ.ГГГГ)
      const d = new Date(settings.currentPeriodStart);
      const dateStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

      // Вставляем текст в span, а кнопка "Изменить" уже есть в HTML рядом с ним
      pensionDateDisplay.textContent = `✅ Пенсия получена: ${dateStr}`;
    } else {
      // Пенсия еще не отмечена: показываем кнопку, скрываем статус
      btnMarkPension.style.display = 'block';
      pensionStatusText.style.display = 'none';
    }
  }
  // === Проверка: есть ли НЗ ===
  const noReserveWarning = document.getElementById('no-reserve-warning');
  if (noReserveWarning) {
    if (settings.reserveAmount <= 0) {
      noReserveWarning.style.display = 'flex';
    } else {
      noReserveWarning.style.display = 'none';
    }
  }
  // ==========================================
  // === Логика кнопки "Использовать НЗ" ===
  const btnUseReserve = document.getElementById('btn-use-reserve');
  if (btnUseReserve) {
    btnUseReserve.style.display = settings.reserveAmount > 0 ? 'block' : 'none';
  }
}

// Отрисовка списка транзакций с группировкой по дням и итогами
export function renderTransactionList(transactions, pensionDay) {
  const listEl = document.getElementById('transaction-list');
  listEl.innerHTML = '';

  if (transactions.length === 0) {
    listEl.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 40px;">Пока нет операций</p>';
    return;
  }

  // 1. Сортируем по дате (новые сверху)
  const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  // 2. Группируем транзакции по датам
  const grouped = {};
  sorted.forEach(tx => {
    // Берем только дату (YYYY-MM-DD), отбрасывая время, если оно есть
    const dateKey = tx.date.split('T')[0]; 
    if (!grouped[dateKey]) {
      grouped[dateKey] = { transactions: [], total: 0 };
    }
    grouped[dateKey].transactions.push(tx);
    
    // Считаем итог за день (алгебраическая сумма: доходы +, расходы -)
    const sign = isIncome(tx) ? 1 : -1;
    grouped[dateKey].total += tx.amount * sign;
  });

  // 3. Отрисовываем группы
  Object.keys(grouped).forEach(dateKey => {
    const group = grouped[dateKey];
    const firstTxDate = group.transactions[0].date;
    
    // Формируем текст итога
    const totalSign = group.total >= 0 ? '+' : '-';
    const totalColor = group.total >= 0 ? '#27ae60' : '#e74c3c'; // Зеленый для прихода, красный для расхода
    
    // Создаем заголовок группы (шапка дня)
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
      font-size: 0.95em;
      font-weight: 600;
      color: #555;
      border-left: 4px solid ${totalColor};
    `;
    groupHeader.innerHTML = `
      <span>${formatDateOnly(firstTxDate)}</span>
      <span style="color: ${totalColor};">Итого: ${totalSign}${formatMoney(Math.abs(group.total))}</span>
    `;
    listEl.appendChild(groupHeader);

    // Отрисовываем транзакции внутри этой группы
    group.transactions.forEach((transaction) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'transaction';
      itemEl.dataset.id = transaction.id;
      if (transaction.type === 'reserve') {
        itemEl.classList.add('transaction--reserve');
      }

      const incomeFlag = isIncome(transaction);
      const amountClass = incomeFlag ? 'transaction__amount--income' : 'transaction__amount';
      const amountPrefix = incomeFlag ? '+' : '-';
      const deleteAction = incomeFlag ? 'delete-income' : 'delete-transaction';

      const catStyle = categoryConfig[transaction.category] || { emoji: '📦', color: '#95a5a6' };
      const committedFlag = isCommitted(transaction);
      const emoji = committedFlag ? '📋' : catStyle.emoji;
      const displayName = `${emoji} ${transaction.category}`;
      
      const subLine = transaction.subcategory ? `<span class="transaction__subcategory">${transaction.subcategory}</span>` : '';
      const noteLine = committedFlag && transaction.note ? `<span class="transaction__subcategory">${transaction.note}</span>` : '';
      const itemLine = transaction.item ? `<span class="transaction__item">${transaction.item}</span>` : '';

      // Обратите внимание: дата убрана из карточки, так как теперь она есть в шапке дня!
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
  // 1. Заполняем поля ввода "сырыми" числами 
  // (initMoneyFields сам превратит их в красивый формат)
  document.getElementById('input-initial-balance').value = settings.initialBalance || 0;
  document.getElementById('input-pension').value = settings.pensionAmount || 0;
  document.getElementById('input-pension-day').value = settings.pensionDay;
  document.getElementById('input-reserve').value = settings.reserveAmount || 0;

  // 2. Отрисовываем список обязательных платежей
  const listEl = document.getElementById('fixed-expenses-list');
  listEl.innerHTML = '';

  fixedExpenses.forEach((expense) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'fixed-expense';
    itemEl.dataset.id = expense.id;

    itemEl.innerHTML = `
      <div class="fixed-expense__info">
          <span class="fixed-expense__name">${expense.name}</span>
          <span class="fixed-expense__day">${expense.day ? `${expense.day}-го числа` : ''}</span>
      </div>
      <span class="fixed-expense__amount">${formatMoney(expense.amount)}</span>
      <div class="fixed-expense__actions">
          <button class="btn-edit" data-action="edit-payment" data-id="${expense.id}" title="Редактировать">✎</button>
          <button class="btn-delete-payment" data-action="delete-payment" data-id="${expense.id}" title="Удалить">✕</button>
      </div>
    `;
    listEl.appendChild(itemEl);
  });

  // 3. 🚀 ЗАПУСКАЕМ МАГИЮ ФОРМАТИРОВАНИЯ ПОСЛЕ ОТРИСОВКИ
  initMoneyFields();

  // 4. Отображаем информацию о текущем периоде
  renderPensionPeriodInfo(settings);

  // 5. ✅ Обновляем индикатор синхронизации
  // Передаем все транзакции и дату последнего экспорта из настроек
  const allTransactions = window.appData ? window.appData.transactions : [];
  updateSyncIndicator(allTransactions, settings.lastExportDate);
} // <-- ЗАКРЫВАЮЩАЯ СКОБКА ТЕПЕРЬ ЗДЕСЬ, В САМОМ КОНЦЕ!

// Обновление индикатора синхронизации
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
      minute: '2-digit' 
    });
  }

  indicatorText.textContent = `Записей: ${count} | Обновлено: ${dateStr}`;
}

// Обновление всей страницы
export function renderAll(data) {
  renderTodayScreen(data.settings, data.fixedExpenses, data.transactions);
  renderTransactionList(data.transactions, data.settings.pensionDay);
  renderStatsChart(data.settings, data.transactions);
  renderSettings(data.settings, data.fixedExpenses);
}

/**
 * Отображает блок "Сегодня к оплате" на главном экране
 */
function renderTodayPayments(payments) {
  const container = document.getElementById('today-payments-container');
  if (!container) return;

  // Очищаем контейнер
  container.innerHTML = '';

  // Фильтруем платежи, которые ещё не оплачены сегодня
  const unpaidPayments = payments.filter((p) => !isPaymentPaidToday(p.id));

  if (unpaidPayments.length === 0) {
    container.innerHTML =
      '<p class="today-payments__empty">Сегодня платежей нет 🎉</p>';
    return;
  }

  // Заголовок блока
  const title = document.createElement('h3');
  title.className = 'today-payments__title';
  title.textContent = 'Сегодня к оплате';
  container.appendChild(title);

  // Список платежей
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

  // Назначаем обработчики кликов
  container.querySelectorAll('[data-action="mark-paid"]').forEach((btn) => {
    btn.addEventListener('click', handleMarkPaid);
  });
  container.querySelectorAll('[data-action="postpone"]').forEach((btn) => {
    btn.addEventListener('click', handlePostpone);
  });
}

/**
 * Проверяет, был ли платёж уже оплачен сегодня
 */
function isPaymentPaidToday(paymentId) {
  const today = new Date().toISOString().split('T')[0];
  const appData = JSON.parse(localStorage.getItem('pensionBudget') || '{}');
  const transactions = appData.transactions || [];

  return transactions.some(
    (t) => t.date === today && t.paymentId === paymentId,
  );
}

/**
 * Обработчик кнопки "Оплачено"
 */
function handleMarkPaid(event) {
  const paymentId = parseInt(event.currentTarget.dataset.id);
  const appData = JSON.parse(localStorage.getItem('pensionBudget') || '{}');
  const payment = appData.fixedExpenses.find((p) => p.id === paymentId);

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

  // Обновляем все экраны
  renderTodayScreen(
    appData.settings,
    appData.fixedExpenses,
    appData.transactions,
  );

  // Обновляем экран Истории (если функция существует)
  if (typeof renderTransactionList === 'function') {
    renderTransactionList(appData.transactions);
  }
  if (typeof renderHistoryScreen === 'function') {
    renderHistoryScreen(appData.transactions);
  }
}

/**
 * Обработчик кнопки "Отложить"
 */
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
  // Расходы (чередование: тёмный / светлый)
  Продукты: { emoji: '🛒', color: '#c0392b' }, // 🔴 ТЁМНО-красный
  Аптека: { emoji: '💊', color: '#2ecc71' }, // 🟢 СВЕТЛО-зелёный
  Транспорт: { emoji: '🚗', color: '#e67e22' }, // 🟠 ТЁМНО-оранжевый
  ЖКХ: { emoji: '🏠', color: '#d2b4de' }, // 🟣 СВЕТЛО-фиолетовый (лавандовый)
  Связь: { emoji: '📱', color: '#2980b9' }, // 🔵 ТЁМНО-синий
  Здоровье: { emoji: '🩺', color: '#a8e6cf' }, // 🟩 СВЕТЛО-мятный
  Подарки: { emoji: '🎁', color: '#f1c40f' }, // 🟡 СВЕТЛО-жёлтый
  'Для дома': { emoji: '🏡', color: '#2c3e50' }, // ⚫ ТЁМНО-графитовый
  Одежда: { emoji: '👕', color: '#fd79a8' }, //  СВЕТЛО-розовый
  Другое: { emoji: '📦', color: '#b2bec3' }, // ⚪ СВЕТЛО-серый
  Учёба: { emoji: '📚', color: '#9b59b6' },
  Накопления: { emoji: '🐷', color: '#1abc9c' },

  // Доходы
  'Возврат долга': { emoji: '💰', color: '#27ae60' },
  Подработка: { emoji: '💼', color: '#16a085' },
  'Помощь от детей/родственников': { emoji: '👪', color: '#8e44ad' },
};

function getCategoryStyle(name) {
  // Сначала ищем точное совпадение
  if (categoryConfig[name]) return categoryConfig[name];

  // Если не нашли — ищем по ключевому слову (для "Транспорт", "Аптека" и т.д.)
  const lowerName = name.toLowerCase();
  for (const key in categoryConfig) {
    if (lowerName.includes(key.toLowerCase())) {
      return categoryConfig[key];
    }
  }

  // Если вообще ничего не нашли — стандартная иконка
  return { emoji: '📦', color: '#95a5a6' };
}

/**
 * Рисует круговую диаграмму расходов
 */
export function renderStatsChart(settings, transactions) {
  renderSubcategoryBreakdown(settings, transactions);
  const canvas = document.getElementById('expense-chart');
  if (!canvas) {
    console.error('❌ Canvas не найден!');
    return;
  }
  const emptyMsg = document.getElementById('stats-empty');
  if (emptyMsg) emptyMsg.hidden = true;
  canvas.style.display = '';

  // Определяем цвет текста легенды в зависимости от темы
  const isDarkTheme = document.body.classList.contains('dark-theme');
  const legendTextColor = isDarkTheme ? '#ffffff' : '#2c3e50';

  // 1. Получаем транзакции только за текущий период (от пенсии до пенсии)
  const startDate = new Date(settings.currentPeriodStart);
  const { endDate } = getCurrentPeriod(settings.pensionDay);

  const periodExpenses = transactions.filter((t) => {
    const tDate = new Date(t.date);
    // Берем только расходы (не доходы) и только за текущий период
    return isExpense(t) && tDate >= startDate && tDate <= endDate;
  });

  // 2. Группируем суммы по категориям
  const categoryTotals = {};
  periodExpenses.forEach((t) => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  // 3. Подготавливаем данные для Chart.js
  const labels = [];
  const data = [];
  const backgroundColors = [];

  Object.keys(categoryTotals).forEach((cat) => {
    const style = getCategoryStyle(cat);
    labels.push(cat);
    data.push(categoryTotals[cat]);
    backgroundColors.push(style.color);
  });

  // 4. Если расходов нет, очищаем холст и выходим
  if (data.length === 0) {
    if (window.expenseChartInstance) {
      window.expenseChartInstance.destroy();
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const emptyMsg = document.getElementById('stats-empty');
    if (emptyMsg) emptyMsg.hidden = false;
    canvas.style.display = 'none';
    return;
  }

  // 5. Уничтожаем старую диаграмму, если она была
  if (window.expenseChartInstance) {
    window.expenseChartInstance.destroy();
  }

  // === НОВОЕ: Определяем мобильное устройство и топ-3 категории ===
  const isMobile = window.innerWidth < 768;

  // Функция для получения топ-N категорий по сумме расходов
  function getTopCategories(topN) {
    const sorted = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([category, sum]) => ({ category, sum }));
    return sorted.slice(0, topN).map((item) => item.category);
  }

  const topCategories = isMobile ? getTopCategories(3) : null;
  // ====================================================================

  // 6. Рисуем новую диаграмму
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
          labels: {
            color: legendTextColor,
            font: {
              size: isMobile ? 12 : 14,
              family: "'Segoe UI', sans-serif",
            },
            padding: 20,
            usePointStyle: true,
            // === НОВОЕ: Кастомизация легенды с эмодзи и фильтрацией ===
            generateLabels: function (chart) {
              const data = chart.data;
              const allLabels = data.labels;

              // На мобильном показываем только топ-3
              const visibleLabels =
                isMobile && topCategories
                  ? allLabels.filter((label) => topCategories.includes(label))
                  : allLabels;

              return visibleLabels.map((label) => {
                const catStyle = getCategoryStyle(label);
                const originalIndex = allLabels.indexOf(label);
                return {
                  text: `${catStyle.emoji} ${label}`, // Добавляем эмодзи!
                  fillStyle: catStyle.color,
                  strokeStyle: catStyle.color,
                  lineWidth: 0,
                  hidden: false,
                  index: originalIndex,
                  fontColor: legendTextColor,
                };
              });
            },
            // ====================================================================
          },
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: {
            size: window.innerWidth < 400 ? 13 : 16,
          },
          bodyFont: {
            size: window.innerWidth < 400 ? 11 : 14,
          },
          padding: window.innerWidth < 400 ? 8 : 12,
          callbacks: {
            label: function (context) {
              const categoryName = context.label;
              const style = getCategoryStyle(categoryName);
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);

              // Сокращаем длинные названия для мобильных
              let shortName = categoryName;
              if (window.innerWidth < 400) {
                const shortNames = {
                  'Помощь от детей/родственников': 'Помощь',
                };
                shortName = shortNames[categoryName] || categoryName;
              }

              return `${style.emoji} ${shortName}: ${formatMoney(value)} (${percentage}%)`;
            },
          },
        },
      },
    },
  });
}

/**
 * Отображает информацию о текущем периоде пенсии в настройках
 */
export function renderPensionPeriodInfo(settings) {
  const periodInfoEl = document.getElementById('period-info');
  if (!periodInfoEl) return;

  // Явно используем глобальный window.appData, который мы создали в app.js
  const currentAppData = window.appData || { settings: settings };
  const appSettings = currentAppData.settings;

  if (appSettings.currentPeriodStart) {
    const startDate = new Date(appSettings.currentPeriodStart);
    const pensionDay = appSettings.pensionDay;

    // Рассчитываем дату следующей пенсии
    const nextPensionDate = new Date(startDate);
    nextPensionDate.setMonth(nextPensionDate.getMonth() + 1);
    nextPensionDate.setDate(pensionDay);

    // Считаем дни до следующей пенсии
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = nextPensionDate - today;
    const daysLeft = Math.max(Math.floor(diffTime / (1000 * 60 * 60 * 24)), 0);

    // Форматируем даты
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

    // Добавляем обработчик кнопки
    const btnNewPeriod = document.getElementById('btn-new-period');
    if (btnNewPeriod) {
      // Клонируем, чтобы удалить старые обработчики при перерисовке
      const freshBtn = btnNewPeriod.cloneNode(true);
      btnNewPeriod.parentNode.replaceChild(freshBtn, btnNewPeriod);

      freshBtn.addEventListener('click', () => {
        // Явно читаем из window.appData
        const currentDate =
          window.appData && window.appData.settings.currentPeriodStart
            ? window.appData.settings.currentPeriodStart.split('T')[0]
            : '';

        const userChoice = prompt(
          'Введите новую дату начала периода (в формате ГГГГ-ММ-ДД, например 2026-09-23)\n\nИли оставьте поле ПУСТЫМ и нажмите ОК, чтобы ПОЛНОСТЬЮ СБРОСИТЬ отметку.',
          currentDate,
        );

        if (userChoice === null) {
          return; // Пользователь нажал "Отмена"
        }

        if (userChoice.trim() === '') {
          // Сброс отметки
          if (
            confirm(
              'Сбросить отметку о получении пенсии? Кнопка на главном экране появится снова.',
            )
          ) {
            if (window.appData) {
              // 1. Удаляем поле
              delete window.appData.settings.currentPeriodStart;

              // 2. Сохраняем (функция saveData теперь импортирована)
              saveData(window.appData);

              // 3. Перерисовываем всё
              renderPensionPeriodInfo(window.appData.settings);
              renderTodayScreen(
                window.appData.settings,
                window.appData.fixedExpenses,
                window.appData.transactions,
              );

              if (window.expenseChartInstance) {
                renderStatsChart(
                  window.appData.settings,
                  window.appData.transactions,
                );
              }
            }
          }
        } else {
          const newDate = new Date(userChoice);
          if (!isNaN(newDate.getTime())) {
            if (window.appData) {
              // === ЯВНЫЙ ПЕРЕНОС ОСТАТКА (Наблюдение 14) ===
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
                  `Вы переносите период вперёд.\n\n` +
                    `Нераспределённый остаток: ${carryOver.toFixed(2)} ₽\n` +
                    `Он будет перенесён как начальный баланс нового периода.\n\n` +
                    `Продолжить? (Нажмите "Отмена", чтобы изменить дату без переноса остатка)`,
                );

                if (!userAgrees) return;

                window.appData.settings.initialBalance =
                  Math.round(carryOver * 100) / 100;
                console.log(
                  ' Перенос остатка:',
                  window.appData.settings.initialBalance.toFixed(2),
                  '₽',
                );
                const initialInput = document.getElementById(
                  'input-initial-balance',
                );
                if (initialInput) initialInput.value = carryOver.toFixed(2);
              }
              // ==========================================

              window.appData.settings.currentPeriodStart =
                newDate.toISOString();
              saveData(window.appData);
              renderPensionPeriodInfo(window.appData.settings);
              renderTodayScreen(
                window.appData.settings,
                window.appData.fixedExpenses,
                window.appData.transactions,
              );
              if (window.expenseChartInstance)
                renderStatsChart(
                  window.appData.settings,
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

/**
 * Детализация расходов по подкатегориям (список с полосками)
 */
export function renderSubcategoryBreakdown(settings, transactions) {
  const container = document.getElementById('subcategory-breakdown');
  if (!container) return;
  const startDate = new Date(settings.currentPeriodStart);
  const { endDate } = getCurrentPeriod(settings.pensionDay);
  const periodExpenses = transactions.filter((t) => {
    const tDate = new Date(t.date);
    return isExpense(t) && tDate >= startDate && tDate <= endDate;
  });
  if (periodExpenses.length === 0) {
    container.innerHTML = '';
    return;
  }
  const byCat = {};
  periodExpenses.forEach((t) => {
    const sub = t.subcategory || 'Без подкатегории';
    if (!byCat[t.category]) byCat[t.category] = { total: 0, subs: {} };
    byCat[t.category].total += t.amount;
    byCat[t.category].subs[sub] = (byCat[t.category].subs[sub] || 0) + t.amount;
  });
  const cats = Object.keys(byCat).sort(
    (a, b) => byCat[b].total - byCat[a].total,
  );
  let html = '<h3 class="breakdown__title">По подкатегориям</h3>';
  cats.forEach((cat) => {
    const style = getCategoryStyle(cat);
    const entry = byCat[cat];
    html += '<div class="breakdown__card">';
    html += '<div class="breakdown__header">';
    html += `<span>${style.emoji} ${cat}</span>`;
    html += `<span>${formatMoney(entry.total)}</span></div>`;
    const subs = Object.keys(entry.subs).sort(
      (a, b) => entry.subs[b] - entry.subs[a],
    );
    subs.forEach((sub) => {
      const sum = entry.subs[sub];
      const percent = Math.round((sum / entry.total) * 100);
      html += '<div class="breakdown__row"><div class="breakdown__line">';
      html += `<span>${sub}</span>`;
      html += `<span>${formatMoney(sum)} (${percent}%)</span></div>`;
      html += '<div class="breakdown__bar">';
      html += `<div class="breakdown__bar-fill" style="width:${percent}%;background:${style.color}"></div>`;
      html += '</div></div>';
    });
    html += '</div>';
  });
  container.innerHTML = html;
}

// Инициализация красивых денежных полей (Format-on-blur)
function initMoneyFields() {
  const moneyInputs = document.querySelectorAll('.money-field');

  moneyInputs.forEach(input => {
    // 1. При загрузке страницы сразу делаем красиво
    const rawValue = parseFloat(input.value);
    if (!isNaN(rawValue)) {
      input.value = formatMoney(rawValue); // ← formatMoney сам добавляет ₽
    }

    // 2. Когда поле получает фокус (вы кликнули в него)
    input.addEventListener('focus', function() {
      // Превращаем "34 714,73 ₽" обратно в "34714.73" для удобного редактирования
      let raw = this.value.replace(/\s/g, '').replace('₽', '').replace(',', '.').trim();
      this.value = raw;
      this.select(); // Сразу выделяем весь текст
    });

    // 3. Когда поле теряет фокус (вы кликнули в другое место)
    input.addEventListener('blur', function() {
      let raw = this.value.replace(/\s/g, '').replace('₽', '').replace(',', '.').trim();
      let num = parseFloat(raw);

      if (!isNaN(num)) {
        // Находим имя поля (initialBalance, pensionAmount, reserveAmount)
        const fieldName = this.dataset.field;

        // Сохраняем в настройки
        if (fieldName && window.appData.settings) {
          window.appData.settings[fieldName] = num;
          // Сохраняем в localStorage (функция saveData должна быть доступна глобально или импортирована)
          if (typeof window.saveData === 'function') {
            window.saveData(window.appData);
          }
        }

        // Форматируем красиво
        this.value = formatMoney(num); // ← formatMoney сам добавляет ₽
      } else {
        // Если пользователь ввёл бред, возвращаем старое значение
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