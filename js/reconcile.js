/**
 * ============================================================================
 * ФАЙЛ: reconcile.js
 * НАЗНАЧЕНИЕ: Движок сверки транзакций приложения с банковской выпиской.
 *
 * Вынесен из app.js в рамках рефакторинга v2.1.
 * Содержит алгоритмы парсинга (CSV, PDF) и рекурсивного поиска комбинаций сумм.
 * ============================================================================
 */

import { formatMoney } from './utils.js';
import { saveData } from './storage.js';

// Вспомогательная функция для получения актуальных данных (чтобы не зависеть от appData из app.js)
const getAppData = () =>
  JSON.parse(localStorage.getItem('pensionBudget') || '{}');

// ============================================================================
// 1. ПАРСЕРЫ
// ============================================================================

export function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === ';') continue;
    const parts = line.split(';');
    if (parts.length < 3) continue;
    const date = parts[0].trim();
    const amountStr = parts[1].trim().replace(',', '.');
    const amount = parseFloat(amountStr);
    const description = parts[2].trim();
    if (date && !isNaN(amount) && description) {
      transactions.push({ date, amount, description });
    }
  }
  return transactions;
}

export function parseRawPDFText(text) {
  const transactions = [];
  const regex =
    /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+([А-Яа-яA-Za-z][А-Яа-яA-Za-z\s]*?)\s+([\d\s]+,\d{2})\s+([\d\s]+,\d{2})\s+(\d{2}\.\d{2}\.\d{4})\s+(\d+)\s+(.+?)(?=\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}|$)/gs;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const date = match[1];
    const amountStr = match[4].replace(/\s/g, '').replace(',', '.');
    const description = match[8].trim();
    const isIncome =
      description.includes('+') ||
      description.toLowerCase().includes('перевод') ||
      description.toLowerCase().includes('зачислен');
    const amount = isIncome ? parseFloat(amountStr) : -parseFloat(amountStr);
    if (date && !isNaN(amount) && description) {
      transactions.push({ date, amount, description });
    }
  }
  return transactions;
}

// ============================================================================
// 2. АЛГОРИТМЫ СВЕРКИ
// ============================================================================

function getAdjacentDate(dateStr, daysOffset) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

function normalizeDate(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes('T')) return dateStr.split('T')[0];
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
  return dateStr;
}

function findCombinations(items, targetSum, tolerance = 2) {
  const result = { found: false, items: [] };
  function algebraicSum(items) {
    return items.reduce((sum, { tx }) => sum + tx.amount, 0);
  }
  function findSubset(items, target, current = [], startIndex = 0) {
    if (result.found) return;
    const currentSum = algebraicSum(current);
    if (Math.abs(target - currentSum) <= tolerance) {
      result.found = true;
      result.items = [...current];
      return;
    }
    for (let i = startIndex; i < items.length; i++) {
      current.push(items[i]);
      findSubset(items, target, current, i + 1);
      if (result.found) return;
      current.pop();
    }
  }
  findSubset(items, targetSum);
  return result;
}

function findCombinationsByAbsoluteSum(items, targetSum, tolerance = 5) {
  const result = { found: false, items: [] };
  function absoluteSum(items) {
    return items.reduce((sum, { tx }) => sum + Math.abs(tx.amount), 0);
  }
  function findSubset(items, target, current = [], startIndex = 0) {
    if (result.found) return;
    const currentSum = absoluteSum(current);
    if (Math.abs(target - currentSum) <= tolerance) {
      result.found = true;
      result.items = [...current];
      return;
    }
    if (currentSum > target + tolerance) return;
    for (let i = startIndex; i < items.length; i++) {
      current.push(items[i]);
      findSubset(items, target, current, i + 1);
      if (result.found) return;
      current.pop();
    }
  }
  findSubset(items, targetSum);
  return result;
}

