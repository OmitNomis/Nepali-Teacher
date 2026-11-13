import { describe, expect, it } from "vitest";
import { letters, splitLetters } from "@nt/shared";

describe("splitLetters", () => {
  it("keeps vowel signs and conjuncts with their letter", () => {
    expect(letters("धन्यवाद")).toEqual(["ध", "न्य", "वा", "द"]);
    expect(letters("नमस्ते")).toEqual(["न", "म", "स्ते"]);
    expect(letters("गर्नुहोला")).toEqual(["ग", "र्नु", "हो", "ला"]);
  });

  it("keeps nasal marks with the letter they sit on", () => {
    expect(letters("तपाईं")).toEqual(["त", "पा", "ईं"]);
    expect(letters("आउँछ")).toEqual(["आ", "उँ", "छ"]);
    expect(letters("भेटौँला")).toEqual(["भे", "टौँ", "ला"]);
  });

  it("joins a closing dead consonant to the letter before it", () => {
    expect(letters("बोल्नुहोस्")).toEqual(["बो", "ल्नु", "होस्"]);
  });

  it("keeps spaces and punctuation as they are, between the letters", () => {
    const parts = splitLetters("अँ, खाएँ।");
    expect(parts).toEqual([
      { text: "अँ", letter: true },
      { text: ", ", letter: false },
      { text: "खा", letter: true },
      { text: "एँ", letter: true },
      { text: "।", letter: false },
    ]);
    expect(parts.map((p) => p.text).join("")).toBe("अँ, खाएँ।");
  });
});
