const express = require("express");
const { healthCheck } = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ValidationError } = require("../middleware/errorHandler");
const { resolveInventoryScope } = require("../services/shopClient");
const {
  listItemsByScope,
  findItemById,
  reconcileScopeTransition,
  createItem,
  updateItem,
  deleteItem,
  adjustItemQuantity,
} = require("../repositories/inventoryRepository");

const router = express.Router();

const CATEGORIES = new Set([
  "Shampoo",
  "Conditioner",
  "Leave-in Conditioner",
  "Hair Dye",
  "Treatment",
  "Tool",
  "Other",
]);

const UNIT_TYPES = new Set(["bottles", "sachets", "ml", "pcs", "tubes", "boxes", "jars"]);

function validateString(field, value, { required = false, maxLength = 200 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ValidationError(`${field} is required`, field);
    return null;
  }
  const normalized = String(value).trim();
  if (!normalized) {
    if (required) throw new ValidationError(`${field} is required`, field);
    return null;
  }
  if (normalized.length > maxLength) {
    throw new ValidationError(`${field} must be ${maxLength} characters or fewer`, field);
  }
  return normalized;
}

function validateQuantity(field, value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new ValidationError(`${field} must be a number greater than or equal to 0`, field);
  }
  return number;
}

function validateDelta(field, value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    throw new ValidationError(`${field} must be a non-zero number`, field);
  }
  return number;
}

function validateCategory(value) {
  const category = validateString("category", value, { required: true, maxLength: 80 });
  if (!CATEGORIES.has(category)) {
    throw new ValidationError("category is not supported", "category");
  }
  return category;
}

function validateUnitType(value) {
  const unitType = validateString("unitType", value, { required: true, maxLength: 40 });
  if (!UNIT_TYPES.has(unitType)) {
    throw new ValidationError("unitType is not supported", "unitType");
  }
  return unitType;
}

function serializeInventory(scope, items, options = {}) {
  const lowStockItems = items.filter((item) => item.quantity <= item.lowStockThreshold);
  return {
    scope: {
      type: scope.scopeType,
      id: scope.scopeId,
      label: scope.scopeLabel,
      canManage: scope.canManage,
      role: scope.role,
      shop: scope.shop
        ? {
            id: scope.shop.id,
            name: scope.shop.name,
            city: scope.shop.city,
            imageUrl: scope.shop.imageUrl || null,
          }
        : null,
    },
    summary: {
      totalItems: items.length,
      lowStockCount: lowStockItems.length,
      lowStockItems,
      resetPersonalInventory: options.resetPersonalInventory || false,
    },
    items,
  };
}

async function resolveScopeForRequest(req) {
  const scope = await resolveInventoryScope(req);
  const transition = await reconcileScopeTransition(req.auth.sub, scope.scopeType, scope.scopeId);
  return { ...scope, transition };
}

