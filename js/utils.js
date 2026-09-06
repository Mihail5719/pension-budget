// Форматирование суммы: 12350 → "12 350 ₽"
export function formatMoney(amount) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(amount);
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
