/**
 * ============================================================================
 * ФАЙЛ: constants.js
 * НАЗНАЧЕНИЕ: Словарь данных и предикаты типов операций.
 *
 * Этот модуль содержит:
 * 1. Функции-предикаты для проверки типа транзакции (isIncome, isExpense и т.д.)
 * 2. Справочники категорий расходов и доходов
 * 3. Справочник подкатегорий
 *
 * Вынесен из app.js в рамках рефакторинга v2.1 для улучшения читаемости кода.
 * ============================================================================
 */

// ─── Предикаты типов операций (v2.0, коммит 2) ───
// Функции-проверки: возвращают true, если транзакция соответствует типу.
// Используются в filter(), reduce() и условной логике по всему приложению.

export const isIncome = (t) => t.type === 'income';
export const isExpense = (t) => t.type === 'expense';
export const isCommitted = (t) => t.type === 'committed';

// "Деньги, покинувшие кошелёк" — влияют на баланс,
// но в круг статистики жизни попадает только isExpense.
export const isMoneyOut = (t) => isExpense(t) || isCommitted(t);
// ─── конец блока предикатов ───

// ── Список категорий расходов (v2.0) ──
// Каждая категория имеет id (для кода), name (для отображения) и emoji (для UI).
export const EXPENSE_CATEGORIES = [
  { id: 'products', name: 'Продукты', emoji: '' },
  { id: 'pharmacy', name: 'Аптека', emoji: '' },
  { id: 'transport', name: 'Транспорт', emoji: '🚗' },
  { id: 'utilities', name: 'ЖКХ', emoji: '🏠' },
  { id: 'communication', name: 'Связь', emoji: '📱' },
  { id: 'health', name: 'Здоровье', emoji: '🩺' },
  { id: 'gifts', name: 'Подарки', emoji: '🎁' },
  { id: 'home', name: 'Для дома', emoji: '🏡' },
  { id: 'clothes', name: 'Одежда', emoji: '👕' },
  { id: 'other', name: 'Разное', emoji: '📦' }, // Глобальное переименование
  { id: 'study', name: 'Учёба', emoji: '' },
  { id: 'savings', name: 'Накопления', emoji: '' },
];

// ─── Подкатегории для категорий расходов (v2.0) ───
// Ключ объекта = id родительской категории из EXPENSE_CATEGORIES.
// Значение = массив подкатегорий.
export const SUBCATEGORIES = {
  products: [
    { id: 'meat', name: 'Мясо' }, // Разделено
    { id: 'fish', name: 'Рыба' }, // Разделено
    { id: 'veg', name: 'Овощи и фрукты' },
    { id: 'dairy', name: 'Молочное' },
    { id: 'bread', name: 'Хлеб и бакалея' },
    { id: 'other', name: 'Разное' },
  ],
  pharmacy: [
    { id: 'medicines', name: 'Лекарства' },
    { id: 'vitamins', name: 'Витамины и БАДы' },
    { id: 'medical_devices', name: 'Медицинские изделия' },
    { id: 'hygiene', name: 'Уход и гигиена' },
    { id: 'other', name: 'Разное' }, // Резерв
  ],
  transport: [
    { id: 'fuel', name: 'Бензин' },
    { id: 'parts', name: 'Запчасти' },
    { id: 'maintenance', name: 'ТО' },
    { id: 'parking', name: 'Парковка' },
    { id: 'car_wash', name: 'Мойка' },
    { id: 'insurance', name: 'Страховка' },
    { id: 'fines', name: 'Штрафы ГИБДД' },
    { id: 'other', name: 'Разное' },
  ],
  utilities: [
    { id: 'communal', name: 'Коммуналка' }, // Вода + Отопление + Содержание
    { id: 'elec', name: 'Электричество' },
    { id: 'gas', name: 'Газ' },
    { id: 'trash', name: 'Вывоз мусора' },
    { id: 'fkr', name: 'ФКР' },
    { id: 'intercom', name: 'Домофон' },
    { id: 'other', name: 'Разное' },
  ],
  communication: [
    { id: 'mobile', name: 'Мобильный' },
    { id: 'internet_tv', name: 'Интернет и ТВ' },
    { id: 'other', name: 'Прочее' }, // Специфично для Связи по спеке
  ],
  health: [
    { id: 'consult', name: 'Консультации' },
    { id: 'tests', name: 'Анализы' },
    { id: 'procedures', name: 'Процедуры' },
    { id: 'other', name: 'Разное' },
  ],
  gifts: [
    { id: 'birthday', name: 'Дни рождения' },
    { id: 'holiday', name: 'Праздники' },
    { id: 'grandkids', name: 'Внукам' },
    { id: 'other', name: 'Разное' },
  ],
  home: [
    { id: 'furniture', name: 'Мебель' },
    { id: 'repair', name: 'Ремонт' },
    { id: 'chem', name: 'Бытовая химия' },
    { id: 'other', name: 'Разное' },
  ],
  clothes: [
    { id: 'daily', name: 'Повседневная' },
    { id: 'season', name: 'Сезонная' },
    { id: 'shoes', name: 'Обувь' },
    { id: 'other', name: 'Разное' },
  ],
  study: [
    { id: 'courses', name: 'Курсы' },
    { id: 'books', name: 'Книги' },
    { id: 'other', name: 'Разное' },
  ],
  savings: [
    { id: 'bank', name: 'На счёт в банке' },
    { id: 'cash', name: 'Наличные' },
    { id: 'other', name: 'Разное' },
  ],
  other: [
    { id: 'unexpected', name: 'Непредвиденное' },
    { id: 'hobby', name: 'Хобби' },
    { id: 'other_sub', name: 'Прочее' },
  ],
};

// ─── Список категорий доходов (v2.0) ───
export const INCOME_CATEGORIES = [
  { id: 'gift', name: 'Подарки', emoji: '🎁' },
  { id: 'help', name: 'Помощь от детей/родственников', emoji: '👪' },
  { id: 'work', name: 'Подработка', emoji: '💼' },
  { id: 'debt', name: 'Возврат долга', emoji: '' },
  { id: 'refund', name: 'Возврат переплаты', emoji: '💸' }, // Новое
  { id: 'interest', name: 'Проценты по счёту', emoji: '📈' }, // Новое
  { id: 'other', name: 'Разное', emoji: '' }, // Глобальное переименование
];
