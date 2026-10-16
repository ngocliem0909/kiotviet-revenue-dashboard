/**
 * Products, cost & inventory sync from KiotViet API.
 *
 * syncProductsAndInventory(): fetches full product catalog with
 * includeInventory=true, writes to KiotViet-Summary tabs:
 *   - Products:       productId, productCode, productName, cost, updatedAt (overwrite)
 *   - Inventory:      productCode, productName, branchName, onHand, cost, stockValue, updatedAt (overwrite)
 *   - InventoryDaily: date, skuCount, totalOnHand, totalValue, lowStockCount, outOfStockCount, updatedAt (append)
 *
 * Run manually once, then daily via trigger.
 * Reuses getAccessToken() from Code.gs and getSummarySpreadsheet() from Summary.gs.
 */

var PRODUCTS_TAB = 'Products';
var INVENTORY_TAB = 'Inventory';
var INVENTORY_DAILY_TAB = 'InventoryDaily';

/**
 * Fetch with exponential-backoff retry (KiotViet API can drop connections
 * after ~20 rapid requests with "address unavailable").
 */
function fetchUrlWithRetry(url, options, maxRetries) {
  maxRetries = (maxRetries === undefined) ? 5 : maxRetries;
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      var resp = UrlFetchApp.fetch(url, options);
      if (resp.getResponseCode() === 200) return resp;
      throw new Error('HTTP ' + resp.getResponseCode() + ': ' +
        resp.getContentText().substring(0, 200));
    } catch (e) {
      if (attempt >= maxRetries) throw e;
      var waitSec = Math.pow(2, attempt) * 5;
      Logger.log('Fetch failed (attempt %d/%d): %s. Waiting %ds...',
        attempt + 1, maxRetries + 1, e.toString().substring(0, 120), waitSec);
      Utilities.sleep(waitSec * 1000);
    }
  }
}

/**
 * Fetch all products paginated (pageSize max 100).
 */
function fetchAllProducts(token) {
  var props = PropertiesService.getScriptProperties();
  var retailer = props.getProperty('KIOT_RETAILER') || 'leeandteevn';
  var all = [];
  var currentItem = 0;
  var pageSize = 100;
  while (true) {
    var url = 'https://public.kiotapi.com/products?pageSize=' + pageSize +
      '&currentItem=' + currentItem + '&includeInventory=true';
    var resp = fetchUrlWithRetry(url, {
      headers: { 'Retailer': retailer, 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    var data = JSON.parse(resp.getContentText());
    var batch = data.data || [];
    for (var i = 0; i < batch.length; i++) all.push(batch[i]);
    if (all.length >= (data.total || 0) || batch.length === 0) break;
    currentItem += pageSize;
    Utilities.sleep(2000);
  }
  return all;
}

/**
 * First non-null cost across branches (cost lives in inventories[]).
 */
function firstCostOf(p) {
  var invs = p.inventories || [];
  for (var i = 0; i < invs.length; i++) {
    if (invs[i].cost !== null && invs[i].cost !== undefined) {
      return Number(invs[i].cost) || 0;
    }
  }
  return 0;
}

function writeTabOverwrite(ss, name, rows) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  if (rows.length > 0) {
    sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function appendTabWithHeader(ss, name, header, rows) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header[0].length).setValues(header);
  }
  if (rows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function syncProductsAndInventory() {
  var token = getAccessToken();
  var products = fetchAllProducts(token);
  Logger.log('Fetched %d products', products.length);

  var ss = getSummarySpreadsheet();
  var now = new Date();
  var nowStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
  var todayStr = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');

  var prodRows = [['productId', 'productCode', 'productName', 'cost', 'updatedAt']];
  products.forEach(function (p) {
    prodRows.push([p.id || '', p.code || '', p.name || '', firstCostOf(p), nowStr]);
  });
  writeTabOverwrite(ss, PRODUCTS_TAB, prodRows);

  var invRows = [['productCode', 'productName', 'branchName', 'onHand', 'cost', 'stockValue', 'updatedAt']];
  var totalValue = 0, totalOnHand = 0, lowStock = 0, outOfStock = 0;
  var skuSeen = {};
  products.forEach(function (p) {
    var invs = p.inventories || [];
    skuSeen[p.code] = true;
    if (invs.length === 0) {
      outOfStock++;
      return;
    }
    invs.forEach(function (iv) {
      var onHand = Number(iv.onHand) || 0;
      var cost = (iv.cost !== null && iv.cost !== undefined) ? (Number(iv.cost) || 0) : firstCostOf(p);
      var val = onHand * cost;
      invRows.push([p.code || '', p.name || '', iv.branchName || '', onHand, cost, Math.round(val), nowStr]);
      totalValue += val;
      totalOnHand += onHand;
      if (onHand <= 0) {
        outOfStock++;
      } else if (iv.minQuantity && onHand <= Number(iv.minQuantity)) {
        lowStock++;
      }
    });
  });
  writeTabOverwrite(ss, INVENTORY_TAB, invRows);

  appendTabWithHeader(ss, INVENTORY_DAILY_TAB,
    [['date', 'skuCount', 'totalOnHand', 'totalValue', 'lowStockCount', 'outOfStockCount', 'updatedAt']],
    [[todayStr, Object.keys(skuSeen).length, totalOnHand, Math.round(totalValue), lowStock, outOfStock, nowStr]]);

  Logger.log('Products: %d, inventory rows: %d, total value: %d',
    products.length, invRows.length - 1, Math.round(totalValue));
}