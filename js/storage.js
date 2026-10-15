const STORAGE_KEY = 'pensionBudget';

// Структура данных по умолчанию (используется при первом запуске)
const defaultData = {
  settings: {
    pensionAmount: 0,
    pensionDay: 1,
    reserveAmount: 0,
    initialBalance: 0,
    currentPeriodStart: null,
    // === НОВОЕ для v2.1: многоконточность ===
    accounts: [{ id: 'sber', name: 'Сбербанк', emoji: '💳', color: '#21a038' }],
    defaultAccountId: 'sber',
  },
  fixedExpenses: [],
  transactions: [],
};

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultData);

    const parsed = JSON.parse(raw);

    // Мягкая миграция: дополняем недостающие поля значениями по умолчанию
    const data = {
      ...defaultData,
      ...parsed,
      settings: {
        ...defaultData.settings,
        ...parsed.settings,
      },
    };

    // === ИСПРАВЛЕННАЯ МИГРАЦИЯ v2.1 ===
    // Проверяем не наличие accounts (оно может подтянуться из defaultData),
    // а наличие accountId у транзакций. Это самый надежный признак старой версии.
    const needsMigration =
      data.transactions && data.transactions.some((t) => !t.accountId);

    if (needsMigration) {
      console.log('🔄 Миграция v2.1: привязываем старые транзакции к счету...');

      // На всякий случай убеждаемся, что массив счетов есть
      if (!data.settings.accounts || !Array.isArray(data.settings.accounts)) {
        data.settings.accounts = [
          { id: 'sber', name: 'Сбербанк', emoji: '💳', color: '#21a038' },
        ];
      }

      // Устанавливаем счет по умолчанию, если его нет
      if (!data.settings.defaultAccountId) {
        data.settings.defaultAccountId = data.settings.accounts[0].id;
      }

      // Добавляем accountId ко всем транзакциям, где его нет
      let migratedCount = 0;
      data.transactions.forEach((t) => {
        if (!t.accountId) {
          t.accountId = data.settings.defaultAccountId; // Привязываем к дефолтному (sber)
          migratedCount++;
        }
      });

      console.log(
        `✅ Миграция: ${migratedCount} транзакций получили accountId='${data.settings.defaultAccountId}'`,
      );

      // ВАЖНО: Сохраняем изменения обратно в localStorage!
      saveData(data);
      console.log('💾 Мигрированные данные сохранены в localStorage');
    }

    return data;
  } catch (e) {
    console.error('Ошибка чтения данных из localStorage:', e);
    return structuredClone(defaultData);
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Ошибка сохранения данных:', e);
  }
}

/**
 * Архивация текущего периода (v2.1) — ИСПРАВЛЕННАЯ ВЕРСИЯ
 * @param {Object} appData - Текущий объект данных приложения
 * @param {Object} calculatedBalance - Результат calculateDailyLimit (опционально)
 * @returns {Object|null}
 */
export function archiveCurrentPeriod(appData, calculatedBalance = null) {
  if (!appData || !appData.settings.currentPeriodStart) {
    console.warn('⚠️ Нет активного периода для архивации');
    return null;
  }

  const settings = appData.settings;
  const transactions = appData.transactions || [];
  const fixedExpenses = appData.fixedExpenses || [];

  // 1. Фильтруем транзакции текущего периода
  const periodStart = new Date(settings.currentPeriodStart);
  const periodTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate >= periodStart;
  });

  // 2. Считаем итоги по транзакциям периода
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalCommitted = 0;

  periodTransactions.forEach(tx => {
    if (tx.type === 'income') totalIncome += tx.amount;
    else if (tx.type === 'expense') totalExpenses += Math.abs(tx.amount);
    else if (tx.type === 'committed') totalCommitted += Math.abs(tx.amount);
  });

  // 3. ВАЖНО: добавляем пенсию к доходам, если период был начат
  // (в приложении пенсия не хранится как транзакция, а добавляется через settings.pensionAmount)
  if (settings.currentPeriodStart) {
    totalIncome += settings.pensionAmount || 0;
  }

  // 4. Считаем баланс для переноса
  let carryOver;
  if (calculatedBalance) {
    // Используем переданный рассчитанный баланс (предпочтительно)
    carryOver = calculatedBalance.currentBalance - calculatedBalance.fixedTotal;
  } else {
    // Запасной вариант: считаем сами
    let currentBalance = settings.initialBalance || 0;
    currentBalance += settings.pensionAmount || 0;
    transactions.forEach(tx => {
      if (tx.type === 'income') currentBalance += tx.amount;
      else if (tx.type === 'expense' || tx.type === 'committed') currentBalance -= Math.abs(tx.amount);
      else if (tx.type === 'transfer') {
        if (tx.fromAccountId === settings.defaultAccountId) currentBalance -= Math.abs(tx.amount);
        if (tx.toAccountId === settings.defaultAccountId) currentBalance += Math.abs(tx.amount);
      }
    });
    currentBalance -= (settings.reserveAmount || 0);
    const paidIds = new Set(periodTransactions.filter(t => t.paymentId).map(t => t.paymentId));
    const unpaidFixed = fixedExpenses.filter(p => !paidIds.has(p.id)).reduce((sum, p) => sum + p.amount, 0);
    currentBalance -= unpaidFixed;
    carryOver = currentBalance;
  }

  carryOver = Math.round(Math.max(0, carryOver) * 100) / 100;

  // 5. Создаём снапшот настроек
  const settingsSnapshot = {
    accounts: settings.accounts || [],
    categories: settings.categories || {},
    pensionAmount: settings.pensionAmount,
    reserveAmount: settings.reserveAmount,
    pensionDay: settings.pensionDay
  };

  // 6. Формируем архивную запись
  const archiveRecord = {
    periodId: periodStart.toISOString().slice(0, 7),
    startDate: settings.currentPeriodStart,
    endDate: new Date().toISOString(),
    closedAt: new Date().toISOString(),
    initialBalance: settings.initialBalance,
    finalBalance: carryOver,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    totalCommitted: Math.round(totalCommitted * 100) / 100,
    transactions: periodTransactions,
    settingsSnapshot: settingsSnapshot
  };

  // 7. Сохраняем в архив
  if (!settings.archives) settings.archives = [];
  settings.archives.push(archiveRecord);

  // 8. Удаляем транзакции периода из основной базы
  appData.transactions = transactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate < periodStart;
  });

  // 9. Переносим остаток и сбрасываем флаг периода
  settings.initialBalance = carryOver;
  delete settings.currentPeriodStart;

  // 10. Сохраняем изменения
  saveData(appData);

  console.log('✅ Период архивирован:', archiveRecord.periodId, '| Остаток:', carryOver);
  return archiveRecord;
}
