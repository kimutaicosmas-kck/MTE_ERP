import { prisma } from "./prisma.js";
import { cacheGet, cacheSet } from "./redis.js";

export type DarajaConfig = {
  env: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortcode: string;
  type: "PAYBILL" | "TILL";
  callbackUrl: string;
  initiator?: string;
  securityCredential?: string;
  partyB?: string;
  paybill?: string;
};

let tokenCache: { token: string; exp: number } | null = null;

export function darajaHost(env: string) {
  return env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

export function normalizeMsisdn(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("7")) return `254${digits}`;
  return digits;
}

export function stkAccountRef(invoiceNumber?: string | null) {
  const raw = String(invoiceNumber || "INVOICE").replace(/^INV-/, "");
  return raw.slice(0, 12);
}

export function timestampNow() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function loadDarajaConfig(): Promise<DarajaConfig> {
  const setting = await prisma.setting.findUnique({ where: { id: "default" } });
  const env = (process.env.DARAJA_ENV || setting?.darajaEnv || "sandbox") === "production" ? "production" : "sandbox";
  const consumerKey = process.env.DARAJA_CONSUMER_KEY || setting?.darajaConsumerKey || "";
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET || setting?.darajaConsumerSecret || "";
  const passkey = process.env.DARAJA_PASSKEY || setting?.darajaPasskey || "";
  const shortcode = process.env.DARAJA_SHORTCODE || setting?.darajaShortcode || setting?.mpesaPaybill || "";
  const type = (setting?.darajaType || "PAYBILL").toUpperCase() === "TILL" ? "TILL" : "PAYBILL";
  const callbackUrl = (process.env.DARAJA_CALLBACK_URL || setting?.darajaCallbackUrl || "").replace(/\/$/, "");
  const initiator = process.env.DARAJA_INITIATOR || setting?.darajaInitiator || "";
  const securityCredential = process.env.DARAJA_SECURITY_CREDENTIAL || setting?.darajaSecurityCredential || "";
  const partyB = setting?.darajaPartyB || shortcode;
  if (!consumerKey || !consumerSecret) throw new Error("Daraja consumer key and secret are not set. Add them in Settings → M-Pesa.");
  if (!shortcode) throw new Error("Daraja shortcode / paybill is not set.");
  if (!callbackUrl) throw new Error("Public callback URL is not set. Use your live HTTPS site, e.g. https://erp.company.com");
  return {
    env,
    consumerKey,
    consumerSecret,
    passkey,
    shortcode,
    type,
    callbackUrl,
    initiator,
    securityCredential,
    partyB,
    paybill: setting?.mpesaPaybill || shortcode,
  };
}

export function darajaStatus(setting: {
  darajaConsumerKey?: string | null;
  darajaConsumerSecret?: string | null;
  darajaPasskey?: string | null;
  darajaShortcode?: string | null;
  mpesaPaybill?: string | null;
  darajaCallbackUrl?: string | null;
  darajaInitiator?: string | null;
  darajaSecurityCredential?: string | null;
  darajaEnv?: string | null;
  darajaType?: string | null;
}) {
  const shortcode = setting.darajaShortcode || setting.mpesaPaybill;
  return {
    env: setting.darajaEnv || "sandbox",
    type: setting.darajaType || "PAYBILL",
    shortcode: shortcode || "",
    callbackUrl: setting.darajaCallbackUrl || "",
    initiatorSet: Boolean(setting.darajaInitiator),
    stkReady: Boolean(setting.darajaConsumerKey && setting.darajaConsumerSecret && setting.darajaPasskey && shortcode && setting.darajaCallbackUrl),
    c2bReady: Boolean(setting.darajaConsumerKey && setting.darajaConsumerSecret && shortcode && setting.darajaCallbackUrl),
    payoutReady: Boolean(setting.darajaConsumerKey && setting.darajaConsumerSecret && shortcode && setting.darajaInitiator && setting.darajaSecurityCredential && setting.darajaCallbackUrl),
    consumerKeySet: Boolean(setting.darajaConsumerKey),
    consumerSecretSet: Boolean(setting.darajaConsumerSecret),
    passkeySet: Boolean(setting.darajaPasskey),
    securityCredentialSet: Boolean(setting.darajaSecurityCredential),
  };
}

