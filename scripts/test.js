import assert from 'node:assert/strict';
import { integerToHebrewWords, readParts, numberWords, digitsToHebrewWords } from '../api/_lib/yemot.js';

assert.equal(integerToHebrewWords(8), 'שמונה');
assert.equal(integerToHebrewWords(1000), 'אלף');
assert.match(readParts('אוכלוסייה 8,306,311,087'), /t-שמונה\.t-מיליארד/);
assert.doesNotMatch(readParts('אוכלוסיית העולם.'), /t-העולם\./);
assert.match(readParts('מפלס 209.8'), /t-נקודה/);
assert.equal(digitsToHebrewWords('123-45'), 'אחת שתיים שלוש ארבע חמש');
assert.equal(numberWords('1234'), 'אלף מאתיים שלושים וארבע');
console.log('Unit tests passed');
