import { randomBytes } from "node:crypto";

export const newId = () => randomBytes(9).toString("base64url");
