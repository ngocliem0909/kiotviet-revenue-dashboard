/**
 * KiotViet → Google Sheets Sync (Hourly)
 */
const ROOT_FOLDER_NAME = 'KiotViet-HoaDon';
const SHEET_TAB_NAME = 'Invoices';
const COLUMNS = ['id','code','purchaseDate','branchName','soldByName','customerName',
  'total','totalPayment','status','description','data','pageSize','currentItem',
  'statusValue','branchId','customerId','_source','_reconciliation','_type','_differences'];

function syncHourly() {
  const props = PropertiesService.getScriptProperties();
  const lastSyncStr = props.getProperty('LAST_SYNC') || '2026-10-15T00:00:00';
  const lastSync = new Date(lastSyncStr);
  const now = new Date();
  
  // Cap sync window to 1 hour to avoid 6-min timeout
  // If behind, sync 1-hour chunk and let next run continue
  let syncEnd = now;
  const oneHourMs = 60 * 60 * 1000;
  if (now.getTime() - lastSync.getTime() > oneHourMs) {
    syncEnd = new Date(lastSync.getTime() + oneHourMs);
    Logger.log('Behind schedule. Syncing 1h chunk: %s to %s', lastSync.toISOString(), syncEnd.toISOString());
  } else {
    Logger.log('Sync from %s to %s', lastSync.toISOString(), syncEnd.toISOString());
  }
  
  try {
    const token = getAccessToken();
    const invoices = fetchInvoicesRange(token, lastSync.toISOString(), syncEnd.toISOString());
    Logger.log('Fetched %d invoices', invoices.length);
    
    if (invoices.length > 0) {
      upsertToMonthlySheets(invoices);
    }
    
    props.setProperty('LAST_SYNC', syncEnd.toISOString());
    Logger.log('Sync complete. LAST_SYNC=%s', syncEnd.toISOString());
  } catch (e) {
    Logger.log('Sync ERROR: %s', e.toString());
    throw e;
  }
}

function getAccessToken() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('KIOT_TOKEN');
  const expiry = parseInt(props.getProperty('KIOT_TOKEN_EXP') || '0', 10);
  if (cached && Date.now() < expiry) { return cached; }
  const clientId = props.getProperty('KIOT_CLIENT_ID');
  const clientSecret = props.getProperty('KIOT_CLIENT_SECRET');
  if (!clientId || !clientSecret) { throw new Error('Missing KIOT_CLIENT_ID or KIOT_CLIENT_SECRET in Script Properties'); }
  const resp = UrlFetchApp.fetch('https://id.kiotviet.vn/connect/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'PublicApi.Access' },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) { throw new Error('Token failed: ' + resp.getContentText().substring(0, 200)); }
  const data = JSON.parse(resp.getContentText());
  props.setProperty('KIOT_TOKEN', data.access_token);
  props.setProperty('KIOT_TOKEN_EXP', String(Date.now() + 23 * 3600 * 1000));
  return data.access_token;
}

