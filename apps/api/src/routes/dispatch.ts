import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { moduleAccess } from "../middleware/auth.js";
import { DISPATCH_LABELS } from "../lib/dispatch-workflow.js";

export const dispatchRouter = Router();

function dayStart(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

dispatchRouter.get("/dashboard", moduleAccess("dispatch"), async (req, res) => {
  const start = dayStart();
  const end = dayStart(1);
  const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
  const where = {
    status: { notIn: ["DRAFT", "PAID"] as string[] },
    ...(branchId ? { branchId } : {}),
  };

  const [orders, logs, vehicles, returns, approvals] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { statusLogs: { orderBy: { createdAt: "asc" } }, vehicle: true },
    }),
    prisma.orderStatusLog.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 90 * 86400000) } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.vehicle.findMany({ where: { active: true } }),
    prisma.salesReturn.count(),
    prisma.approval.count({ where: { status: "PENDING", type: { in: ["CANCEL_ORDER", "DISPATCH"] } } }),
  ]);

  const queue = orders.filter((o) => o.status !== "CANCELLED");
  const count = (s: string) => queue.filter((o) => o.status === s).length;
  const todayDispatched = logs.filter((l) => l.status === "DISPATCHED" && l.createdAt >= start && l.createdAt < end).length;
  const todayDelivered = logs.filter((l) => l.status === "DELIVERED" && l.createdAt >= start && l.createdAt < end).length;
  const todayOrders = orders.filter((o) => o.createdAt >= start && o.createdAt < end && o.status !== "DRAFT").length;

  const late = queue.filter((o) => {
    if (!o.expectedDelivery) return false;
    if (["DELIVERED", "CANCELLED", "RETURNED"].includes(o.status)) return false;
    return o.expectedDelivery.getTime() < Date.now();
  }).length;

  const onRoute = queue.filter((o) => ["DISPATCHED", "IN_TRANSIT"].includes(o.status)).length;
  const vehiclesOnRoute = new Set(queue.filter((o) => o.vehicleId && ["DISPATCHED", "IN_TRANSIT"].includes(o.status)).map((o) => o.vehicleId)).size;

  const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  const failed = count("FAILED");
  const accuracy = delivered + failed > 0 ? Math.round((delivered / (delivered + failed)) * 1000) / 10 : 100;

  let dispatchHours = 0;
  let dispatchSamples = 0;
  for (const o of orders) {
    const confirmed = o.statusLogs.find((l) => l.status === "CONFIRMED");
    const dispatched = o.statusLogs.find((l) => l.status === "DISPATCHED");
    if (confirmed && dispatched) {
      dispatchHours += (dispatched.createdAt.getTime() - confirmed.createdAt.getTime()) / 3600000;
      dispatchSamples += 1;
    }
  }
  const avgDispatchHours = dispatchSamples ? Math.round((dispatchHours / dispatchSamples) * 10) / 10 : 0;

  const onTime = orders.filter((o) => o.status === "DELIVERED" && o.expectedDelivery && o.podAt && o.podAt <= o.expectedDelivery).length;
  const deliveredWithEta = orders.filter((o) => o.status === "DELIVERED" && o.expectedDelivery).length;
  const onTimePct = deliveredWithEta ? Math.round((onTime / deliveredWithEta) * 1000) / 10 : 100;

  const activeVehicles = vehicles.length || 1;
  const vehicleUtilization = Math.round((vehiclesOnRoute / activeVehicles) * 1000) / 10;

  res.json({
    queue: {
      readyToDispatch: count("PICKED"),
      waitingPicking: count("CONFIRMED"),
      waitingPacking: count("PICKING") + count("PACKING"),
      awaitingApproval: approvals,
      pending: queue.filter((o) => !["DELIVERED", "RETURNED", "CANCELLED"].includes(o.status)).length,
      dispatchedToday: todayDispatched,
      deliveredToday: todayDelivered,
      failedDeliveries: failed,
      returns,
      vehiclesOnRoute,
      lateDeliveries: late,
    },
    kpis: {
      ordersToday: todayOrders,
      ordersDispatched: todayDispatched,
      dispatchAccuracy: accuracy,
      avgDispatchHours,
      onTimePct,
      vehicleUtilization,
      costPerDelivery: 0,
    },
    labels: DISPATCH_LABELS,
  });
});

dispatchRouter.get("/vehicles", moduleAccess("dispatch"), async (_req, res) => {
  const rows = await prisma.vehicle.findMany({ orderBy: { number: "asc" } });
  res.json(rows);
});

dispatchRouter.post("/vehicles", moduleAccess("dispatch"), async (req, res) => {
  const body = req.body || {};
  const number = String(body.number || "").trim().toUpperCase();
  if (!number) return res.status(400).json({ error: "Vehicle number required" });
  const row = await prisma.vehicle.create({
    data: {
      number,
      driverName: body.driverName ? String(body.driverName).slice(0, 120) : null,
      driverPhone: body.driverPhone ? String(body.driverPhone).slice(0, 30) : null,
      transportCo: body.transportCo ? String(body.transportCo).slice(0, 120) : null,
      capacity: body.capacity ? String(body.capacity).slice(0, 60) : null,
      route: body.route ? String(body.route).slice(0, 200) : null,
      gpsDevice: body.gpsDevice ? String(body.gpsDevice).slice(0, 80) : null,
      maintenanceStatus: String(body.maintenanceStatus || "OK").slice(0, 40),
      mileage: Number(body.mileage) || 0,
      active: body.active !== false,
    },
  });
  res.status(201).json(row);
});

dispatchRouter.get("/reports/summary", moduleAccess("dispatch", "reports"), async (req, res) => {
  const when = String(req.query.when || "month");
  const start = dayStart();
  if (when === "week") start.setDate(start.getDate() - 7);
  else if (when === "month") start.setDate(1);
  else if (when === "year") start.setMonth(0, 1);
  else if (when === "all") start.setFullYear(2000);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start }, status: { notIn: ["DRAFT"] } },
    include: { statusLogs: true, vehicle: true, driver: { select: { name: true } } },
  });

  const byStatus = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const drivers = orders.reduce<Record<string, { name: string; delivered: number; failed: number }>>((acc, o) => {
    const key = o.driverId || "unassigned";
    if (!acc[key]) acc[key] = { name: o.driver?.name || "Unassigned", delivered: 0, failed: 0 };
    if (o.status === "DELIVERED") acc[key].delivered += 1;
    if (o.status === "FAILED") acc[key].failed += 1;
    return acc;
  }, {});

  res.json({
    period: when,
    total: orders.length,
    byStatus,
    drivers: Object.values(drivers).sort((a, b) => b.delivered - a.delivered),
    late: orders.filter((o) => o.expectedDelivery && o.expectedDelivery < new Date() && !["DELIVERED", "CANCELLED"].includes(o.status)).length,
    returned: orders.filter((o) => o.status === "RETURNED").length,
  });
});
