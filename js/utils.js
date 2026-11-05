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
 * @param {string} period - 'all' | 'today' | 'week' | 'month' | 'custom'
 * @returns {{start: Date, end: Date}} диапазон дат
 */
export function getDateRange(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Начало сегодняшнего дня (00:00)
  const endOfDay = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1); // Конец сегодняшнего дня (23:59:59.999)

  switch (period) {
    case 'today':
      return { start: today, end: endOfDay };

    case 'week':
      // Последние 7 дней (включая сегодня)
      const weekStart = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { start: weekStart, end: endOfDay };

    case 'month':
      // С 1-го числа текущего месяца по сегодня
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart, end: endOfDay };

    case 'custom':
      // Пока возвращаем "все" — календарь реализуем позже
      return { start: new Date(0), end: new Date(8640000000000000) };

    case 'all':
    default:
      // Без ограничений
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
 * Фильтрует массив транзакций по текстовому запросу и периоду.
 * @param {string} query - поисковый запрос
 * @param {Array} transactions - массив объектов транзакций
 * @param {string} [datePeriod='all'] - период фильтрации
 * @returns {Array} отфильтрованный массив транзакций
 */
export function filterTransactions(query, transactions, datePeriod = 'all') {
  // 1. Получаем диапазон дат
  const { start, end } = getDateRange(datePeriod);

  // 2. Фильтруем по дате
  let filtered = transactions.filter(t => 
    isDateInRange(t.date, start, end)
  );

  // 3. Если есть текстовый запрос — фильтруем дополнительно
  if (query && query.trim() !== '') {
    const lowerQuery = query.toLowerCase().trim();

    filtered = filtered.filter(t => {
      const fieldsToSearch = [
        t.category || '',
        t.subCategory || t.subcategory || '',
        t.item || '',
        t.store || '',
        t.note || '',
        String(t.amount || '')
      ];

      return fieldsToSearch.some(field => 
        String(field).toLowerCase().includes(lowerQuery)
      );
    });
  }

  return filtered;
}