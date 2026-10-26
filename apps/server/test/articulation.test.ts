import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chapterFile, pronunciation } from "@nt/shared";

const contentDir = path.join(__dirname, "../../../content/script");
const letters = fs
  .readdirSync(contentDir)
  .flatMap((f) => chapterFile.parse(JSON.parse(fs.readFileSync(path.join(contentDir, f), "utf8"))).chapter.items)
  .map((i) => i.ne);

describe("pronunciation", () => {
  it("covers every letter in the script chapters", () => {
    expect(letters.length).toBeGreaterThan(60);
    expect(letters.filter((ne) => !pronunciation(ne))).toEqual([]);
  });

  it("reads a bare consonant with the inherent a", () => {
    expect(pronunciation("क")!.steps.map((s) => s.letter)).toEqual(["क", "अ"]);
  });

  it("splits a syllable into consonant and vowel", () => {
    expect(pronunciation("की")!.steps.map((s) => s.letter)).toEqual(["क", "ई"]);
    expect(pronunciation("कं")!.steps.map((s) => s.letter)).toEqual(["क", "अं"]);
  });

  it("splits conjuncts into their consonants", () => {
    expect(pronunciation("क्ष")!.steps.map((s) => s.letter)).toEqual(["क", "ष", "अ"]);
  });

  it("marks aspiration and voicing the way Japanese speakers need to hear it", () => {
    const sound = (ne: string) => pronunciation(ne)!.steps[0]!.sound;
    expect(sound("क")).toMatchObject({ voiced: false, aspirated: false });
    expect(sound("ख")).toMatchObject({ voiced: false, aspirated: true });
    expect(sound("घ")).toMatchObject({ voiced: true, aspirated: true });
    expect(sound("ट")).toMatchObject({ place: "retroflex" });
    expect(sound("त")).toMatchObject({ place: "teeth" });
  });

  it("returns null for things it doesn't know", () => {
    expect(pronunciation("नमस्ते")).toBeNull();
  });
});
