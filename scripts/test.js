import assert from 'node:assert/strict';
import { integerToHebrewWords, readParts, numberWords } from '../api/_lib/yemot.js';

assert.equal(integerToHebrewWords(8), 'שמונה');
assert.equal(integerToHebrewWords(1000), 'אחת אלף');
assert.match(readParts('אוכלוסייה 8,306,311,087'), /t-שמונה\.t-מיליארד/);
assert.match(readParts('מפלס 209.8'), /t-נקודה/);
assert.equal(numberWords('1234'), 'אחת אלף מאתיים שלושים וארבע');
console.log('Unit tests passed');
