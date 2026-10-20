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
    initialBalance = 0,
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

  // Резерв только по НЕоплаченным в текущем периоде платежам
  const paidIds = new Set(
    periodTransactions.filter((t) => t.paymentId).map((t) => t.paymentId),
  );
  const fixedTotal = fixedExpenses
    .filter((p) => !paidIds.has(p.id))
    .reduce((sum, p) => sum + p.amount, 0);

  // 3. Считаем доходы и расходы (общие)
  const spent = periodTransactions
    .filter((t) => t.type === 'expense' || t.type === 'committed')
    .reduce((sum, t) => sum + t.amount, 0);

  const income = periodTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  // Деньги, покинувшие кошелёк: расходы + переводы
  const moneyOut = periodTransactions
    .filter((t) => {
      if (t.type === 'expense' || t.type === 'committed') return true;
      if (t.type === 'transfer') return true;
      return false;
    })
    .reduce((sum, t) => sum + t.amount, 0);

  // 4. === БУХГАЛТЕРСКИЙ РАСЧЁТ ОБЩЕГО БАЛАНСА ===
  const currentBalance =
    initialBalance +
    (currentPeriodStart ? pensionAmount : 0) +
    income -
    moneyOut;

  // 5. === НОВОЕ: ВЫЧИСЛЯЕМ БАЛАНС НАКОПИТЕЛЬНЫХ СЧЕТОВ ===
  let savingsBalance = 0;
  if (settings.accounts) {
    settings.accounts.forEach((account) => {
      if (account.isSavings) {
        // Доходы на этот накопительный счет
        const accIncome = periodTransactions
          .filter(
            (t) =>
              t.type === 'income' &&
              (t.accountId === account.id || t.toAccountId === account.id),
          )
          .reduce((sum, t) => sum + t.amount, 0);

        // Расходы и переводы с этого накопительного счета
        const accMoneyOut = periodTransactions
          .filter((t) => {
            if (t.type === 'expense' || t.type === 'committed') {
              return (
                t.accountId === account.id || t.fromAccountId === account.id
              );
            }
            if (t.type === 'transfer') {
              return t.fromAccountId === account.id;
            }
            return false;
          })
          .reduce((sum, t) => sum + t.amount, 0);

        // Текущий баланс накопительного счета = начальный + доходы - расходы
        const accCurrentBalance =
          (account.initialBalance || 0) + accIncome - accMoneyOut;
        savingsBalance += accCurrentBalance;
      }
    });
  }

  // 6. Свободный бюджет = Текущий баланс - НЗ - Фиксированные платежи
  // (Накопления уже исключены из initialBalance, вычитать их повторно НЕ НУЖНО)
  const freeBudget = currentBalance - reserveAmount - fixedTotal;
  const remaining = freeBudget;

  // 7. Считаем оставшиеся дни
  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(diffDays, 1);

  // 8. Дневной лимит
  const dailyLimit = remaining / daysLeft;

  return {
    dailyLimit,
    remaining,
    spent,
    income,
    freeBudget,
    currentBalance,
    savingsBalance, // ← Возвращаем сумму накоплений (пригодится для отображения)
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

