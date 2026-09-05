/**
 * Math utility functions.
 * @module src/utils/math
 */

/**
 * Clamp `n` into the inclusive range [lo, hi].
 *
 * @param {number} n - value to clamp
 * @param {number} lo - lower bound
 * @param {number} hi - upper bound
 * @returns {number} lo if n < lo, hi if n > hi, otherwise n
 */
export function clamp(n, lo, hi) {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/**
 * Sum of all elements. Empty array returns 0.
 *
 * @param {number[]} arr
 * @returns {number}
 */
export function sum(arr) {
  let total = 0;
  for (const v of arr) {
    total += v;
  }
  return total;
}

/**
 * Arithmetic mean. Throws RangeError on empty array.
 *
 * @param {number[]} arr
 * @returns {number}
 * @throws {RangeError} when arr is empty
 */
export function average(arr) {
  if (arr.length === 0) {
    throw new RangeError('average() requires a non-empty array');
  }
  return sum(arr) / arr.length;
}
