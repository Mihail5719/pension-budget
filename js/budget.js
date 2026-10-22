import { getCurrentPeriod, formatDateKey } from './utils.js';

// ─── Предикаты типов операций (v2.0, коммит 2) ───
const isIncome = (t) => t.type === 'income';
const isExpense = (t) => t.type === 'expense';
const isCommitted = (t) => t.type === 'committed';
// деньги, покинувшие кошелёк: влияют на баланс,
// но в круг жизни попадает только isExpense
const isMoneyOut = (t) => isExpense(t) || isCommitted(t);
// ─── конец блока предикатов ───

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
  } = settings;

  // 1. Определяем даты периода
  let startDate, endDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (currentPeriodStart) {
    startDate = new Date(currentPeriodStart);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(pensionDay);
    endDate.setHours(23, 59, 59, 999);
  } else {
    const period = getCurrentPeriod(pensionDay);
    startDate = period.startDate;
    endDate = period.endDate;
  }

  // 2. Фильтруем транзакции за текущий период
  const periodTransactions = transactions.filter((t) => {
    const tDate = new Date(t.date);
    return tDate >= startDate && tDate <= endDate;
  });

  // 3. === ИСПРАВЛЕНИЕ: Умный расчет фиксированных платежей ===
  // Вычитаем только те платежи, которые должны быть оплачены ДО следующей пенсии
  const paidIds = new Set(
    periodTransactions.filter((t) => t.paymentId).map((t) => t.paymentId),
  );

  const nextPensionDate = endDate; // Дата следующей пенсии

  const fixedTotal = fixedExpenses
    .filter((p) => {
      // Если платёж уже учтён в транзакциях этого периода, игнорируем его
      if (paidIds.has(p.id)) return false;

      // Находим ближайшую дату этого платежа относительно сегодня
      let nextPaymentDate = new Date(today.getFullYear(), today.getMonth(), p.day);
      if (nextPaymentDate < today) {
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      }

      // === КЛЮЧЕВАЯ ЛОГИКА ===
      // Резервируем деньги только если платеж должен пройти ДО следующей пенсии.
      // Если платеж после пенсии (например, кредит 24-го, а пенсия 23-го), 
      // он будет покрыт из новой пенсии, и вычитать его из текущего остатка не нужно!
      return nextPaymentDate < nextPensionDate;
    })
    .reduce((sum, p) => sum + p.amount, 0);
  // ============================================================

  // 4. Считаем доходы и расходы (общие)
  const spent = periodTransactions
    .filter((t) => t.type === 'expense' || t.type === 'committed')
    .reduce((sum, t) => sum + t.amount, 0);

  const income = periodTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  // Деньги, покинувшие кошелёк: расходы + переводы ТОЛЬКО на накопительные счета
  const moneyOut = periodTransactions
    .filter((t) => {
      if (t.type === 'expense' || t.type === 'committed') return true;
      if (t.type === 'transfer') {
        const toAccount = settings.accounts.find((a) => a.id === t.toAccountId);
        return toAccount && toAccount.isSavings;
      }
      return false;
    })
    .reduce((sum, t) => sum + t.amount, 0);

  // 5. === Надежный расчёт текущего баланса ===
  const totalInitialBalance = settings.accounts
    .filter((account) => !account.isSavings)
    .reduce((sum, acc) => sum + (acc.initialBalance || 0), 0);

  const currentBalance =
    totalInitialBalance +
    (currentPeriodStart ? pensionAmount : 0) +
    income -
    moneyOut;
  // ============================================================

  // 6. Вычисляем баланс накопительных счетов
  let savingsBalance = 0;
  if (settings.accounts) {
    settings.accounts.forEach((account) => {
      if (account.isSavings) {
        const accIncome = periodTransactions
          .filter(
            (t) =>
              t.type === 'income' &&
              (t.accountId === account.id || t.toAccountId === account.id),
          )
          .reduce((sum, t) => sum + t.amount, 0);

        const accMoneyOut = periodTransactions
          .filter((t) => {
            if (t.type === 'expense' || t.type === 'committed') {
              return t.accountId === account.id || t.fromAccountId === account.id;
            }
            if (t.type === 'transfer') {
              return t.fromAccountId === account.id;
            }
            return false;
          })
          .reduce((sum, t) => sum + t.amount, 0);

        const accCurrentBalance =
          (account.initialBalance || 0) + accIncome - accMoneyOut;
        savingsBalance += accCurrentBalance;
      }
    });
  }

  // 7. Свободный бюджет
  const freeBudget = currentBalance - reserveAmount - fixedTotal;
  const remaining = freeBudget;

  // 8. Считаем оставшиеся дни
  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(diffDays, 1);

  // 9. Дневной лимит
  const dailyLimit = remaining / daysLeft;

  return {
    dailyLimit,
    remaining,
    spent,
    income,
    freeBudget,
    currentBalance,
    savingsBalance,
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

