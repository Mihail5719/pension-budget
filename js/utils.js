import { EXPENSE_CATEGORIES } from './constants.js';

/**
 * Форматирует число в денежный формат с копейками
 * Пример: 12350.45 -> "12 350,45 ₽"
 *
 * @param {number} amount - Сумма для форматирования
 * @returns {string} - Отформатированная строка с копейками
 */
export function formatMoney(amount) {
  // 1. Сначала жестко округляем до копеек, чтобы убрать ошибки float
  const cleanAmount = Math.round(amount * 100) / 100;

  // 2. Форматируем число в стиле "17 866,56" (без валюты, чтобы избежать бага Android)
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cleanAmount);

  // 3. Явно добавляем символ рубля — это работает на всех устройствах
  return formatted + ' ₽';
}

// Получение строки даты в формате YYYY-MM-DD
export function formatDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Человекочитаемая дата: "Сегодня, 14:30" или "Вчера, 10:15" или "3 сент, 18:45"
export function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const time = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (date.toDateString() === today.toDateString()) {
    return `Сегодня, ${time}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return `Вчера, ${time}`;
  }
  return `${date.getDate()} ${date.toLocaleDateString('ru-RU', { month: 'short' })}, ${time}`;
}

/**
 * Форматирует дату БЕЗ времени: "Сегодня", "Вчера" или "3 сент"
 * Используется для отображения в списке транзакций на мобильных устройствах
 *
 * @param {string} dateStr - Строка даты в формате ISO (например, "2026-09-10T21:33:00.000Z")
 * @returns {string} - Только дата без времени
 */
export function formatDateOnly(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Сегодня';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Вчера';
  }
  return `${date.getDate()} ${date.toLocaleDateString('ru-RU', { month: 'short' })}`;
}

// Определяем границы текущего "пенсионного периода"
// Если пенсия 15-го, то период: с 15-го прошлого месяца по 14-е текущего
export function getCurrentPeriod(pensionDay) {
  const now = new Date();
  const currentDay = now.getDate();

  let startDate, endDate;

  if (currentDay >= pensionDay) {
    // Мы в текущем месяце после дня пенсии
    startDate = new Date(now.getFullYear(), now.getMonth(), pensionDay);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, pensionDay - 1);
  } else {
    // Мы в текущем месяце до дня пенсии — значит период начался в прошлом месяце
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, pensionDay);
    endDate = new Date(now.getFullYear(), now.getMonth(), pensionDay - 1);
  }

  return { startDate, endDate };
}

// Сколько дней осталось в текущем периоде (включая сегодня)
export function getDaysLeft(pensionDay) {
  const { endDate } = getCurrentPeriod(pensionDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = endDate.getTime() - today.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1; // +1 — включаем сегодня
  return Math.max(days, 1); // минимум 1 день, чтобы не делить на 0
}

/**
 * Возвращает диапазон дат для заданного периода.
 * @param {string} period - 'all' | 'today' | 'week' | 'month'
 * @returns {{start: Date, end: Date}} диапазон дат
 */
export function getDateRange(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (period) {
    case 'today':
      return { start: today, end: endOfDay };

    case 'week':
      const weekStart = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { start: weekStart, end: endOfDay };

    case 'month':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart, end: endOfDay };

    case 'all':
    default:
      return { start: new Date(0), end: new Date(8640000000000000) };
  }
}

/**
 * Проверяет, попадает ли дата транзакции в заданный диапазон.
 * @param {string|Date} transactionDate - дата транзакции (ISO-строка или Date)
 * @param {Date} start - начало диапазона
 * @param {Date} end - конец диапазона
 * @returns {boolean}
 */
export function isDateInRange(transactionDate, start, end) {
  const date = new Date(transactionDate);
  return date >= start && date <= end;
}

/**
 * Фильтрует массив транзакций по текстовому запросу и диапазону дат.
 * Исключает архивные записи по умолчанию.
 * @param {string} query - поисковый запрос
 * @param {Array} transactions - массив объектов транзакций
 * @param {{start: Date, end: Date}} dateRange - диапазон дат
 * @param {boolean} [includeArchived=false] - показывать ли архивные
 * @returns {Array} отфильтрованный массив транзакций
 */
export function filterTransactions(
  query,
  transactions,
  dateRange,
  includeArchived = false,
) {
  // 1. Фильтруем по дате и архивации
  let filtered = transactions.filter((t) => {
    // Исключаем архивные, если не запрошены явно
    if (!includeArchived && t.isArchived) {
      return false;
    }
    return isDateInRange(t.date, dateRange.start, dateRange.end);
  });

  // 2. Если есть текстовый запрос — фильтруем дополнительно
  if (query && query.trim() !== '') {
    const lowerQuery = query.toLowerCase().trim();

    filtered = filtered.filter((t) => {
      const fieldsToSearch = [
        t.category || '',
        t.subCategory || t.subcategory || '',
        t.item || '',
        t.store || '',
        t.note || '',
        String(t.amount || ''),
      ];

      return fieldsToSearch.some((field) =>
        String(field).toLowerCase().includes(lowerQuery),
      );
    });
  }

  return filtered;
}

/**
 * Анализирует расходы за выбранный период и группирует их по иерархии:
 * Категория -> Подкатегория -> Товар.
 * Реализует "умное скрытие" уровня товаров, если они не заполнены.
 *
 * @param {Array} transactions - Массив всех транзакций
 * @param {Object} dateRange - Объект { start: Date, end: Date }
 * @returns {Object} Структурированные данные для отчета
 */
export function analyzeExpenses(transactions, dateRange) {
  // 1. Фильтрация транзакций
  const filtered = transactions.filter((t) => {
    if (t.type !== 'expense' && t.type !== 'committed') return false;
    const date = new Date(t.date);
    return date >= dateRange.start && date <= dateRange.end;
  });

  // 2. Подсчет общей суммы (с защитой от IEEE-754)
  const totalExpenses =
    Math.round(filtered.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;

  // Если расходов нет, возвращаем пустую структуру
  if (totalExpenses === 0) {
    return {
      totalExpenses: 0,
      period: {
        start: dateRange.start.toISOString().split('T')[0],
        end: dateRange.end.toISOString().split('T')[0],
      },
      categories: [],
    };
  }

  // 3. Промежуточная агрегация
  const aggregation = {};

  filtered.forEach((t) => {
    const catName = t.category || 'Разное';
    const subName = t.subcategory || 'Без подкатегории';
    const itemName = t.item && t.item.trim() ? t.item.trim() : null;

    if (!aggregation[catName]) {
      aggregation[catName] = { total: 0, subs: {} };
    }
    aggregation[catName].total += t.amount;

    if (!aggregation[catName].subs[subName]) {
      aggregation[catName].subs[subName] = { total: 0, items: {} };
    }
    aggregation[catName].subs[subName].total += t.amount;

    if (itemName) {
      if (!aggregation[catName].subs[subName].items[itemName]) {
        aggregation[catName].subs[subName].items[itemName] = 0;
      }
      aggregation[catName].subs[subName].items[itemName] += t.amount;
    }
  });

  // Округляем промежуточные суммы, чтобы избежать накопления ошибок
  Object.keys(aggregation).forEach((catName) => {
    aggregation[catName].total =
      Math.round(aggregation[catName].total * 100) / 100;
    Object.keys(aggregation[catName].subs).forEach((subName) => {
      aggregation[catName].subs[subName].total =
        Math.round(aggregation[catName].subs[subName].total * 100) / 100;
      Object.keys(aggregation[catName].subs[subName].items).forEach(
        (itemName) => {
          aggregation[catName].subs[subName].items[itemName] =
            Math.round(
              aggregation[catName].subs[subName].items[itemName] * 100,
            ) / 100;
        },
      );
    });
  });

  // 4. Форматирование и сортировка
  const categories = Object.keys(aggregation)
    .map((catName) => {
      const catData = aggregation[catName];
      const catInfo = EXPENSE_CATEGORIES.find((c) => c.name === catName);
      const emoji = catInfo ? catInfo.emoji : '📦';

      const subcategories = Object.keys(catData.subs)
        .map((subName) => {
          const subData = catData.subs[subName];

          let items = [];
          const itemKeys = Object.keys(subData.items);

          if (itemKeys.length > 0) {
            items = itemKeys
              .map((name) => ({
                name,
                total: subData.items[name],
                // Процент считается от суммы подкатегории (родителя)
                percent:
                  Math.round((subData.items[name] / subData.total) * 1000) / 10,
              }))
              .sort((a, b) => b.total - a.total);

            const itemsTotal = items.reduce((sum, i) => sum + i.total, 0);
            if (itemsTotal < subData.total) {
              const diff = Math.round((subData.total - itemsTotal) * 100) / 100;
              items.push({
                name: 'Без названия',
                total: diff,
                // Процент считается от суммы подкатегории (родителя)
                percent: Math.round((diff / subData.total) * 1000) / 10,
              });
              items.sort((a, b) => b.total - a.total);
            }
          }

          return {
            name: subName,
            total: subData.total,
            // Процент считается от суммы категории (родителя)
            percent: Math.round((subData.total / catData.total) * 1000) / 10,
            items: items,
          };
        })
        .sort((a, b) => b.total - a.total);

      // ВОТ ЭТОГО НЕ ХВАТАЛО: возврат данных для уровня Категории
      return {
        name: catName,
        emoji: emoji,
        total: catData.total,
        // Процент категории считается от ОБЩЕЙ суммы расходов
        percent: Math.round((catData.total / totalExpenses) * 1000) / 10,
        subcategories: subcategories,
      };
    }) // Закрываем .map для категорий
    .sort((a, b) => b.total - a.total); // Сортируем категории

  return {
    totalExpenses,
    period: {
      start: dateRange.start.toISOString().split('T')[0],
      end: dateRange.end.toISOString().split('T')[0],
    },
    categories,
  };
}

/**
 * Возвращает фактический день платежа с учётом длины месяца.
 * Если запрошенный день больше, чем дней в месяце — возвращает последний день месяца.
 * @param {number} requestedDay - запрошенный день (1-31)
 * @param {number} year - год
 * @param {number} month - месяц (0-11, как в JS Date)
 * @returns {number} фактический день платежа
 */
export function getActualPaymentDay(requestedDay, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Math.min(requestedDay, daysInMonth);
}

// Временно делаем функцию доступной в консоли для тестирования
window.analyzeExpenses = analyzeExpenses;