export function reconcileTransactions(bankTransactions) {
  const appData = getAppData();
  const appTransactions = appData.transactions || [];
  const matches = [],
    groupMatches = [],
    mismatches = [],
    missingInApp = [],
    missingInBank = [];
  const pendingHypotheses = {};
  const appByDate = {};

  appTransactions.forEach((tx, index) => {
    const date = normalizeDate(tx.date);
    if (!appByDate[date]) appByDate[date] = [];
    appByDate[date].push({ tx, index });
  });

  const appUsed = new Array(appTransactions.length).fill(false);

  bankTransactions.forEach((bankTx) => {
    const bankDate = normalizeDate(bankTx.date);
    const bankAmount = bankTx.amount;
    let found = false;
    const datesToCheck = [
      bankDate,
      getAdjacentDate(bankDate, -1),
      getAdjacentDate(bankDate, 1),
    ];

    for (const checkDate of datesToCheck) {
      if (found) break;
      if (appByDate[checkDate]) {
        // 1. Точное совпадение 1 к 1
        for (const { tx: appTx, index } of appByDate[checkDate]) {
          if (appUsed[index]) continue;
          if (Math.abs(Math.abs(bankAmount) - Math.abs(appTx.amount)) < 0.01) {
            matches.push({ bank: bankTx, app: appTx });
            appUsed[index] = true;
            found = true;
            break;
          }
        }
        // 2. Групповое совпадение
        if (!found) {
          const dayTransactions = appByDate[checkDate].filter(
            ({ index }) => !appUsed[index],
          );
          const combinations = findCombinations(
            dayTransactions.map(({ tx, index }) => ({ tx, index })),
            bankAmount,
          );
          if (combinations.found) {
            groupMatches.push({
              bank: bankTx,
              app: combinations.items.map(({ tx }) => tx),
            });
            combinations.items.forEach(({ index }) => {
              appUsed[index] = true;
            });
            found = true;
          }
        }
        // 3. Поиск гипотез
        if (!found) {
          const dayTransactions = appByDate[checkDate].filter(
            ({ index }) => !appUsed[index],
          );
          const bankAmountAbs = Math.abs(bankAmount);
          let hypotheses = findCombinations(
            dayTransactions.map(({ tx, index }) => ({ tx, index })),
            bankAmount,
            5,
          );
          if (!hypotheses.found) {
            hypotheses = findCombinationsByAbsoluteSum(
              dayTransactions.map(({ tx, index }) => ({ tx, index })),
              bankAmountAbs,
              5,
            );
          }
          if (hypotheses.found) {
            if (!pendingHypotheses[bankDate]) pendingHypotheses[bankDate] = [];
            const appAbsSum = hypotheses.items.reduce(
              (sum, { tx }) => sum + Math.abs(tx.amount),
              0,
            );
            pendingHypotheses[bankDate].push({
              bank: bankTx,
              app: hypotheses.items.map(({ tx }) => tx),
              difference: Math.abs(bankAmountAbs - appAbsSum),
            });
            found = true;
          }
        }
      }
    }
    if (!found) missingInApp.push(bankTx);
  });

  appTransactions.forEach((appTx, i) => {
    if (!appUsed[i]) missingInBank.push(appTx);
  });

  displayReconcileResults(
    matches,
    groupMatches,
    mismatches,
    missingInApp,
    missingInBank,
    pendingHypotheses,
  );
}

// ============================================================================
// 3. ОТРИСОВКА РЕЗУЛЬТАТОВ
// ============================================================================

function renderReconcileGroup(title, type, items, renderFn) {
  if (items.length === 0) return '';
  const itemsHtml = items
    .map((item) => `<div class="reconcile-item">${renderFn(item)}</div>`)
    .join('');
  return `<div class="reconcile-group reconcile-group--${type}"><div class="reconcile-group__title">${title} (${items.length})</div>${itemsHtml}</div>`;
}

function renderHypotheses(pendingHypotheses) {
  const appData = getAppData();
  const rawHypotheses = Object.values(pendingHypotheses).flat();
  const confirmedHypotheses = appData.confirmedHypotheses || [];
  const activeHypotheses = rawHypotheses.filter((hypothesis) => {
    const hypothesisKey = `${hypothesis.bank.date}_${Math.abs(hypothesis.bank.amount)}_${hypothesis.app.map((tx) => tx.id).join(',')}`;
    return !confirmedHypotheses.includes(hypothesisKey);
  });

  if (activeHypotheses.length === 0) return '';

  const confirmAllBtn =
    activeHypotheses.length > 1
      ? `<button class="reconcile-group__action-all" onclick="confirmAllHypotheses()" style="margin: 12px 0; padding: 10px 16px; background: #27ae60; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.95em; font-weight: 600; width: 100%;">✅ Подтвердить все (${activeHypotheses.length})</button>`
      : '';

  const itemsHtml = activeHypotheses
    .map((hypothesis) => {
      const hypothesisKey = `${hypothesis.bank.date}_${Math.abs(hypothesis.bank.amount)}_${hypothesis.app.map((tx) => tx.id).join(',')}`;
      return `
      <div class="reconcile-item" data-key="${hypothesisKey}" style="margin-bottom: 12px;">
        <div class="reconcile-item__info" style="width: 100%;">
          <div class="reconcile-item__date">${hypothesis.bank.date}</div>
          <div class="reconcile-item__description" style="font-weight: 600;">${hypothesis.bank.description}</div>
          <div style="font-size: 0.9em; color: #f39c12; margin-top: 6px;">Банк: ${formatMoney(hypothesis.bank.amount)} | Возможно в приложении:</div>
          <div style="font-size: 0.85em; color: #555; margin-top: 4px; line-height: 1.4;">
            ${hypothesis.app.map((tx) => `• ${tx.category || tx.description}: ${formatMoney(tx.amount)}`).join('<br>')}
          </div>
          <div style="font-size: 0.8em; color: #777; margin-top: 4px;">Разница: ${formatMoney(hypothesis.difference)}</div>
          <button class="reconcile-item__action" onclick="confirmHypothesis('${hypothesisKey}', this)" style="margin-top: 8px; background: #3498db; color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer;">✅ Подтвердить</button>
        </div>
      </div>`;
    })
    .join('');

  return `<div class="reconcile-group reconcile-group--mismatch" id="hypotheses-group"><div class="reconcile-group__title">⚠️ Требует проверки (${activeHypotheses.length})</div>${confirmAllBtn}${itemsHtml}</div>`;
}

