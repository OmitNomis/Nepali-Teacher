import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/db";
import {
  ConflictError,
  createChapter,
  createItem,
  exportChapter,
  getChapter,
  importChapter,
  listChapters,
  updateItem,
} from "../src/content";

let db: Db;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nt-test-"));
  db = openDb(path.join(dir, "test.db"), path.join(__dirname, "../drizzle"));
});

describe("importChapter", () => {
  it("creates a chapter with hand-written ids", () => {
    const res = importChapter(db, {
      version: 1,
      chapter: {
        id: "vowels",
        track: "script",
        titleJa: "母音",
        titleNe: "स्वर",
        descriptionJa: "",
        items: [
          { id: "v-a", kind: "letter", ne: "अ", ja: "", roman: "a", note: "" },
          { id: "v-aa", kind: "letter", ne: "आ", ja: "", roman: "ā", note: "" },
        ],
      },
    });
    expect(res).toEqual({ chapterId: "vowels", created: 2, updated: 0, untouched: 0 });
    expect(getChapter(db, "vowels", { includeArchived: false }).items.map((i) => i.id)).toEqual([
      "v-a",
      "v-aa",
    ]);
  });

  it("updates in place and moves leftovers after imported items", () => {
    const chapterId = createChapter(db, { track: "phrases", titleJa: "あいさつ", titleNe: "", descriptionJa: "" });
    const a = createItem(db, chapterId, { kind: "phrase", ne: "नमस्ते", ja: "", roman: "", note: "" });
    const b = createItem(db, chapterId, { kind: "phrase", ne: "धन्यवाद", ja: "", roman: "", note: "" });

    const file = exportChapter(db, chapterId);
    file.chapter.items = [{ ...file.chapter.items[0]!, ja: "こんにちは" }, { kind: "phrase", ne: "फेरि भेटौँला", ja: "またね", roman: "", note: "" }];
    const res = importChapter(db, file);

    expect(res).toMatchObject({ created: 1, updated: 1, untouched: 1 });
    const after = getChapter(db, chapterId, { includeArchived: false }).items;
    expect(after.map((i) => i.ne)).toEqual(["नमस्ते", "फेरि भेटौँला", "धन्यवाद"]);
    expect(after[0]!.ja).toBe("こんにちは");
    expect(after[2]!.id).toBe(b.id);
  });

  it("rejects stealing an item from another chapter and rolls back", () => {
    const c1 = createChapter(db, { track: "phrases", titleJa: "A", titleNe: "", descriptionJa: "" });
    const item = createItem(db, c1, { kind: "word", ne: "पानी", ja: "水", roman: "", note: "" });
    expect(() =>
      importChapter(db, {
        version: 1,
        chapter: {
          track: "phrases",
          titleJa: "B",
          titleNe: "",
          descriptionJa: "",
          items: [{ id: item.id, kind: "word", ne: "पानी", ja: "", roman: "", note: "" }],
        },
      }),
    ).toThrow(ConflictError);
    expect(listChapters(db, { includeArchived: true })).toHaveLength(1);
  });
});

describe("patch schemas", () => {
  it("leave omitted fields alone instead of resetting them to defaults", async () => {
    const { itemPatch, chapterPatch } = await import("@nt/shared");
    expect(itemPatch.parse({ archived: true })).toEqual({ archived: true });
    expect(chapterPatch.parse({ archived: true })).toEqual({ archived: true });
  });

  it("archiving an item keeps its translation", () => {
    const c = createChapter(db, { track: "phrases", titleJa: "A", titleNe: "", descriptionJa: "" });
    const item = createItem(db, c, { kind: "word", ne: "पानी", ja: "水", roman: "pānī", note: "", register: null, group: "" });
    updateItem(db, item.id, { archived: true });
    expect(getChapter(db, c, { includeArchived: true }).items[0]).toMatchObject({ ja: "水", roman: "pānī" });
  });
});

describe("listChapters", () => {
  it("counts items and missing audio, skipping archived items", () => {
    const c = createChapter(db, { track: "script", titleJa: "母音", titleNe: "", descriptionJa: "" });
    createItem(db, c, { kind: "letter", ne: "अ", ja: "", roman: "", note: "" });
    const gone = createItem(db, c, { kind: "letter", ne: "आ", ja: "", roman: "", note: "" });
    updateItem(db, gone.id, { archived: true });
    expect(listChapters(db, { includeArchived: false })[0]).toMatchObject({ itemCount: 1, missingAudio: 1 });
  });
});
