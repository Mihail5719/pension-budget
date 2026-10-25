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
    // === НОВОЕ: Записываем текущее время как момент последнего изменения ===
    data.lastModified = new Date().toISOString();
    // =====================================================================

    localStorage.setItem('pensionBudget', JSON.stringify(data)); // Убедитесь, что ключ 'pensionBudget' совпадает с вашим

    // === НОВОЕ: Сразу обновляем индикатор после сохранения ===
    if (typeof updateSyncIndicator === 'function') {
      updateSyncIndicator(data.transactions, data.lastModified);
    }
    // =========================================================
  } catch (e) {
    console.error('Ошибка сохранения данных:', e);
  }
}


