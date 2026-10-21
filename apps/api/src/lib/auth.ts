import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const SECRET = process.env.JWT_SECRET || "mte-erp-local-dev-secret-change-in-production";

export type TokenUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  sid?: string;
};

export function signToken(user: TokenUser) {
  return jwt.sign(user, SECRET, { expiresIn: "12h" });
}

export function signTicket(payload: object, expiresIn: jwt.SignOptions["expiresIn"] = "5m") {
  return jwt.sign(payload, SECRET, { expiresIn });
}

export function verifyToken(token: string): TokenUser {
  return jwt.verify(token, SECRET) as TokenUser;
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function checkPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export const SENSITIVE = new Set([
  "DELETE_ORDER",
  "DELETE_PART",
  "DELETE_CUSTOMER",
  "DELETE_EXPENSE",
  "EDIT_PRICE",
  "EDIT_PART",
  "EDIT_CUSTOMER",
  "ADJUST_STOCK",
  "CANCEL_ORDER",
  "SALES_RETURN",
  "VOID_PAYMENT",
  "REFUND",
  "CREDIT_OVERRIDE",
  "POST_JOURNAL",
  "REVERSE_JOURNAL",
  "UNLOCK_PERIOD",
  "USER_SENSITIVE",
]);

export function canBypassApproval(role: string) {
  return role === "SUPER_ADMIN";
}