async function token(cfg: DarajaConfig) {
  const cached = await cacheGet<{ token: string }>("daraja:token");
  if (cached?.token) return cached.token;
  if (tokenCache && tokenCache.exp > Date.now() + 10_000) return tokenCache.token;
  const basic = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const res = await fetch(`${darajaHost(cfg.env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.errorMessage || "Daraja login failed. Check consumer key and secret.");
  }
  const ttl = Math.max(30, Number(data.expires_in || 3599) - 30);
  tokenCache = { token: data.access_token, exp: Date.now() + ttl * 1000 };
  await cacheSet("daraja:token", { token: data.access_token }, ttl);
  return tokenCache.token;
}

export async function darajaPost(path: string, body: Record<string, unknown>, cfg?: DarajaConfig) {
  const config = cfg || (await loadDarajaConfig());
  const access = await token(config);
  const res = await fetch(`${darajaHost(config.env)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errorCode || (data.ResponseCode && String(data.ResponseCode) !== "0")) {
    throw new Error(data.errorMessage || data.ResponseDescription || data.error_description || `Daraja ${path} failed`);
  }
  return data;
}

export async function testDaraja() {
  const cfg = await loadDarajaConfig();
  tokenCache = null;
  const access = await token(cfg);
  return { ok: true, env: cfg.env, shortcode: cfg.shortcode, type: cfg.type, token: Boolean(access) };
}

export async function stkPush(input: { phone: string; amount: number; accountRef: string; description?: string }) {
  const cfg = await loadDarajaConfig();
  if (!cfg.passkey) throw new Error("Lipa Na M-Pesa passkey is not set.");
  const phone = normalizeMsisdn(input.phone);
  if (!/^2547\d{8}$/.test(phone)) throw new Error("Enter a valid Safaricom number, e.g. 0712 345 678");
  const amount = Math.round(Number(input.amount));
  if (!amount || amount < 1) throw new Error("Amount must be at least KES 1");
  const ts = timestampNow();
  const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${ts}`).toString("base64");
  const buyGoods = cfg.type === "TILL";
  const body = {
    BusinessShortCode: cfg.shortcode,
    Password: password,
    Timestamp: ts,
    TransactionType: buyGoods ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
    Amount: amount,
    PartyA: phone,
    PartyB: buyGoods ? cfg.partyB || cfg.shortcode : cfg.shortcode,
    PhoneNumber: phone,
    CallBackURL: `${cfg.callbackUrl}/api/mpesa/callback/stk`,
    AccountReference: input.accountRef.slice(0, 12),
    TransactionDesc: (input.description || "Invoice").slice(0, 13),
  };
  const data = await darajaPost("/mpesa/stkpush/v1/processrequest", body, cfg);
  return { ...data, request: { ...body, Password: undefined }, phone, amount, cfg };
}

export async function stkQuery(checkoutRequestId: string) {
  const cfg = await loadDarajaConfig();
  const ts = timestampNow();
  return darajaPost("/mpesa/stkpushquery/v1/query", {
    BusinessShortCode: cfg.shortcode,
    Password: Buffer.from(`${cfg.shortcode}${cfg.passkey}${ts}`).toString("base64"),
    Timestamp: ts,
    CheckoutRequestID: checkoutRequestId,
  }, cfg);
}

export async function registerC2B() {
  const cfg = await loadDarajaConfig();
  const body = {
    ShortCode: cfg.shortcode,
    ResponseType: "Completed",
    ConfirmationURL: `${cfg.callbackUrl}/api/mpesa/callback/c2b/confirmation`,
    ValidationURL: `${cfg.callbackUrl}/api/mpesa/callback/c2b/validation`,
  };
  try {
    return await darajaPost("/mpesa/c2b/v2/registerurl", body, cfg);
  } catch {
    return darajaPost("/mpesa/c2b/v1/registerurl", body, cfg);
  }
}

export async function simulateC2B(input: { amount: number; phone: string; billRef: string }) {
  const cfg = await loadDarajaConfig();
  if (cfg.env === "production") throw new Error("C2B simulate is only available in sandbox");
  return darajaPost("/mpesa/c2b/v1/simulate", {
    ShortCode: cfg.shortcode,
    CommandID: cfg.type === "TILL" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
    Amount: Math.round(Number(input.amount)),
    Msisdn: normalizeMsisdn(input.phone),
    BillRefNumber: input.billRef,
  }, cfg);
}

function initiatorBody(cfg: DarajaConfig, extra: Record<string, unknown>) {
  if (!cfg.initiator || !cfg.securityCredential) {
    throw new Error("Initiator name and security credential are required for this Daraja API.");
  }
  return {
    Initiator: cfg.initiator,
    SecurityCredential: cfg.securityCredential,
    PartyA: cfg.shortcode,
    QueueTimeOutURL: `${cfg.callbackUrl}/api/mpesa/callback/timeout`,
    ResultURL: `${cfg.callbackUrl}/api/mpesa/callback/result`,
    Remarks: "MTE ERP",
    Occasion: "MTE",
    ...extra,
  };
}

export async function queryTransaction(transId: string) {
  const cfg = await loadDarajaConfig();
  return darajaPost("/mpesa/transactionstatus/v1/query", initiatorBody(cfg, {
    CommandID: "TransactionStatusQuery",
    TransactionID: transId,
    IdentifierType: "4",
    Remarks: "Status query",
  }), cfg);
}

export async function queryBalance() {
  const cfg = await loadDarajaConfig();
  return darajaPost("/mpesa/accountbalance/v1/query", initiatorBody(cfg, {
    CommandID: "AccountBalance",
    IdentifierType: "4",
    Remarks: "Balance",
  }), cfg);
}

export async function reversePayment(input: { transId: string; amount: number; remarks?: string }) {
  const cfg = await loadDarajaConfig();
  return darajaPost("/mpesa/reversal/v1/request", initiatorBody(cfg, {
    CommandID: "TransactionReversal",
    TransactionID: input.transId,
    Amount: Math.round(Number(input.amount)),
    ReceiverParty: cfg.shortcode,
    RecieverIdentifierType: "11",
    Remarks: (input.remarks || "Reversal").slice(0, 100),
  }), cfg);
}

export async function b2cPayout(input: { phone: string; amount: number; remarks?: string; occasion?: string; command?: string }) {
  const cfg = await loadDarajaConfig();
  const phone = normalizeMsisdn(input.phone);
  if (!/^2547\d{8}$/.test(phone)) throw new Error("Enter a valid Safaricom number");
  return darajaPost("/mpesa/b2c/v1/paymentrequest", initiatorBody(cfg, {
    CommandID: input.command || "BusinessPayment",
    Amount: Math.round(Number(input.amount)),
    PartyB: phone,
    Remarks: (input.remarks || "Payout").slice(0, 100),
    Occasion: (input.occasion || "Payout").slice(0, 100),
  }), cfg);
}

export function stkItems(body: any) {
  const cb = body?.Body?.stkCallback || body?.stkCallback || {};
  const items = cb.CallbackMetadata?.Item || [];
  const get = (name: string) => items.find((i: any) => i.Name === name)?.Value;
  return {
    merchantRequest: String(cb.MerchantRequestID || ""),
    checkoutRequest: String(cb.CheckoutRequestID || ""),
    resultCode: String(cb.ResultCode ?? ""),
    resultDesc: String(cb.ResultDesc || ""),
    amount: Number(get("Amount") || 0),
    receipt: String(get("MpesaReceiptNumber") || ""),
    phone: String(get("PhoneNumber") || ""),
    transactionDate: String(get("TransactionDate") || ""),
  };
}

export function resultParams(body: any) {
  const result = body?.Result || body;
  const items = result?.ResultParameters?.ResultParameter || [];
  const get = (name: string) => items.find((i: any) => i.Key === name)?.Value;
  return {
    conversationId: String(result?.ConversationID || ""),
    originatorConv: String(result?.OriginatorConversationID || ""),
    resultCode: String(result?.ResultCode ?? ""),
    resultDesc: String(result?.ResultDesc || ""),
    receipt: String(get("TransactionReceipt") || get("ReceiptNo") || ""),
    amount: Number(get("TransactionAmount") || get("Amount") || 0),
    phone: String(get("ReceiverPartyPublicName") || ""),
    balance: String(get("AccountBalance") || ""),
    transId: String(get("TransactionID") || result?.TransactionID || ""),
  };
}
