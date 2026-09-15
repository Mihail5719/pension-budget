import { getCurrentPeriod, formatDateKey } from './utils.js';

// Сумма всех обязательных платежей
export function getTotalFixedExpenses(fixedExpenses) {
  return fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
}

// Сумма всех трат за текущий пенсионный период
export function getSpentInCurrentPeriod(transactions, pensionDay) {
  const { startDate, endDate } = getCurrentPeriod(pensionDay);

  return transactions
    .filter((t) => {
      const tDate = new Date(t.date);
      return tDate >= startDate && tDate <= endDate;
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

// Главный расчёт: сколько можно потратить сегодня
export function calculateDailyLimit(settings, fixedExpenses, transactions) {
  const {
    pensionAmount,
    reserveAmount,
    pensionDay,
    currentPeriodStart,
    initialBalance = 0, // ← Учитываем начальный остаток
  } = settings;

  const fixedTotal = getTotalFixedExpenses(fixedExpenses);

  // 1. Определяем даты периода
  let startDate, endDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (currentPeriodStart) {
    // ПЕНСИЯ ПОЛУЧЕНА: используем фактическую дату начала периода
    startDate = new Date(currentPeriodStart);
    startDate.setHours(0, 0, 0, 0);

    // Следующая пенсия: +1 месяц, день = pensionDay
    endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(pensionDay);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // ПЕНСИЯ ЕЩЁ НЕ ПОЛУЧЕНА: считаем до следующего pensionDay
    const period = getCurrentPeriod(pensionDay);
    startDate = period.startDate;
    endDate = period.endDate;
  }

  // 2. Фильтруем транзакции за текущий период
  const periodTransactions = transactions.filter((t) => {
    const tDate = new Date(t.date);
    return tDate >= startDate && tDate <= endDate;
  });

  // 3. Считаем доходы и расходы
  const spent = periodTransactions
    .filter((t) => t.type !== 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const income = periodTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  // 4. === БУХГАЛТЕРСКИЙ РАСЧЁТ ===
  // Если пенсия получена — добавляем её к балансу
  // Текущий баланс = Начальный остаток + (Пенсия если отмечена) + Доходы - Расходы
  const currentBalance =
    initialBalance + (currentPeriodStart ? pensionAmount : 0) + income - spent;

  // Свободный бюджет = Текущий баланс - НЗ
  const freeBudget = currentBalance - reserveAmount;

  // Остаток после потраченного (свободные деньги)
  const remaining = freeBudget;

  // 5. Считаем оставшиеся дни
  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(diffDays, 1);

  // 6. Дневной лимит
  const dailyLimit = remaining / daysLeft;

  return {
    dailyLimit,
    remaining,
    spent,
    income,
    freeBudget,
    currentBalance, // ← Добавляем текущий баланс
    daysLeft,
    fixedTotal,
    periodStart: startDate.toISOString().split('T')[0],
    periodEnd: endDate.toISOString().split('T')[0],
  };
}

// Определяем "цветовую зону" для индикатора
export function getIndicatorState(dailyLimit, freeBudget) {
  if (freeBudget <= 0) return 'danger';

  const ratio = dailyLimit / (freeBudget / 30); // сравниваем с "идеальным" дневным бюджетом

  if (dailyLimit < 0) return 'danger';
  if (ratio < 0.5) return 'warn';
  return 'ok';
}

/**
 * Возвращает список обязательных платежей, которые нужно оплатить сегодня
 * Исключает отложенные до завтра
 */
export function getTodayPayments(fixedExpenses) {
  const today = new Date().getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  // Получаем отложенные платежи
  const appData = JSON.parse(localStorage.getItem('pensionBudget') || '{}');
  const postponed = appData.postponedPayments || {};

  return fixedExpenses.filter((expense) => {
    // Платёж должен быть на сегодня
    if (expense.day !== today) return false;

    // Платёж не должен быть отложен на сегодня
    if (postponed[expense.id] === todayStr) return false;

    return true;
  });
}
