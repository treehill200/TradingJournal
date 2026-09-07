import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_ALPHABET, CODE_GROUPS, CODE_GROUP_LEN, CODE_LENGTH,
  makeRecoveryCode, normalizeRecoveryCode,
} from "../src/lib/recovery-codes";

describe("recovery codes", () => {
  it("are grouped for legibility", () => {
    const code = makeRecoveryCode();
    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(normalizeRecoveryCode(code).length, CODE_LENGTH);
  });

  it("avoid characters that are misread on paper", () => {
    for (const bad of ["O", "0", "I", "1", "L"]) {
      assert.equal(CODE_ALPHABET.includes(bad), false, `${bad} should not be in the alphabet`);
    }
    const sample = Array.from({ length: 200 }, makeRecoveryCode).join("");
    assert.equal(/[OIL01]/.test(sample), false);
  });

  it("carry enough entropy to be unguessable", () => {
    // 31 symbols over 12 places is ~59 bits, well past brute force.
    const bits = Math.log2(CODE_ALPHABET.length) * CODE_GROUPS * CODE_GROUP_LEN;
    assert.ok(bits > 55, `only ${bits.toFixed(1)} bits of entropy`);
  });

  it("do not repeat", () => {
    const codes = new Set(Array.from({ length: 2000 }, makeRecoveryCode));
    assert.equal(codes.size, 2000);
  });

  it("forgive how a person retypes them", () => {
    const canonical = normalizeRecoveryCode("P8CD-T25C-4ZNY");
    for (const typed of [
      "p8cd-t25c-4zny", "P8CD T25C 4ZNY", "  P8CDT25C4ZNY  ", "p8cd t25c-4ZNY",
    ]) {
      assert.equal(normalizeRecoveryCode(typed), canonical, `failed on ${JSON.stringify(typed)}`);
    }
  });

  it("do not silently accept a truncated code", () => {
    assert.ok(normalizeRecoveryCode("P8CD-T25C").length < CODE_LENGTH);
  });
});
