import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { itemRoutes } from './items.js';
import { binRoutes } from './bins.js';
import { inventoryRoutes } from './inventory.js';
import { purchaseOrderRoutes } from './purchase-orders.js';
import { salesOrderRoutes } from './sales-orders.js';
import { transferRoutes } from './transfers.js';
import { cycleCountRoutes } from './cycle-counts.js';
import { userRoutes } from './users.js';
import { settingsRoutes } from './settings.js';
import { erpRoutes } from './erp.js';
import { labelRoutes } from './labels.js';
import { reportRoutes } from './reports.js';
import { testRoutes } from './test.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(itemRoutes);
  await app.register(binRoutes);
  await app.register(inventoryRoutes);
  await app.register(purchaseOrderRoutes);
  await app.register(salesOrderRoutes);
  await app.register(transferRoutes);
  await app.register(cycleCountRoutes);
  await app.register(userRoutes);
  await app.register(settingsRoutes);
  await app.register(erpRoutes);
  await app.register(labelRoutes);
  await app.register(reportRoutes);
  if (config.testHooks) await app.register(testRoutes);
}
