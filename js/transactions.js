/**
 * ============================================================================
 * ФАЙЛ: transactions.js
 * НАЗНАЧЕНИЕ: CRUD-операции с транзакциями (создание, редактирование, удаление).
 *
 * Вынесен из app.js в рамках рефакторинга v2.1.
 * Отвечает только за манипуляции с массивом appData.transactions.
 * ============================================================================
 */

import { saveData } from './storage.js';
import { formatMoney } from './utils.js';
import {
  isIncome,
  isExpense,
  isCommitted,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SUBCATEGORIES,
} from './constants.js';

// ─── СОЗДАНИЕ ТРАНЗАКЦИЙ ───

/**
 * Создаёт и сохраняет новую транзакцию расхода.
 * @param {Object} appData - Глобальное состояние приложения
 * @param {Object} formData - Данные из формы { categoryId, amount, subId, item }
 * @returns {Object} Созданная транзакция
 */
export function createExpense(appData, formData) {
  const { categoryId, amount, subId, item } = formData;

  const category = EXPENSE_CATEGORIES.find((c) => c.id === categoryId);
  const categoryName = category ? category.name : categoryId;

  const subs = SUBCATEGORIES[categoryId] || [];
  const sub = subs.find((s) => s.id === subId);
  const subName = sub ? sub.name : subId;

  const transaction = {
    id: Date.now(),
    date: new Date().toISOString(),
    category: categoryName,
    subcategory: subName,
    amount: amount,
    type: 'expense',
    item: item || '',
  };

  appData.transactions.push(transaction);
  saveData(appData);

  return transaction;
}

/**
 * Создаёт и сохраняет новую транзакцию дохода.
 * @param {Object} appData - Глобальное состояние приложения
 * @param {Object} formData - Данные из формы { categoryId, amount }
 * @returns {Object} Созданная транзакция
 */
export function createIncome(appData, formData) {
  const { categoryId, amount } = formData;

  const category = INCOME_CATEGORIES.find((c) => c.id === categoryId);
  const categoryName = category ? category.name : categoryId;

  const transaction = {
    id: Date.now(),
    date: new Date().toISOString(),
    category: categoryName,
    amount: amount,
    type: 'income',
  };

  appData.transactions.push(transaction);
  saveData(appData);

  return transaction;
}

// ─── РЕДАКТИРОВАНИЕ ТРАНЗАКЦИЙ ───

/**
 * Обновляет существующую транзакцию по ID.
 * @param {Object} appData - Глобальное состояние приложения
 * @param {number} transactionId - ID транзакции
 * @param {Object} newData - Новые данные { category, subcategory, amount, date }
 * @returns {boolean} true если успешно, false если не найдено
 */
export function updateTransaction(appData, transactionId, newData) {
  const index = appData.transactions.findIndex((t) => t.id === transactionId);

  if (index === -1) {
    console.error('Транзакция не найдена:', transactionId);
    return false;
  }

  // Сохраняем оригинальный тип и ID, обновляем остальные поля
  appData.transactions[index] = {
    ...appData.transactions[index],
    ...newData,
    id: appData.transactions[index].id, // ID не меняем
    type: appData.transactions[index].type, // Тип не меняем
  };

  saveData(appData);
  return true;
}

// ─── УДАЛЕНИЕ ТРАНЗАКЦИЙ ───

/**
 * Удаляет транзакцию по ID.
 * Если это была операция с НЗ (type === 'reserve'), восстанавливает сумму в НЗ.
 * @param {Object} appData - Глобальное состояние приложения
 * @param {number} transactionId - ID транзакции
 * @returns {Object|null} Удалённая транзакция или null
 */
export function deleteTransaction(appData, transactionId) {
  const transaction = appData.transactions.find((t) => t.id === transactionId);

  if (!transaction) {
    console.error('Транзакция не найдена:', transactionId);
    return null;
  }

  // Удаляем из массива
  appData.transactions = appData.transactions.filter(
    (t) => t.id !== transactionId,
  );

  // Если это было снятие с НЗ — возвращаем деньги обратно
  if (transaction.type === 'reserve') {
    appData.settings.reserveAmount += transaction.amount;
    console.log('🔓 НЗ восстановлен:', appData.settings.reserveAmount);
  }

  saveData(appData);
  return transaction;
}

/**
 * Удаляет все транзакции в диапазоне дат.
 * @param {Object} appData - Глобальное состояние приложения
 * @param {string} dateFrom - Начальная дата (YYYY-MM-DD)
 * @param {string} dateTo - Конечная дата (YYYY-MM-DD)
 * @returns {number} Количество удалённых записей
 */
export function deleteTransactionsByRange(appData, dateFrom, dateTo) {
  const from = new Date(`${dateFrom}T00:00:00`);
  const to = new Date(`${dateTo}T23:59:59`);

  const victims = appData.transactions.filter((t) => {
    const d = new Date(t.date);
    return d >= from && d <= to;
  });

  if (victims.length === 0) return 0;

  appData.transactions = appData.transactions.filter((t) => {
    const d = new Date(t.date);
    return d < from || d > to;
  });

  saveData(appData);
  return victims.length;
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ───

/**
 * Проверяет, является ли сумма валидной для транзакции.
 * @param {number} amount - Сумма
 * @returns {boolean}
 */
export function isValidAmount(amount) {
  return !isNaN(amount) && amount > 0;
}

/**
 * Получает список категорий для модального окна редактирования.
 * @param {string} type - 'income' или 'expense'
 * @returns {Array} Массив категорий
 */
export function getCategoriesByType(type) {
  if (type === 'income') return INCOME_CATEGORIES;
  return EXPENSE_CATEGORIES;
}
