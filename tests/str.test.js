import test from "node:test";
import { strict as assert } from "node:assert";
import { capitalize, truncate, slugify } from "../src/utils/str.js";

test("capitalize: 첫 글자를 대문자로 변환한다", () => {
  assert.strictEqual(capitalize("hello"), "Hello");
  assert.strictEqual(capitalize("korean text"), "Korean text");
});

test("capitalize: 첫 글자 외에는 원본 그대로 유지한다", () => {
  assert.strictEqual(capitalize("hELLO wORLD"), "HELLO wORLD");
  assert.strictEqual(capitalize("aBc123!@#"), "ABc123!@#");
});

test("capitalize: 빈 문자열은 빈 문자열을 반환한다", () => {
  assert.strictEqual(capitalize(""), "");
});

test("capitalize: 한 글자 문자열을 처리한다", () => {
  assert.strictEqual(capitalize("a"), "A");
  assert.strictEqual(capitalize("A"), "A");
});

test("truncate: 길이가 n보다 작으면 원본 그대로 반환한다", () => {
  assert.strictEqual(truncate("hello", 10), "hello");
});

test("truncate: 길이가 n과 정확히 같으면(경계값) 원본 그대로 반환한다", () => {
  assert.strictEqual(truncate("hello", 5), "hello");
  assert.strictEqual(truncate("abc", 3), "abc");
});

test("truncate: 길이가 n보다 크면 앞 n자 + '…' 를 반환한다", () => {
  assert.strictEqual(truncate("hello world", 5), "hello…");
  assert.strictEqual(truncate("abcdef", 3), "abc…");
});

test("truncate: 빈 문자열은 어떤 n에 대해서도 빈 문자열이다", () => {
  assert.strictEqual(truncate("", 0), "");
  assert.strictEqual(truncate("", 5), "");
});

test("truncate: n이 0이면 비어 있지 않은 문자열은 '…'만 남는다", () => {
  assert.strictEqual(truncate("hello", 0), "…");
});

test("slugify: 소문자로 변환하고 공백을 하이픈으로 바꾼다", () => {
  assert.strictEqual(slugify("Hello World"), "hello-world");
  assert.strictEqual(slugify("My Blog Post"), "my-blog-post");
});

test("slugify: [a-z0-9-] 외 문자를 제거한다", () => {
  assert.strictEqual(slugify("Hello, World!"), "hello-world");
  assert.strictEqual(slugify("a_b-c"), "ab-c");
  assert.strictEqual(slugify("foo@bar.com"), "foobarcom");
});

test("slugify: 기존 하이픈과 숫자는 유지한다", () => {
  assert.strictEqual(slugify("Version 2 Release"), "version-2-release");
  assert.strictEqual(slugify("already-slugged-123"), "already-slugged-123");
});

test("slugify: 빈 문자열은 빈 문자열을 반환한다", () => {
  assert.strictEqual(slugify(""), "");
});

test("slugify: 특수문자만 있는 문자열은 빈 문자열이 된다", () => {
  assert.strictEqual(slugify("!!!???"), "");
});
