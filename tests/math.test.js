import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, sum, average } from '../src/utils/math.js';

test('clamp returns lo when n is below the range', () => {
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(-0.1, 0, 1), 0);
});

test('clamp returns hi when n is above the range', () => {
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(1.5, 0, 1), 1);
});

test('clamp returns n when n is within the range, including boundaries', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});

test('clamp works with negative bounds and values', () => {
  assert.equal(clamp(-20, -10, -1), -10);
  assert.equal(clamp(0, -10, -1), -1);
  assert.equal(clamp(-5, -10, -1), -5);
});

test('sum adds all elements', () => {
  assert.equal(sum([1, 2, 3, 4]), 10);
});

test('sum of empty array is 0', () => {
  assert.equal(sum([]), 0);
});

test('sum handles negative numbers', () => {
  assert.equal(sum([-1, -2, 3]), 0);
  assert.equal(sum([-5, -10]), -15);
});

test('sum of single element returns that element', () => {
  assert.equal(sum([42]), 42);
});

test('average computes the arithmetic mean', () => {
  assert.equal(average([2, 4, 6]), 4);
  assert.equal(average([1, 2]), 1.5);
});

test('average of empty array throws RangeError', () => {
  assert.throws(() => average([]), RangeError);
});

test('average handles negative numbers', () => {
  assert.equal(average([-2, -4, -6]), -4);
  assert.equal(average([-1, 1]), 0);
});

test('average of single element returns that element', () => {
  assert.equal(average([7]), 7);
});
