import { formatMoney, formatDateOnly } from './utils.js';
import {
  calculateDailyLimit,
  getIndicatorState,
  getTodayPayments,
} from './budget.js';

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
}

// Отрисовка списка транзакций
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

  sorted.forEach((transaction) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'transaction';
    itemEl.dataset.id = transaction.id;

    // Определяем тип операции
    const isIncome = transaction.type === 'income';
    const amountClass = isIncome
      ? 'transaction__amount--income'
      : 'transaction__amount';
    const amountPrefix = isIncome ? '+' : '-';
    const deleteAction = isIncome ? 'delete-income' : 'delete-transaction';

    itemEl.innerHTML = `
    <div class="transaction__info">
        <span class="transaction__category">${transaction.category}</span>
        <span class="transaction__date">${formatDateOnly(transaction.date)}</span>
    </div>
    <span class="transaction__amount ${amountClass}">${amountPrefix}${formatMoney(transaction.amount)}</span>
    <div class="transaction__actions">
        <button class="btn-edit" data-action="edit-transaction" data-id="${transaction.id}" title="Редактировать">✎</button>
        <button class="btn-delete" data-action="${deleteAction}" data-id="${transaction.id}" title="Удалить">✕</button>
    </div>
`;

    listEl.appendChild(itemEl);
  });
}

// Отрисовка настроек
export function renderSettings(settings, fixedExpenses) {
  // Заполняем поля ввода
  document.getElementById('input-pension').value =
    settings.pensionAmount.toFixed(2);
  document.getElementById('input-pension-day').value = settings.pensionDay;
  document.getElementById('input-reserve').value =
    settings.reserveAmount.toFixed(2);

  // Отрисовываем список обязательных платежей
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
    <button class="btn-delete-payment" data-action="delete-payment" data-id="${expense.id}" title="Удалить">✕</button>
`;
    listEl.appendChild(itemEl);
  });
}

// Обновление всей страницы
export function renderAll(data) {
  renderTodayScreen(data.settings, data.fixedExpenses, data.transactions);
  renderTransactionList(data.transactions, data.settings.pensionDay);
  renderSettings(data.settings, data.fixedExpenses);
}

/**
 * Отображает блок "Сегодня к оплате" на главном экране
 */
function renderTodayPayments(payments) {
  const container = document.getElementById('today-payments-container');
  if (!container) return; // Если контейнера нет, ничего не делаем
  
  // Очищаем контейнер перед отрисовкой
  container.innerHTML = '';
  
  if (payments.length === 0) {
    container.innerHTML = '<p class="today-payments__empty">Сегодня платежей нет 🎉</p>';
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
  
  payments.forEach(payment => {
    const item = document.createElement('div');
    item.className = 'today-payment-item';
    item.innerHTML = `
      <span class="today-payment-item__name">${payment.name}</span>
      <span class="today-payment-item__amount">${formatMoney(payment.amount)}</span>
    `;
    list.appendChild(item);
  });
  
  container.appendChild(list);
}
