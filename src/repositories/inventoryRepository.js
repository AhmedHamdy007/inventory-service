const { query, withTransaction } = require("../db/pool");
const { ValidationError } = require("../middleware/errorHandler");

function rowToItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    productName: row.product_name,
    category: row.category,
    brand: row.brand,
    quantity: Number(row.quantity),
    unitType: row.unit_type,
    lowStockThreshold: Number(row.low_stock_threshold),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToScopeState(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    lastScopeType: row.last_scope_type,
    lastScopeId: row.last_scope_id,
    updatedAt: row.updated_at,
  };
}

async function listItemsByScope(scopeType, scopeId) {
  const result = await query(
    `SELECT *
     FROM inventory_items
     WHERE scope_type = $1
       AND scope_id = $2
     ORDER BY category ASC, product_name ASC, created_at DESC`,
    [scopeType, scopeId]
  );
  return result.rows.map(rowToItem);
}

async function findItemById(itemId) {
  const result = await query("SELECT * FROM inventory_items WHERE id = $1 LIMIT 1", [itemId]);
  return rowToItem(result.rows[0]);
}

async function upsertScopeState(userId, scopeType, scopeId) {
  const result = await query(
    `INSERT INTO inventory_scope_state (user_id, last_scope_type, last_scope_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id)
     DO UPDATE SET last_scope_type = EXCLUDED.last_scope_type,
                   last_scope_id = EXCLUDED.last_scope_id,
                   updated_at = NOW()
     RETURNING *`,
    [userId, scopeType, scopeId]
  );
  return rowToScopeState(result.rows[0]);
}

async function getScopeState(userId) {
  const result = await query(
    "SELECT * FROM inventory_scope_state WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  return rowToScopeState(result.rows[0]);
}

async function clearStylistScope(scopeId, client = null) {
  const executor = client || { query };
  await executor.query(
    "DELETE FROM inventory_adjustments WHERE scope_type = 'stylist' AND scope_id = $1",
    [scopeId]
  );
  await executor.query(
    "DELETE FROM inventory_items WHERE scope_type = 'stylist' AND scope_id = $1",
    [scopeId]
  );
}

async function reconcileScopeTransition(userId, currentScopeType, currentScopeId) {
  const previous = await getScopeState(userId);

  if (previous && previous.lastScopeType === 'shop' && currentScopeType === 'stylist') {
    await withTransaction(async (client) => {
      await clearStylistScope(userId, client);
      await client.query(
        `INSERT INTO inventory_scope_state (user_id, last_scope_type, last_scope_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id)
         DO UPDATE SET last_scope_type = EXCLUDED.last_scope_type,
                       last_scope_id = EXCLUDED.last_scope_id,
                       updated_at = NOW()`,
        [userId, currentScopeType, currentScopeId]
      );
    });
    return { resetPersonalInventory: true };
  }

  await upsertScopeState(userId, currentScopeType, currentScopeId);
  return { resetPersonalInventory: false };
}

async function createItem({
  scopeType,
  scopeId,
  productName,
  category,
  brand,
  quantity,
  unitType,
  lowStockThreshold,
  notes,
}) {
  const result = await query(
    `INSERT INTO inventory_items (
      scope_type,
      scope_id,
      product_name,
      category,
      brand,
      quantity,
      unit_type,
      low_stock_threshold,
      notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [scopeType, scopeId, productName, category, brand, quantity, unitType, lowStockThreshold, notes]
  );
  return rowToItem(result.rows[0]);
}

async function updateItem(itemId, patch) {
  const fields = [];
  const params = [];
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) return;
    params.push(value);
    fields.push(`${key} = $${params.length}`);
  });
  if (fields.length === 0) return findItemById(itemId);

  params.push(itemId);
  const result = await query(
    `UPDATE inventory_items
     SET ${fields.join(", ")}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING *`,
    params
  );
  return rowToItem(result.rows[0]);
}

async function deleteItem(itemId) {
  const result = await query(
    "DELETE FROM inventory_items WHERE id = $1 RETURNING *",
    [itemId]
  );
  return rowToItem(result.rows[0]);
}

async function createAdjustment({
  itemId,
  scopeType,
  scopeId,
  actorUserId,
  mode,
  delta,
  previousQuantity,
  nextQuantity,
  reason,
}) {
  const result = await query(
    `INSERT INTO inventory_adjustments (
      inventory_item_id,
      scope_type,
      scope_id,
      actor_user_id,
      mode,
      delta,
      previous_quantity,
      next_quantity,
      reason
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [itemId, scopeType, scopeId, actorUserId, mode, delta, previousQuantity, nextQuantity, reason]
  );
  return result.rows[0];
}

async function adjustItemQuantity({ item, scopeType, scopeId, actorUserId, quantity, delta, reason }) {
  const nextQuantity = Math.max(0, quantity !== undefined ? quantity : item.quantity + delta);
  if (Number.isNaN(nextQuantity)) {
    throw new ValidationError("Quantity must be a valid number", "quantity");
  }

  return withTransaction(async (client) => {
    const updateResult = await client.query(
      `UPDATE inventory_items
       SET quantity = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [nextQuantity, item.id]
    );
    const updated = rowToItem(updateResult.rows[0]);

    await client.query(
      `INSERT INTO inventory_adjustments (
        inventory_item_id,
        scope_type,
        scope_id,
        actor_user_id,
        mode,
        delta,
        previous_quantity,
        next_quantity,
        reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        item.id,
        scopeType,
        scopeId,
        actorUserId,
        quantity !== undefined ? "set" : "delta",
        quantity !== undefined ? nextQuantity - item.quantity : delta,
        item.quantity,
        nextQuantity,
        reason || null,
      ]
    );

    return updated;
  });
}

module.exports = {
  listItemsByScope,
  findItemById,
  reconcileScopeTransition,
  createItem,
  updateItem,
  deleteItem,
  adjustItemQuantity,
  createAdjustment,
};
