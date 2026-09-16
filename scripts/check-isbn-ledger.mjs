#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ledgerPath = process.argv[2] ?? 'docs/publishing/SCROLLLIBRARY_PRESS_ISBN_LEDGER.json';
const fullPath = path.resolve(process.cwd(), ledgerPath);

const fail = (message) => {
  console.error(`ISBN_LEDGER_FAIL: ${message}`);
  process.exit(1);
};

const normalize = (value) => String(value ?? '').replace(/[^0-9]/g, '');

const isValidIsbn13 = (value) => {
  const isbn = normalize(value);
  if (!/^(978|979)\d{10}$/.test(isbn)) return false;
  let total = 0;
  for (let i = 0; i < 12; i += 1) {
    total += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const expected = (10 - (total % 10)) % 10;
  return expected === Number(isbn[12]);
};

const makeIsbn = (publisherStem, itemNumber) => {
  const stem = `${publisherStem}${String(itemNumber).padStart(3, '0')}`;
  if (!/^\d{12}$/.test(stem)) fail(`Unexpected publisher stem/item shape: ${stem}`);
  let total = 0;
  for (let i = 0; i < 12; i += 1) {
    total += Number(stem[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (total % 10)) % 10;
  return `${stem}${check}`;
};

if (!fs.existsSync(fullPath)) fail(`Ledger not found: ${ledgerPath}`);

let ledger;
try {
  ledger = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
} catch (error) {
  fail(`Invalid JSON: ${error.message}`);
}

if (ledger.schema !== 'scrolllibrary-press-isbn-ledger-v1') {
  fail(`Unexpected schema: ${ledger.schema}`);
}

const publisher = ledger.publisher ?? {};
const assignments = ledger.assignments;
if (!Array.isArray(assignments)) fail('assignments must be an array');

const publisherPrefix = normalize(publisher.publisher_prefix);
if (publisherPrefix !== '978367620') {
  fail(`Unexpected ScrollLibrary Press publisher prefix: ${publisher.publisher_prefix}`);
}
if (publisher.allocation_size !== 1000) fail('allocation_size must remain 1000');

const expectedFirst = makeIsbn(publisherPrefix, 0);
const expectedLast = makeIsbn(publisherPrefix, 999);
if (normalize(publisher.first_isbn) !== expectedFirst) {
  fail(`first_isbn mismatch: expected ${expectedFirst}`);
}
if (normalize(publisher.last_isbn) !== expectedLast) {
  fail(`last_isbn mismatch: expected ${expectedLast}`);
}

const seenIsbns = new Map();
const seenProductKeys = new Map();
const seenControlIds = new Map();
const usedItemNumbers = new Set();

for (const [index, row] of assignments.entries()) {
  const where = `assignments[${index}]`;
  const isbn = normalize(row.isbn13);
  if (!isValidIsbn13(isbn)) fail(`${where}: invalid ISBN-13 ${row.isbn13}`);
  if (!isbn.startsWith(publisherPrefix)) fail(`${where}: ISBN outside ScrollLibrary Press prefix: ${row.isbn13}`);

  const itemNumber = Number(isbn.slice(9, 12));
  if (!Number.isInteger(itemNumber) || itemNumber < 0 || itemNumber > 999) {
    fail(`${where}: invalid item number in ${row.isbn13}`);
  }
  const expected = makeIsbn(publisherPrefix, itemNumber);
  if (isbn !== expected) fail(`${where}: checksum/range derivation mismatch: ${row.isbn13}`);

  if (seenIsbns.has(isbn)) {
    fail(`${where}: duplicate ISBN ${row.isbn13}; first seen at ${seenIsbns.get(isbn)}`);
  }
  seenIsbns.set(isbn, where);
  usedItemNumbers.add(itemNumber);

  const controlId = String(row.control_id ?? '').trim();
  if (!controlId) fail(`${where}: control_id is required`);
  if (seenControlIds.has(controlId)) {
    fail(`${where}: duplicate control_id ${controlId}; first seen at ${seenControlIds.get(controlId)}`);
  }
  seenControlIds.set(controlId, where);

  for (const field of ['title', 'product_form', 'language', 'edition', 'status']) {
    if (!String(row[field] ?? '').trim()) fail(`${where}: ${field} is required`);
  }

  if (!['reserved', 'assigned', 'published', 'retired'].includes(row.status)) {
    fail(`${where}: invalid status ${row.status}`);
  }

  const productKey = [
    String(row.title).trim().toLowerCase(),
    String(row.product_form).trim().toLowerCase(),
    String(row.language).trim().toLowerCase(),
    String(row.edition).trim().toLowerCase(),
  ].join('|');
  if (seenProductKeys.has(productKey)) {
    fail(`${where}: duplicate title/product/language/edition assignment; first seen at ${seenProductKeys.get(productKey)}`);
  }
  seenProductKeys.set(productKey, where);
}

let nextAvailableItem = null;
for (let i = 0; i < 1000; i += 1) {
  if (!usedItemNumbers.has(i)) {
    nextAvailableItem = i;
    break;
  }
}

const nextAvailable = nextAvailableItem === null ? null : makeIsbn(publisherPrefix, nextAvailableItem);
console.log(`ISBN_LEDGER_PASS: ${assignments.length} assignment(s), ${seenIsbns.size} unique ISBN(s)`);
console.log(`ISBN_LEDGER_RANGE: ${publisher.first_isbn} .. ${publisher.last_isbn}`);
console.log(`ISBN_LEDGER_NEXT_AVAILABLE: ${nextAvailable ?? 'NONE'}`);
