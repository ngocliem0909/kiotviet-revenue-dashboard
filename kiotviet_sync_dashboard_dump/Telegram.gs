/**
 * Telegram daily report for KiotViet dashboard.
 *
 * Setup (one-time):
 *   1. Set Script Properties: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   2. Run setupTelegramTrigger() once to create the daily 23:59 trigger
 *   3. Run testTelegramReport() to verify delivery
 */

var TELEGRAM_DEFAULT_CHAT_ID = '530892002';

function getTelegramConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    token: props.getProperty('TELEGRAM_BOT_TOKEN') || '',
    chatId: props.getProperty('TELEGRAM_CHAT_ID') || TELEGRAM_DEFAULT_CHAT_ID
  };
}

/**
 * Build the daily report message (today + month-to-date).
 */
function buildDailyReportMessage() {
  var now = new Date();
  var tz = 'Asia/Ho_Chi_Minh';
  var todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var ym = Utilities.formatDate(now, tz, 'yyyy-MM');
  var displayDate = Utilities.formatDate(now, tz, 'dd/MM/yyyy');
  var monthLabel = ym.substring(5) + '/' + ym.substring(0, 4);

  var rows = readMonthRows(ym);
  var dInv = 0, dRev = 0, dPaid = 0;
  var mInv = 0, mRev = 0, mPaid = 0;
  rows.forEach(function (r) {
    var rev = Number(r.total) || 0;
    var paid = Number(r.totalPayment) || 0;
    mInv++; mRev += rev; mPaid += paid;
    var pd = r.purchaseDate;
    var pdStr;
    if (Object.prototype.toString.call(pd) === '[object Date]') {
      pdStr = Utilities.formatDate(pd, tz, 'yyyy-MM-dd');
    } else {
      pdStr = String(pd || '').substring(0, 10);
    }
    if (pdStr === todayStr) {
      dInv++; dRev += rev; dPaid += paid;
    }
  });

  var vnd = function (n) { return Math.round(n).toLocaleString('vi-VN') + 'đ'; };

  return '📊 BÁO CÁO DOANH THU KIOTVIET\n'
    + '━━━━━━━━━━━━━━━━━━\n'
    + 'Ngày: ' + displayDate + '\n\n'
    + '💰 HÔM NAY\n'
    + '• Hóa đơn: ' + dInv + '\n'
    + '• Doanh thu: ' + vnd(dRev) + '\n'
    + '• Đã thu: ' + vnd(dPaid) + '\n\n'
    + '📅 THÁNG ' + monthLabel + '\n'
    + '• Hóa đơn: ' + mInv + '\n'
    + '• Doanh thu: ' + vnd(mRev) + '\n'
    + '• Đã thu: ' + vnd(mPaid);
}

/**
 * Send a Telegram message. Returns HTTP status code.
 */
function sendTelegramMessage(text) {
  var cfg = getTelegramConfig();
  if (!cfg.token) {
    console.error('TELEGRAM_BOT_TOKEN is not set in Script Properties');
    return -1;
  }
  var url = 'https://api.telegram.org/bot' + cfg.token + '/sendMessage';
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: cfg.chatId, text: text }),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  console.log('Telegram sendMessage -> HTTP ' + code);
  return code;
}

/**
 * Daily report entry point (called by time trigger).
 */
function sendDailyTelegramReport() {
  var code = sendTelegramMessage(buildDailyReportMessage());
  if (code !== 200) {
    console.error('Daily Telegram report failed with HTTP ' + code);
  }
}

/**
 * One-time setup: create/replace the daily 23:59 trigger.
 */
function setupTelegramTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDailyTelegramReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailyTelegramReport')
    .timeBased()
    .atHour(23).nearMinute(59)
    .everyDays(1)
    .inTimezone('Asia/Ho_Chi_Minh')
    .create();
  console.log('Daily Telegram trigger created (23:59 ICT)');
}

/**
 * Manual test: sends the report immediately.
 */
function testTelegramReport() {
  var code = sendTelegramMessage('✅ Test báo cáo Telegram từ Apps Script KiotViet.\n\n' + buildDailyReportMessage());
  console.log('Test result: HTTP ' + code);
}

