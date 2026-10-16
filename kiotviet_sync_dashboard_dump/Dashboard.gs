function getUserRole(email) {
  email = String(email || '').toLowerCase().trim();
  const admins = ['ngocliem0909@gmail.com', 'zoolnguyen@gmail.com', 'lee.famn@gmail.com'];
  if (admins.indexOf(email) >= 0) return 'admin';
  return 'viewer';
}
function maskPhone(phone) {
  phone = String(phone || '');
  if (phone.length <= 4) return '****';
  return phone.substring(0, 3) + '****' + phone.substring(phone.length - 2);
}
function doGet(e) {
  const email = Session.getActiveUser().getEmail();
  const role = getUserRole(email);
  if (!email) { return HtmlService.createHtmlOutput('<h2>Vui lòng đăng nhập tài khoản Google</h2>'); }
  const template = HtmlService.createTemplateFromFile('DashboardHtml');
  template.userEmail = email;
  template.userRole = role;
  return template.evaluate().setTitle('KiotViet Dashboard').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function getAvailableYears() {
  const root = DriveApp.getFoldersByName('KiotViet-HoaDon');
  if (!root.hasNext()) return [];
  const years = [];
  const it = root.next().getFolders();
  while (it.hasNext()) {
    const name = it.next().getName();
    if (/^\d{4}$/.test(name)) years.push(name);
  }
  return years.sort().reverse();
}
function getYearlySummary(year) {
  return getYearlySummaryFast(year);
}

function getDailyRevenue(days) {
  return getDailyRevenueFast(days);
}

function readMonthRows(yearMonth) {
  const parts = yearMonth.split('-');
  const root = DriveApp.getFoldersByName('KiotViet-HoaDon');
  if (!root.hasNext()) return [];
  const yf = root.next().getFoldersByName(parts[0]);
  if (!yf.hasNext()) return [];
  const mf = yf.next().getFoldersByName(parts[1]);
  if (!mf.hasNext()) return [];
  const files = mf.next().getFilesByName('HoaDon_' + yearMonth);
  if (!files.hasNext()) return [];
  const sheet = SpreadsheetApp.open(files.next()).getSheetByName('Invoices');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 20).getValues().map(r => ({
    id: r[0], code: r[1], purchaseDate: r[2], branchName: r[3], soldByName: r[4],
    customerName: r[5], total: r[6], totalPayment: r[7], status: r[8], description: r[9]
  }));
}
function getMonthSummary(yearMonth) {
  return getMonthSummaryFast(yearMonth);
}

function getMonthInvoices(yearMonth, page, pageSize) {
  const email = Session.getActiveUser().getEmail();
  const role = getUserRole(email);
  page = Math.max(1, page || 1);
  pageSize = Math.min(200, Math.max(20, pageSize || 100));
  const rows = readMonthRows(yearMonth);
  let filtered;
  if (role === 'admin') { filtered = rows; }
  else if (role === 'accountant') {
    filtered = rows.map(r => {
      const copy = Object.assign({}, r);
      if (copy.customerPhone) copy.customerPhone = maskPhone(copy.customerPhone);
      return copy;
    });
  } else {
    filtered = rows.map(r => ({ code: r.code, purchaseDate: r.purchaseDate, total: r.total, totalPayment: r.totalPayment, status: r.status }));
  }
  filtered.sort((a, b) => String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || '')));
  const total = filtered.length;
  const start = (page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize).map(r => {
    const o = {};
    Object.keys(r).forEach(k => {
      const v = r[k];
      o[k] = (v instanceof Date) ? Utilities.formatDate(v, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss') : v;
    });
    return o;
  });
  return {
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: Math.ceil(total / pageSize),
    rows: pageRows
  };
}
function include(filename) { return HtmlService.createHtmlOutputFromFile(filename).getContent(); }
