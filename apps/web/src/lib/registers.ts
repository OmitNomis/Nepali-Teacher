import type { Register } from "@nt/shared";

export const REGISTER_INFO: Record<Register, { ja: string; pronoun: string; hint: string; admin: string }> = {
  polite: { ja: "丁寧", pronoun: "तपाईं", hint: "目上の人・初対面・家族の年上に", admin: "Polite" },
  casual: { ja: "タメ口", pronoun: "तिमी", hint: "友達・恋人・年下に", admin: "Casual" },
  intimate: { ja: "ぞんざい", pronoun: "तँ", hint: "ごく親しい仲、または乱暴な言い方", admin: "Intimate" },
};

export const REGISTER_ORDER: Register[] = ["polite", "casual", "intimate"];
