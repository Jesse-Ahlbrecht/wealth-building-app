import * as XLSX from 'xlsx';

const parseDelimitedLine = (line, delimiter) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => normalizeCell(value));
};

const normalizeCell = (value = '') => {
  const trimmed = value.replace(/^\uFEFF/, '').trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const parseRows = (lines, delimiter, headerIndex) => {
  const header = parseDelimitedLine(lines[headerIndex], delimiter);
  const rows = [];

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const values = parseDelimitedLine(line, delimiter);
    const row = {};
    header.forEach((key, columnIndex) => {
      row[key] = values[columnIndex] || '';
    });
    rows.push(row);
  }

  return rows;
};

const parseAmount = (value, { decimalComma = false } = {}) => {
  if (!value) return 0;
  const cleaned = String(value)
    .replace(/\s/g, '')
    .replace(/[\u20ac$A-Z]{3}|[\u20ac$]/gi, '');
  const normalized = decimalComma
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/'/g, '').replace(',', '.');
  return Number.parseFloat(normalized) || 0;
};

const formatIsoDate = (value, format) => {
  if (!value) return null;
  let day;
  let month;
  let year;

  if (format === 'dkb') {
    [day, month, year] = String(value).trim().split('.').map((part) => part.trim());
    if (year && year.length === 2) {
      year = `20${year}`;
    }
  } else if (format === 'yuh') {
    [day, month, year] = String(value).trim().split('/').map((part) => part.trim());
  } else if (format === 'swisscard') {
    [day, month, year] = String(value).trim().split('.').map((part) => part.trim());
  } else if (format === 'amazon_visa') {
    [day, month, year] = String(value).trim().split('.').map((part) => part.trim());
  }

  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const buildBatch = ({
  accountName,
  currency,
  sourceType,
  filename,
  checksum,
  currentBalance,
  transactions
}) => {
  const sortedTransactions = [...transactions].sort((left, right) => left.date.localeCompare(right.date));
  return {
    accountName,
    currency,
    sourceType,
    filename,
    checksum,
    currentBalance,
    statementStartDate: sortedTransactions[0]?.date || null,
    statementEndDate: sortedTransactions[sortedTransactions.length - 1]?.date || null,
    transactions: sortedTransactions
  };
};

const parseDkb = (text, filename, checksum) => {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headerIndex = lines.findIndex((line) => {
    const normalized = line.replace(/"/g, '');
    return /Buchungstag|Buchungsdatum|Buchung/.test(normalized) && /Betrag/.test(normalized);
  });
  if (headerIndex < 0) {
    throw new Error('Could not find DKB header row');
  }

  let accountName = 'DKB';
  for (const line of [filename, ...lines.slice(0, 6)]) {
    const normalized = line.replace(/"/g, '');
    if (normalized.includes('Girokonto')) accountName = 'DKB Girokonto';
    if (normalized.includes('Tagesgeld')) accountName = 'DKB Tagesgeld';
  }

  let currentBalance;
  for (const line of lines.slice(0, 12)) {
    if (line.includes('Kontostand vom')) {
      const parts = parseDelimitedLine(line, ';');
      currentBalance = parseAmount(parts[1] || '', { decimalComma: true });
      break;
    }
  }

  const rows = parseRows(lines, ';', headerIndex);
  const transactions = rows
    .map((row) => {
      if (row.Status && row.Status !== 'Gebucht') return null;

      const date = formatIsoDate(
        row.Buchungstag || row.Buchungsdatum || row.Buchung || row['"Buchungstag"'] || row['"Buchungsdatum"'],
        'dkb'
      );
      if (!date) return null;

      const rawAmount = row.Betrag || row['Betrag (€)'] || row['"Betrag"'] || row['"Betrag (€)"'];
      const amount = parseAmount(rawAmount, { decimalComma: true });
      if (!amount) return null;

      return {
        date,
        amount: Math.abs(amount),
        currency: row.Währung || 'EUR',
        type: amount > 0 ? 'income' : 'expense',
        recipient: row['Empfänger/Auftraggeber'] || row.Empfänger || row['Zahlungsempfänger*in'] || row['Zahlungspflichtige*r'] || '',
        description: row.Verwendungszweck || row.Buchungstext || '',
        bankCategory: row.Umsatzkategorie || row['"Umsatzkategorie"'] || '',
        bankSubcategory: row.Unterkategorie || row['"Unterkategorie"'] || '',
        bankSource: 'dkb',
        reference: ''
      };
    })
    .filter(Boolean);

  return [buildBatch({
    accountName,
    currency: 'EUR',
    sourceType: 'dkb_csv',
    filename,
    checksum,
    currentBalance,
    transactions
  })];
};

const parseYuh = (text, filename, checksum) => {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headerIndex = lines.findIndex((line) => line.includes('DATE') && line.includes('ACTIVITY'));
  if (headerIndex < 0) {
    throw new Error('Could not find YUH header row');
  }

  const rows = parseRows(lines, ';', headerIndex);
  const grouped = new Map();

  const pushTransaction = (accountName, transaction) => {
    if (!grouped.has(accountName)) {
      grouped.set(accountName, []);
    }
    grouped.get(accountName).push(transaction);
  };

  rows.forEach((row) => {
    const activityType = row['ACTIVITY TYPE'] || '';
    if (activityType === 'REWARD_RECEIVED') return;

    const date = formatIsoDate(row.DATE, 'yuh');
    if (!date) return;

    const debit = row.DEBIT ? parseAmount(row.DEBIT) : 0;
    const credit = row.CREDIT ? parseAmount(row.CREDIT) : 0;
    let amount = 0;
    let type = 'expense';
    if (debit) {
      amount = Math.abs(debit);
      type = 'expense';
    } else if (credit) {
      amount = Math.abs(credit);
      type = 'income';
    } else {
      return;
    }

    const recipient = row.RECIPIENT || row['ACTIVITY NAME'] || '';
    const description = [row['ACTIVITY NAME'], row.LOCALITY].filter(Boolean).join(' ');
    const goalName = row.RECIPIENT || row.LOCALITY || '';
    const accountName = activityType.startsWith('GOAL_') && goalName ? `YUH - ${goalName}` : 'YUH';

    pushTransaction(accountName, {
      date,
      amount,
      currency: row['DEBIT CURRENCY'] || row['CREDIT CURRENCY'] || 'CHF',
      type,
      recipient,
      description,
      reference: ''
    });
  });

  return Array.from(grouped.entries()).map(([accountName, transactions]) => buildBatch({
    accountName,
    currency: 'CHF',
    sourceType: 'yuh_csv',
    filename,
    checksum,
    transactions
  }));
};

const parseSwisscard = (text, filename, checksum) => {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headerIndex = lines.findIndex((line) => line.includes('Transaktionsdatum') && line.includes('Kartennummer'));
  if (headerIndex < 0) {
    throw new Error('Could not find Swisscard header row');
  }

  const rows = parseRows(lines, ',', headerIndex);
  const grouped = new Map();

  rows.forEach((row) => {
    if (row.Status && row.Status !== 'Gebucht') return;

    const date = formatIsoDate(row.Transaktionsdatum, 'swisscard');
    if (!date) return;

    const amount = parseAmount(row.Betrag);
    if (!amount) return;

    const cardDigits = (row.Kartennummer || '').replace(/\D/g, '').slice(-4);
    const accountName = cardDigits ? `Swisscard ${cardDigits}` : 'Swisscard';
    if (!grouped.has(accountName)) {
      grouped.set(accountName, []);
    }

    grouped.get(accountName).push({
      date,
      amount: Math.abs(amount),
      currency: row.Währung || 'CHF',
      type: (row['Debit/Kredit'] || '').toLowerCase() === 'belastung' ? 'expense' : 'income',
      recipient: row.Händler || row.Beschreibung || '',
      description: row.Beschreibung || '',
      reference: ''
    });
  });

  return Array.from(grouped.entries()).map(([accountName, transactions]) => buildBatch({
    accountName,
    currency: 'CHF',
    sourceType: 'swisscard_csv',
    filename,
    checksum,
    transactions
  }));
};

const parseAmazonVisaWorkbook = (arrayBuffer, filename, checksum) => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Amazon Visa workbook has no sheets');
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    raw: false,
    defval: ''
  });

  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeCell(String(cell)));
    return normalized.includes('Datum') && normalized.includes('Beschreibung') && normalized.includes('Betrag');
  });

  if (headerIndex < 0) {
    throw new Error('Could not find Amazon Visa header row');
  }

  const header = rows[headerIndex].map((cell) => normalizeCell(String(cell)));
  const columnIndex = (name) => header.indexOf(name);
  const dateIndex = columnIndex('Datum');
  const cardIndex = columnIndex('Karte');
  const descriptionIndex = columnIndex('Beschreibung');
  const categoryIndex = columnIndex('Umsatzkategorie');
  const subcategoryIndex = columnIndex('Unterkategorie');
  const amountIndex = columnIndex('Betrag');

  const grouped = new Map();

  rows.slice(headerIndex + 1).forEach((row) => {
    const date = formatIsoDate(row[dateIndex], 'amazon_visa');
    if (!date) return;

    const amount = parseAmount(row[amountIndex], { decimalComma: true });
    if (!amount) return;

    const cardDigits = String(row[cardIndex] || '').replace(/\D/g, '').slice(-4);
    const accountName = cardDigits ? `Amazon Visa ${cardDigits}` : 'Amazon Visa';
    if (!grouped.has(accountName)) {
      grouped.set(accountName, []);
    }

    const description = normalizeCell(String(row[descriptionIndex] || ''));
    const category = normalizeCell(String(row[categoryIndex] || ''));
    const subcategory = normalizeCell(String(row[subcategoryIndex] || ''));

    grouped.get(accountName).push({
      date,
      amount: Math.abs(amount),
      currency: 'EUR',
      type: amount > 0 ? 'income' : 'expense',
      recipient: description,
      description: [category, subcategory].filter(Boolean).join(' - '),
      bankCategory: category,
      bankSubcategory: subcategory,
      bankSource: 'amazon_visa',
      reference: ''
    });
  });

  return Array.from(grouped.entries()).map(([accountName, transactions]) => buildBatch({
    accountName,
    currency: 'EUR',
    sourceType: 'amazon_visa_xls',
    filename,
    checksum,
    transactions
  }));
};

