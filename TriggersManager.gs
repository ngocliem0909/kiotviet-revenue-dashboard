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
function setupDailyTelegramTrigger() {
  try {
    removeTriggerByHandler_('sendDailyReportToTelegram');
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
      return {
        success: true,
        message: 'Đã kích hoạt toàn bộ lịch trình tự động: Đồng bộ KiotViet (1h/lần), Báo cáo Telegram (23:59), Làm mới Sản phẩm & Kho (02:00)'
      };
    } else {
      return {
        success: false,
        message: 'Có trigger chưa tạo được: ' + [res1.message, res2.message, res3.message].join('; ')
      };
    }
  } catch (e) {
    return { success: false, message: e.message };
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
    return { success: true, count: triggers.length };
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
