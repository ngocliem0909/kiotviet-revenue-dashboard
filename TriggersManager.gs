/**
 * ==============================================================================
 * MODULE QUẢN LÝ LỊCH TRÌNH TỰ ĐỘNG (TRIGGERS MANAGER - L&T Analytics)
 * ==============================================================================
 */

/**
 * Tạo trigger chạy đồng bộ KiotViet mỗi 1 giờ
 */
function setupHourlySyncTrigger() {
  try {
    removeTriggerByHandler_('syncHourly');
    ScriptApp.newTrigger('syncHourly')
      .timeBased()
      .everyHours(1)
      .create();
    Logger.log('Đã tạo trigger đồng bộ KiotViet hàng giờ.');
    return { success: true, message: 'Đã tạo trigger syncHourly (1 giờ / lần)' };
  } catch (e) {
    Logger.log('Lỗi setupHourlySyncTrigger: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Tạo trigger gửi báo cáo Telegram hàng đêm lúc 23:59
 */
function setupDailyTelegramTrigger(force) {
  try {
    removeTriggerByHandler_('sendDailyReportToTelegram');
    if (force !== true && typeof isTelegramNotificationEnabled === 'function' && !isTelegramNotificationEnabled()) {
      Logger.log('Tính năng nhận tin Telegram đang TẮT. Không tạo trigger sendDailyReportToTelegram.');
      return { success: true, message: 'Nhận tin Telegram đang TẮT, đã hủy lịch gửi tự động' };
    }
    ScriptApp.newTrigger('sendDailyReportToTelegram')
      .timeBased()
      .atHour(23)
      .everyDays(1)
      .inTimezone('Asia/Ho_Chi_Minh')
      .create();
    Logger.log('Đã tạo trigger gửi Telegram lúc 23:00-00:00 hàng ngày.');
    return { success: true, message: 'Đã tạo trigger Telegram lúc 23:59 hàng ngày' };
  } catch (e) {
    Logger.log('Lỗi setupDailyTelegramTrigger: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Tạo trigger đồng bộ sản phẩm & tồn kho lúc 02:00 sáng hàng ngày
 */
function setupDailyProductSyncTrigger() {
  try {
    removeTriggerByHandler_('syncProductsAndInventory');
    ScriptApp.newTrigger('syncProductsAndInventory')
      .timeBased()
      .atHour(2)
      .everyDays(1)
      .inTimezone('Asia/Ho_Chi_Minh')
      .create();
    Logger.log('Đã tạo trigger syncProductsAndInventory lúc 02:00 sáng.');
    return { success: true, message: 'Đã tạo trigger syncProductsAndInventory lúc 02:00 sáng' };
  } catch (e) {
    Logger.log('Lỗi setupDailyProductSyncTrigger: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Cài đặt TOÀN BỘ triggers tự động (1-Click Setup)
 */
function setupAllTriggers() {
  try {
    const res1 = setupHourlySyncTrigger();
    const res2 = setupDailyTelegramTrigger();
    const res3 = setupDailyProductSyncTrigger();
    
    if (res1.success && res2.success && res3.success) {
      Logger.log('Đã kích hoạt toàn bộ lịch trình tự động thành công!');
      const successMsg = 'Đã kích hoạt toàn bộ 3 triggers tự động: Đồng bộ KiotViet (1h/lần), Báo cáo Telegram (23:59), Làm mới Sản phẩm & Kho (02:00)';
      try {
        if (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.getActiveSpreadsheet()) {
          SpreadsheetApp.getUi().alert('✅ Thành công', successMsg, SpreadsheetApp.getUi().ButtonSet.OK);
        }
      } catch (uiErr) {}
      return {
        success: true,
        message: successMsg
      };
    } else {
      const allMsgs = [res1.message, res2.message, res3.message].join('; ');
      const isAuthErr = allMsgs.includes('ScriptApp') || allMsgs.includes('quyền') || allMsgs.includes('permission');
      const friendlyMsg = isAuthErr
        ? 'Chính sách bảo mật Google: Triggers chạy ngầm cần được kích hoạt từ Google Sheet "Báo Cáo Doanh Thu Bán Hàng 2026" > Chọn menu "📊 L&T Analytics" > "⚡ Kích hoạt tất cả Triggers" (chỉ cần làm 1 lần duy nhất).'
        : ('Có trigger chưa tạo được: ' + allMsgs);
      return {
        success: false,
        message: friendlyMsg
      };
    }
  } catch (e) {
    return {
      success: false,
      message: 'Vui lòng mở Google Sheet "Báo Cáo Doanh Thu Bán Hàng 2026" > Menu "📊 L&T Analytics" > Bấm "⚡ Kích hoạt tất cả Triggers".'
    };
  }
}

/**
 * Xóa sạch tất cả triggers trong dự án
 */
function removeAllTriggers() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => ScriptApp.deleteTrigger(t));
    Logger.log('Đã xóa %d triggers.', triggers.length);
    try {
      if (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.getActiveSpreadsheet()) {
        SpreadsheetApp.getUi().alert('Đã xóa sạch ' + triggers.length + ' triggers.');
      }
    } catch (uiErr) {}
    return { success: true, count: triggers.length, message: 'Đã xóa sạch ' + triggers.length + ' triggers.' };
  } catch (e) {
    Logger.log('Lỗi removeAllTriggers: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Xóa trigger theo tên hàm xử lý
 */
function removeTriggerByHandler_(funcName) {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => {
      if (t.getHandlerFunction() === funcName) {
        ScriptApp.deleteTrigger(t);
      }
    });
  } catch (e) {
    Logger.log('removeTriggerByHandler_ (' + funcName + '): ' + e.message);
  }
}

/**
 * Lấy trạng thái danh sách các triggers đang hoạt động
 */
function getTriggersStatus() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    return triggers.map(t => ({
      id: t.getUniqueId(),
      handler: t.getHandlerFunction(),
      eventType: t.getEventType().toString()
    }));
  } catch (e) {
    Logger.log('getTriggersStatus: ' + e.message);
    return [];
  }
}