const stripBom = (text) => text.replace(/^\uFEFF/, '');

const isIbkrFlexCsv = (text, filename = '') => {
  const preview = stripBom(text.slice(0, 512));
  const normalized = preview.replace(/"/g, '');
  if (/^BOF[,;]/.test(normalized)) return true;
  const lowerName = (filename || '').toLowerCase();
  return lowerName.includes('wealth_app_activity') || lowerName.includes('ibkr');
};

const detectParser = (text, filename = '') => {
  if (isIbkrFlexCsv(text, filename)) return null;
  const preview = text.slice(0, 2000);
  const normalizedPreview = preview.replace(/"/g, '').replace(/^\uFEFF/, '');
  if (/Transaktionsdatum,Beschreibung,Händler,Kartennummer/.test(normalizedPreview)) return parseSwisscard;
  if (/DATE;.*ACTIVITY/.test(normalizedPreview) || /DATE;.*DEBIT;.*CREDIT/.test(normalizedPreview)) return parseYuh;
  if (/(Buchungstag|Buchungsdatum|Buchung).*Betrag/.test(normalizedPreview)) return parseDkb;
  throw new Error('Unsupported CSV format. Supported imports: DKB, YUH, Swisscard, Amazon Visa XLS, Interactive Brokers Flex CSV.');
};

export const classifyImportFile = async (file) => {
  const header = stripBom(await file.slice(0, 512).text());
  if (isIbkrFlexCsv(header, file.name)) {
    return { kind: 'broker', documentType: 'broker_ibkr_csv' };
  }
  return { kind: 'bank' };
};

const sha256 = async (input) => {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((value) => value.toString(16).padStart(2, '0')).join('');
};

export const parseImportFile = async (file) => {
  if (/\.(xls|xlsx)$/i.test(file.name)) {
    const arrayBuffer = await file.arrayBuffer();
    const checksum = await sha256(arrayBuffer);
    return parseAmazonVisaWorkbook(arrayBuffer, file.name, checksum);
  }

  const text = await file.text();
  const checksum = await sha256(text);
  const parser = detectParser(text, file.name);
  if (!parser) {
    throw new Error('Interactive Brokers Flex CSV must be uploaded as a broker document.');
  }
  return parser(text, file.name, checksum);
};
