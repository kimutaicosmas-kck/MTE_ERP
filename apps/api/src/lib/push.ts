import webpush from "web-push";
import { prisma } from "./prisma.js";
import { canModule } from "./access.js";
import { ensureCompany } from "./sequence.js";

export async function vapidKeys() {
  const { setting } = await ensureCompany();
  if (setting.vapidPublic && setting.vapidPrivate) {
    return { publicKey: setting.vapidPublic, privateKey: setting.vapidPrivate };
  }
  const keys = webpush.generateVAPIDKeys();
  await prisma.setting.update({
    where: { id: "default" },
    data: { vapidPublic: keys.publicKey, vapidPrivate: keys.privateKey },
  });
  return keys;
}

async function ready() {
  const keys = await vapidKeys();
  webpush.setVapidDetails("mailto:superadmin@mte.local", keys.publicKey, keys.privateKey);
  return keys;
}

export async function notifyUsers(userIds: string[], payload: { title: string; body: string; url?: string }) {
  if (!userIds.length) return;
  await prisma.notice.createMany({
    data: userIds.map((userId) => ({
      userId,
      title: payload.title,
      body: payload.body,
      url: payload.url || "/",
    })),
  });
  await ready();
  const subs = await prisma.pushSub.findMany({ where: { userId: { in: userIds } } });
  const body = JSON.stringify({ ...payload, url: payload.url || "/" });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSub.delete({ where: { id: sub.id } }).catch(() => undefined);
        }
      }
    })
  );
}

export async function notifyRoles(roles: string[], payload: { title: string; body: string; url?: string }) {
  const users = await prisma.user.findMany({ where: { role: { in: roles }, active: true }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), payload);
}

export async function notifyModule(moduleId: string, payload: { title: string; body: string; url?: string }) {
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, role: true, modules: true } });
  await notifyUsers(users.filter((u) => canModule(u, moduleId)).map((u) => u.id), payload);
}

export async function notifyEvent(event: string, data: any) {
  const title = "MTE ERP";
  if (event === "order.created" || event === "order.status") {
    const number = data?.number || data?.to || "order";
    if (event === "order.created" || data?.to === "CONFIRMED") {
      await notifyModule("dispatch", {
        title,
        body: `New order received · ${number}`,
        url: data?.id ? `/sales/${data.id}` : "/sales",
      });
    }
  }
  if (event === "payment.recorded") {
    await notifyModule("finance", {
      title,
      body: `Payment received · ${data?.number || data?.payment?.amount || ""}`,
      url: "/finance",
    });
  }
  if (event === "stock.low") {
    await notifyModule("inventory", {
      title,
      body: `Low stock · ${data?.sku || "part"} (${data?.qtyOnHand ?? ""} on hand)`,
      url: "/inventory",
    });
  }
  if (event === "approval.requested") {
    await notifyModule("approvals", {
      title,
      body: `Approval request · ${data?.type || "review needed"}`,
      url: "/approvals",
    });
  }
  if (event === "purchase.created") {
    await notifyModule("procurement", {
      title,
      body: `Purchase order · ${data?.number || ""}`,
      url: data?.id ? `/procurement/${data.id}` : "/procurement",
    });
  }
}
