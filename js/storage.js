const STORAGE_KEY = 'pensionBudget';

// Структура данных по умолчанию (используется при первом запуске)
const defaultData = {
  settings: {
    pensionAmount: 0,        // ← Ноль вместо 18500
    pensionDay: 1,           // ← 1 вместо 15
    reserveAmount: 0,        // ← Ноль вместо 2000
  },
  fixedExpenses: [],         // ← Пустой массив вместо платежей
  transactions: [],          // ← История пуста
};

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultData);

    const parsed = JSON.parse(raw);
    // На случай, если в новых версиях появятся новые поля —
    // дополняем их значениями по умолчанию
    return {
      ...defaultData,
      ...parsed,
      settings: { ...defaultData.settings, ...parsed.settings },
    };
  } catch (e) {
    console.error('Ошибка чтения данных:', e);
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
