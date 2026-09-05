/**
 * 문자열 유틸리티 모듈
 * @module utils/str
 */

/**
 * 첫 글자를 대문자로 변환하고 나머지는 그대로 둔다.
 * @param {string} s - 대상 문자열
 * @returns {string} 변환된 문자열 (빈 문자열 입력 시 빈 문자열)
 */
export function capitalize(s) {
  if (s === "") return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * 문자열이 n자 이하면 그대로 반환하고, 초과하면 앞 n자 + "…" 로 자른다.
 * @param {string} s - 대상 문자열
 * @param {number} n - 유지할 최대 길이
 * @returns {string} 잘린 문자열
 */
export function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

/**
 * 문자열을 slug로 변환한다: 소문자화, 공백→하이픈, [a-z0-9-] 외 문자 제거.
 * @param {string} s - 대상 문자열
 * @returns {string} slug 문자열
 */
export function slugify(s) {
  return s
    .toLowerCase()
    .replaceAll(" ", "-")
    .replace(/[^a-z0-9-]/g, "");
}
