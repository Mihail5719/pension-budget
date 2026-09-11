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
  const { pensionAmount, reserveAmount, pensionDay } = settings;

  const fixedTotal = getTotalFixedExpenses(fixedExpenses);

  // Считаем расходы и доходы отдельно
  const { startDate, endDate } = getCurrentPeriod(pensionDay);

  const periodTransactions = transactions.filter((t) => {
    const tDate = new Date(t.date);
    return tDate >= startDate && tDate <= endDate;
  });

  const spent = periodTransactions
    .filter((t) => t.type !== 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const income = periodTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  // Свободный бюджет = Пенсия + Доходы - Обязательные - НЗ
  const freeBudget = pensionAmount + income - fixedTotal - reserveAmount;

  // Остаток свободного бюджета после уже потраченного
  const remaining = freeBudget - spent;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.max(
    Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) +
      1,
    1,
  );

  const dailyLimit = remaining / daysLeft;

  return {
    dailyLimit,
    remaining,
    spent,
    income,
    freeBudget,
    daysLeft,
    fixedTotal,
    periodStart: formatDateKey(startDate),
    periodEnd: formatDateKey(endDate),
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
  
  return fixedExpenses.filter(expense => {
    // Платёж должен быть на сегодня
    if (expense.day !== today) return false;
    
    // Платёж не должен быть отложен на сегодня
    if (postponed[expense.id] === todayStr) return false;
    
    return true;
  });
}