function displayReconcileResults(
  matches,
  groupMatches,
  mismatches,
  missingInApp,
  missingInBank,
  pendingHypotheses = {},
) {
  const resultsDiv = document.getElementById('reconcile-results');
  if (!resultsDiv) return;
  resultsDiv.style.display = 'flex';

  const totalMatches = matches.length + groupMatches.length;
  const totalBank = totalMatches + mismatches.length + missingInApp.length;
  const totalApp = totalMatches + mismatches.length + missingInBank.length;

  resultsDiv.innerHTML = `
    <div class="reconcile-summary">
      <div class="reconcile-summary__item"><span class="reconcile-summary__value">${totalBank}</span><span class="reconcile-summary__label">В банке</span></div>
      <div class="reconcile-summary__item"><span class="reconcile-summary__value">${totalApp}</span><span class="reconcile-summary__label">В приложении</span></div>
      <div class="reconcile-summary__item"><span class="reconcile-summary__value" style="color: #27ae60;">${totalMatches}</span><span class="reconcile-summary__label">Совпадений</span></div>
      <div class="reconcile-summary__item"><span class="reconcile-summary__value" style="color: #f39c12;">${mismatches.length}</span><span class="reconcile-summary__label">Расхождений</span></div>
    </div>
    ${renderReconcileGroup('✅ Точные совпадения (1 к 1)', 'match', matches, (item) => `<div class="reconcile-item__date">${item.bank.date}</div><div class="reconcile-item__description">${item.bank.description}</div><div class="reconcile-item__amount">${formatMoney(item.bank.amount)}</div>`)}
    ${renderReconcileGroup('✅ Групповые совпадения', 'match', groupMatches, (item) => `<div class="reconcile-item__info" style="width: 100%;"><div class="reconcile-item__date">${item.bank.date}</div><div class="reconcile-item__description" style="font-weight: 600;">${item.bank.description}</div><div style="font-size: 0.9em; color: #27ae60; margin-top: 6px;">Банк: ${formatMoney(item.bank.amount)} | В приложении: ${item.app.length} опер. на ${formatMoney(item.app.reduce((sum, tx) => sum + Math.abs(tx.amount), 0))}</div></div>`)}
    ${renderReconcileGroup('🔴 Не учтено в приложении', 'missing', missingInApp, (item) => `<div class="reconcile-item__info"><div class="reconcile-item__date">${item.date}</div><div class="reconcile-item__description">${item.description}</div></div><div class="reconcile-item__amount">${formatMoney(item.amount)}</div><button class="reconcile-item__action" onclick="addTransactionFromBank('${item.date}', ${item.amount}, '${item.description.replace(/'/g, "\\'")}')">Добавить</button>`)}
    ${renderReconcileGroup('📝 Не отражено в банке', 'extra', missingInBank, (item) => `<div class="reconcile-item__info"><div class="reconcile-item__date">${item.date.includes('T') ? item.date.split('T')[0] : item.date}</div><div class="reconcile-item__description">${item.description || item.category}</div></div><div class="reconcile-item__amount">${formatMoney(item.amount)}</div>`)}
    ${renderHypotheses(pendingHypotheses)}
  `;
}

// ============================================================================
// 4. ГЛОБАЛЬНЫЕ ФУНКЦИИ (для onclick в HTML)
// ============================================================================

window.addTransactionFromBank = function (date, amount, description) {
  const appData = getAppData();
  const newTransaction = {
    id: Date.now().toString(),
    date: date,
    amount: amount,
    category: amount < 0 ? 'Продукты' : 'Доходы',
    subcategory: 'Разное',
    description: description,
    type: amount < 0 ? 'expense' : 'income',
  };
  appData.transactions.push(newTransaction);
  saveData(appData);

  // Перерисовываем интерфейс, если функция renderAll доступна глобально
  if (typeof window.renderAll === 'function') {
    window.renderAll(appData);
  } else {
    location.reload();
  }
  alert(`✅ Транзакция добавлена: ${description} (${formatMoney(amount)})`);
};

window.confirmHypothesis = function (hypothesisKey, btnElement) {
  const appData = getAppData();
  if (!appData.confirmedHypotheses) appData.confirmedHypotheses = [];
  appData.confirmedHypotheses.push(hypothesisKey);
  saveData(appData);

  const item = btnElement.closest('.reconcile-item');
  if (item) {
    item.style.transition = 'opacity 0.3s ease';
    item.style.opacity = '0';
    setTimeout(() => {
      item.style.display = 'none';
    }, 300);
  }

  const group = btnElement.closest('.reconcile-group');
  const title = group.querySelector('.reconcile-group__title');
  const match = title.textContent.match(/\d+/);
  if (match) {
    const newCount = parseInt(match[0]) - 1;
    title.textContent = `⚠️ Требует проверки (${newCount})`;
    const confirmAllBtn = group.querySelector('.reconcile-group__action-all');
    if (confirmAllBtn)
      confirmAllBtn.textContent = `✅ Подтвердить все (${newCount})`;
    if (newCount === 0) {
      group.style.transition = 'opacity 0.3s ease';
      group.style.opacity = '0';
      setTimeout(() => {
        group.style.display = 'none';
      }, 300);
    }
  }
};

window.confirmAllHypotheses = function () {
  if (!confirm('Подтвердить все предложенные гипотезы?')) return;
  const appData = getAppData();
  if (!appData.confirmedHypotheses) appData.confirmedHypotheses = [];

  const items = document.querySelectorAll('#hypotheses-group .reconcile-item');
  items.forEach((item) => {
    const key = item.getAttribute('data-key');
    if (key && !appData.confirmedHypotheses.includes(key)) {
      appData.confirmedHypotheses.push(key);
    }
  });
  saveData(appData);

  const group = document.getElementById('hypotheses-group');
  if (group) {
    group.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    group.style.opacity = '0';
    group.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      group.style.display = 'none';
    }, 300);
  }
};

// ============================================================================
// 5. ИНИЦИАЛИЗАЦИЯ И ОБНОВЛЕНИЕ БАННЕРА (ЕДИНЫЙ БЛОК v2.7)
// ============================================================================

// Делаем функцию глобальной, чтобы её можно было вызвать из любого места
window.updateReconcileBanner = function () {
  const accountNameEl = document.getElementById('reconcile-account-name');
  if (!accountNameEl) return;

  const appData = JSON.parse(localStorage.getItem('pensionBudget') || '{}');
  const defaultAccount = appData.settings?.accounts?.find(
    (acc) => acc.id === appData.settings.defaultAccountId,
  );

  if (defaultAccount && defaultAccount.name) {
    const emoji = defaultAccount.emoji || '🏦';
    accountNameEl.textContent = `${emoji} ${defaultAccount.name}`;
    accountNameEl.style.color = defaultAccount.color || '#2c3e50';
  } else {
    accountNameEl.textContent = '🏦 Счёт по умолчанию';
    accountNameEl.style.color = '#2c3e50';
  }
};

export function initReconcileListeners() {
  const uploadBtn = document.getElementById('reconcile-upload-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      document.getElementById('reconcile-file').click();
    });
  }

  const fileInput = document.getElementById('reconcile-file');
  if (fileInput) {
    fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const bankTransactions = parseCSV(e.target.result);
        reconcileTransactions(bankTransactions);
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  const parseBtn = document.getElementById('reconcile-parse-btn');
  if (parseBtn) {
    parseBtn.addEventListener('click', () => {
      const rawText = document.getElementById('reconcile-raw-text').value.trim();
      if (!rawText) {
        alert('⚠️ Вставьте текст из PDF-выписки');
        return;
      }
      const bankTransactions = parseRawPDFText(rawText);
      if (bankTransactions.length === 0) {
        alert('⚠️ Не удалось найти транзакции в тексте. Проверьте формат выписки.');
        return;
      }
      alert(`✅ Найдено транзакций: ${bankTransactions.length}`);
      reconcileTransactions(bankTransactions);
    });
  }

  // Вызываем обновление баннера при инициализации
  window.updateReconcileBanner();
}

// Автоматическое обновление баннера при появлении экрана сверки
const checkReconcileScreen = setInterval(() => {
  const screen = document.getElementById('screen-reconcile');
  if (screen && screen.style.display !== 'none' && screen.offsetParent !== null) {
    window.updateReconcileBanner();
    clearInterval(checkReconcileScreen); // Останавливаем проверку после первого успешного обновления
  }
}, 200); // Проверяем каждые 200мс

// Вызываем обновление баннера через 1 секунду после загрузки страницы
setTimeout(() => {
  if (window.updateReconcileBanner) {
    window.updateReconcileBanner();
  }
}, 1000);