const config = require("../config");

async function fetchShopJson(req, targetPath) {
  const upstream = await fetch(`${config.shopServiceUrl}${targetPath}`, {
    method: "GET",
    headers: {
      authorization: req.headers.authorization || "",
      "x-request-id": req.id || "",
    },
  });

  const body = await upstream.json().catch(() => ({}));
  return { status: upstream.status, body };
}

async function resolveInventoryScope(req) {
  const role = req.user?.role;

  if (role === "owner") {
    const response = await fetchShopJson(req, "/shops/me");
    if (response.status !== 200 || !response.body?.data) {
      const error = new Error(response.body?.error || "Unable to resolve owner shop inventory");
      error.statusCode = response.status === 404 ? 404 : 503;
      throw error;
    }

    return {
      role,
      scopeType: "shop",
      scopeId: response.body.data.id,
      scopeLabel: `${response.body.data.name} inventory`,
      canManage: true,
      shop: response.body.data,
      membership: null,
    };
  }

  if (role === "stylist") {
    const response = await fetchShopJson(req, "/stylists/me/shops");
    if (response.status !== 200) {
      const error = new Error(response.body?.error || "Unable to resolve stylist inventory scope");
      error.statusCode = response.status === 404 ? 404 : 503;
      throw error;
    }

    const shops = response.body?.data || [];
    if (shops.length > 0) {
      const shop = shops[0];
      return {
        role,
        scopeType: "shop",
        scopeId: shop.id,
        scopeLabel: `${shop.name} inventory`,
        canManage: false,
        shop,
        membership: { shopId: shop.id },
      };
    }

    return {
      role,
      scopeType: "stylist",
      scopeId: req.auth.sub,
      scopeLabel: "Personal inventory",
      canManage: true,
      shop: null,
      membership: null,
    };
  }

  const error = new Error("Inventory is only available for owners and stylists");
  error.statusCode = 403;
  throw error;
}

module.exports = {
  resolveInventoryScope,
};