function fetchInvoicesSince(token, fromDate) {
  const props = PropertiesService.getScriptProperties();
  const retailer = props.getProperty('KIOT_RETAILER') || 'leeandteevn';
  const all = [];
  let currentItem = 0;
  const pageSize = 100;
  while (true) {
    const url = 'https://public.kiotapi.com/invoices?' +
      'pageSize=' + pageSize + '&currentItem=' + currentItem +
      '&fromPurchaseDate=' + encodeURIComponent(fromDate);
    const resp = UrlFetchApp.fetch(url, {
      headers: { 'Retailer': retailer, 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      throw new Error('API error ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0, 200));
    }
    const data = JSON.parse(resp.getContentText());
    const batch = data.data || [];
    all.push(...batch);
    if (all.length >= (data.total || 0) || batch.length === 0) break;
    currentItem += pageSize;
    Utilities.sleep(1000);
  }
  return all;
}

function fetchInvoicesRange(token, fromDate, toDate) {
  const props = PropertiesService.getScriptProperties();
  const retailer = props.getProperty('KIOT_RETAILER') || 'leeandteevn';
  const all = [];
  let currentItem = 0;
  const pageSize = 100;
  const maxRetries = 3;

  while (true) {
    const url = 'https://public.kiotapi.com/invoices?' +
      'pageSize=' + pageSize +
      '&currentItem=' + currentItem +
      '&fromPurchaseDate=' + encodeURIComponent(fromDate) +
      '&toPurchaseDate=' + encodeURIComponent(toDate);

    let resp = null;
    let success = false;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        resp = UrlFetchApp.fetch(url, {
          headers: { 'Retailer': retailer, 'Authorization': 'Bearer ' + token },
          muteHttpExceptions: true
        });
        if (resp.getResponseCode() === 200) {
          success = true;
          break;
        }
        throw new Error('HTTP ' + resp.getResponseCode());
      } catch (e) {
        if (attempt >= maxRetries) throw e;
        Logger.log('Fetch failed, retry %d/%d: %s', attempt + 1, maxRetries + 1, e.toString().substring(0, 100));
        Utilities.sleep(Math.pow(2, attempt) * 5000);
      }
    }

    const data = JSON.parse(resp.getContentText());
    const batch = data.data || [];
    for (let i = 0; i < batch.length; i++) all.push(batch[i]);

    if (all.length >= (data.total || 0) || batch.length === 0) break;
    currentItem += pageSize;
    Utilities.sleep(1000);
  }

  return all;
}

function upsertToMonthlySheets(invoices) {
  const groups = {};
  invoices.forEach(inv => {
    const pd = String(inv.purchaseDate || '');
    const ym = pd.substring(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    (groups[ym] = groups[ym] || []).push(inv);
  });
  Object.keys(groups).forEach(ym => {
    const sheet = getOrCreateMonthSheet(ym);
    upsertRows(sheet, groups[ym]);
    Logger.log('%s: upserted %d rows', ym, groups[ym].length);
  });
}

function getOrCreateMonthSheet(yearMonth) {
  const parts = yearMonth.split('-');
  const year = parts[0]; const month = parts[1];
  const root = getOrCreateFolder(ROOT_FOLDER_NAME, null);
  const yearFolder = getOrCreateFolder(year, root);
  const monthFolder = getOrCreateFolder(month, yearFolder);
  const files = monthFolder.getFilesByName('HoaDon_' + yearMonth);
  if (files.hasNext()) { return SpreadsheetApp.open(files.next()).getSheetByName(SHEET_TAB_NAME); }
  const templates = root.getFilesByName('HoaDon_TEMPLATE');
  if (!templates.hasNext()) throw new Error('Template not found');
  const copy = templates.next().makeCopy('HoaDon_' + yearMonth, monthFolder);
  return SpreadsheetApp.open(copy).getSheetByName(SHEET_TAB_NAME);
}

function getOrCreateFolder(name, parent) {
  let folders;
  if (parent) { folders = parent.getFoldersByName(name); }
  else { folders = DriveApp.getFoldersByName(name); }
  if (folders.hasNext()) return folders.next();
  return parent ? parent.createFolder(name) : DriveApp.createFolder(name);
}

function upsertRows(sheet, invoices) {
  const lastRow = sheet.getLastRow();
  const idMap = {};
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    ids.forEach((r, i) => { idMap[String(r[0])] = i + 2; });
  }
  const toAppend = [];
  const toUpdate = [];
  invoices.forEach(inv => {
    const row = invoiceToRow(inv);
    const rowNum = idMap[String(inv.id)];
    if (rowNum) { toUpdate.push({ row: rowNum, values: row }); }
    else { toAppend.push(row); }
  });
  if (toAppend.length > 0) {
    sheet.getRange(lastRow + 1, 1, toAppend.length, COLUMNS.length).setValues(toAppend);
  }
  toUpdate.forEach(u => {
    sheet.getRange(u.row, 1, 1, COLUMNS.length).setValues([u.values]);
  });
}

function invoiceToRow(inv) {
  let pd = String(inv.purchaseDate || '');
  if (pd.indexOf('T') > 0) pd = pd.replace('T', ' ').substring(0, 19);
  return [inv.id || '', inv.code || '', pd, inv.branchName || '', inv.soldByName || '',
    inv.customerName || '', inv.total || 0, inv.totalPayment || 0, inv.statusValue || '',
    inv.description || '', '', '', '', inv.statusValue || '', inv.branchId || '',
    inv.customerId || '', 'appscript-sync', '', '', ''];
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncHourly') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncHourly').timeBased().everyHours(1).create();
  Logger.log('Hourly trigger created');
}

function initLastSync() {
  PropertiesService.getScriptProperties().setProperty('LAST_SYNC', new Date().toISOString());
  Logger.log('LAST_SYNC initialized');
}