async function requireManageScope(req, res, next) {
  try {
    const scope = await resolveScopeForRequest(req);
    req.inventoryScope = scope;
    if (!scope.canManage) {
      return res.status(403).json({
        success: false,
        error: "This inventory is read-only for your account",
        request_id: req.id,
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

async function attachScope(req, res, next) {
  try {
    req.inventoryScope = await resolveScopeForRequest(req);
    return next();
  } catch (error) {
    return next(error);
  }
}

function ensureItemBelongsToScope(item, scope, req) {
  if (!item || item.scopeType !== scope.scopeType || String(item.scopeId) !== String(scope.scopeId)) {
    const error = new Error("Inventory item not found");
    error.statusCode = 404;
    error.request_id = req.id;
    throw error;
  }
}

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "inventory-service",
    timestamp: new Date().toISOString(),
  });
});

router.get("/ready", async (req, res) => {
  try {
    await healthCheck();
    return res.json({
      ready: true,
      service: "inventory-service",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return res.status(503).json({
      ready: false,
      service: "inventory-service",
      error: "Database unavailable",
      request_id: req.id,
    });
  }
});

router.get("/inventory/me", requireAuth, requireRole("owner", "stylist"), attachScope, async (req, res) => {
  const items = await listItemsByScope(req.inventoryScope.scopeType, req.inventoryScope.scopeId);
  return res.json({
    success: true,
    data: serializeInventory(req.inventoryScope, items, req.inventoryScope.transition),
    request_id: req.id,
  });
});

router.post("/inventory/items", requireAuth, requireRole("owner", "stylist"), requireManageScope, async (req, res) => {
  const created = await createItem({
    scopeType: req.inventoryScope.scopeType,
    scopeId: req.inventoryScope.scopeId,
    productName: validateString("productName", req.body.productName, { required: true, maxLength: 200 }),
    category: validateCategory(req.body.category),
    brand: validateString("brand", req.body.brand, { maxLength: 120 }),
    quantity: validateQuantity("quantity", req.body.quantity),
    unitType: validateUnitType(req.body.unitType),
    lowStockThreshold: validateQuantity("lowStockThreshold", req.body.lowStockThreshold),
    notes: validateString("notes", req.body.notes, { maxLength: 800 }),
  });

  return res.status(201).json({
    success: true,
    data: created,
    request_id: req.id,
  });
});

router.patch("/inventory/items/:itemId", requireAuth, requireRole("owner", "stylist"), requireManageScope, async (req, res) => {
  const item = await findItemById(req.params.itemId);
  ensureItemBelongsToScope(item, req.inventoryScope, req);

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "productName")) {
    patch.product_name = validateString("productName", req.body.productName, { required: true, maxLength: 200 });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "category")) {
    patch.category = validateCategory(req.body.category);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "brand")) {
    patch.brand = validateString("brand", req.body.brand, { maxLength: 120 });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "quantity")) {
    patch.quantity = validateQuantity("quantity", req.body.quantity);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "unitType")) {
    patch.unit_type = validateUnitType(req.body.unitType);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "lowStockThreshold")) {
    patch.low_stock_threshold = validateQuantity("lowStockThreshold", req.body.lowStockThreshold);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
    patch.notes = validateString("notes", req.body.notes, { maxLength: 800 });
  }

  const updated = await updateItem(item.id, patch);
  return res.json({
    success: true,
    data: updated,
    request_id: req.id,
  });
});

router.delete("/inventory/items/:itemId", requireAuth, requireRole("owner", "stylist"), requireManageScope, async (req, res) => {
  const item = await findItemById(req.params.itemId);
  ensureItemBelongsToScope(item, req.inventoryScope, req);
  const deleted = await deleteItem(item.id);
  return res.json({
    success: true,
    data: deleted,
    request_id: req.id,
  });
});

router.post("/inventory/items/:itemId/adjust", requireAuth, requireRole("owner", "stylist"), requireManageScope, async (req, res) => {
  const item = await findItemById(req.params.itemId);
  ensureItemBelongsToScope(item, req.inventoryScope, req);

  const quantityProvided = Object.prototype.hasOwnProperty.call(req.body, "quantity");
  const deltaProvided = Object.prototype.hasOwnProperty.call(req.body, "delta");
  if (!quantityProvided && !deltaProvided) {
    throw new ValidationError("Provide quantity or delta", "quantity");
  }

  const updated = await adjustItemQuantity({
    item,
    scopeType: req.inventoryScope.scopeType,
    scopeId: req.inventoryScope.scopeId,
    actorUserId: req.auth.sub,
    quantity: quantityProvided ? validateQuantity("quantity", req.body.quantity) : undefined,
    delta: deltaProvided ? validateDelta("delta", req.body.delta) : undefined,
    reason: validateString("reason", req.body.reason, { maxLength: 200 }),
  });

  return res.json({
    success: true,
    data: updated,
    request_id: req.id,
  });
});

module.exports = router;
