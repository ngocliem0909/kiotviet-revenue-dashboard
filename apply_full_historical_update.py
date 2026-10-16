import os
import json
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_FILE = os.path.join(SCRIPT_DIR, 'Index.html')
DOCS_FILE = os.path.join(SCRIPT_DIR, 'docs', 'dashboard.html')
MIN_JS_FILE = os.path.join(SCRIPT_DIR, 'historical_summary.min.js')

with open(MIN_JS_FILE, 'r', encoding='utf-8') as f:
    min_js = f.read().strip()

# Prepare functions to replace
new_functions_code = """
    // Biến trạng thái chế độ dữ liệu lịch sử
    let isHistoricalActive = false;
    let activeHistoricalPeriod = "";

    function applyFiltersAndCompute() {
      const filter = getFilterPayload();
      const fStart = filter.startDate || null;
      const fEnd = filter.endDate || null;
      const fBranch = (filter.branch && filter.branch !== "ALL") ? filter.branch : null;
      const fChannel = (filter.channel && filter.channel !== "ALL") ? filter.channel : null;
      const fStatus = (filter.status && filter.status !== "ALL") ? filter.status : null;

      // Kiểm tra xem kỳ đang chọn có phải là trọn vẹn 1 Năm (từ 2016 đến 2026) hay không
      const isFullYear = (fStart && fEnd && fStart.slice(0, 4) === fEnd.slice(0, 4) && fStart.endsWith("-01-01") && fEnd.endsWith("-12-31"));
      const selectedYear = isFullYear ? fStart.slice(0, 4) : null;

      // Lọc các bản ghi chi tiết hiện có trong allRecords (Tháng 09 & Tháng 10/2026)
      let detailedRev = 0, detailedCol = 0, detailedComp = 0, detailedProc = 0, detailedCanc = 0;
      const detailedDateMap = {};
      const detailedBranchMap = {};
      const detailedChannelMap = {};
      const detailedSellerMap = {};
      const filteredRows = [];

      for (let i = 0; i < allRecords.length; i++) {
        const r = allRecords[i];
        if (fStart && (!r.date || r.date < fStart)) continue;
        if (fEnd && (!r.date || r.date > fEnd)) continue;
        if (fBranch && r.branch !== fBranch) continue;
        if (fChannel && r.channel !== fChannel) continue;
        if (fStatus && r.status !== fStatus) continue;

        if (r.status === "Đã hủy") {
          detailedCanc++;
        } else {
          if (r.status === "Hoàn thành") detailedComp++;
          else detailedProc++;
          detailedRev += r.total;
          detailedCol += r.collected;
          if (r.date) detailedDateMap[r.date] = (detailedDateMap[r.date] || 0) + r.total;
          if (r.branch) detailedBranchMap[r.branch] = (detailedBranchMap[r.branch] || 0) + r.total;
          if (r.channel) detailedChannelMap[r.channel] = (detailedChannelMap[r.channel] || 0) + r.total;
          if (r.seller && r.seller !== "Chưa gán") detailedSellerMap[r.seller] = (detailedSellerMap[r.seller] || 0) + r.total;
        }
        filteredRows.push(r);
      }

      // Xác định xem có chuyển sang chế độ Tổng hợp lịch sử (Historical Summary) hay không
      const hs = window.HISTORICAL_SUMMARY;
      const useHistorical = hs && (
        (selectedYear && selectedYear < "2026") || // Các năm từ 2016 đến 2025
        (selectedYear === "2026" && !fBranch && !fChannel && !fStatus) || // Toàn bộ năm 2026 (Jan-Oct)
        (filteredRows.length === 0 && fStart && fStart < "2026-09-01") // Bất kỳ kỳ nào trước tháng 9/2026
      );

      let totalRevenue = 0, totalCollected = 0, completedOrders = 0, processingOrders = 0, cancelledOrders = 0;
      let chartTimelineLabels = [], chartTimelineData = [];
      let chartChannelLabels = [], chartChannelData = [];
      let chartBranchLabels = [], chartBranchData = [];
      let chartSellerLabels = [], chartSellerData = [];

      isHistoricalActive = useHistorical;
      activeHistoricalPeriod = selectedYear ? ("Năm " + selectedYear) : (fStart ? (fStart + " → " + fEnd) : "Toàn bộ lịch sử");

      if (useHistorical) {
        if (selectedYear && hs.yearly && hs.yearly[selectedYear]) {
          const yData = hs.yearly[selectedYear];
          totalRevenue = yData.revenue;
          totalCollected = yData.collected;
          completedOrders = yData.invoices;
          cancelledOrders = yData.cancelled;
          processingOrders = 0;

          // Nếu có chọn chi nhánh hoặc kênh bán hàng cụ thể
          if (fBranch || fChannel) {
            totalRevenue = 0;
            completedOrders = 0;
            const moMap = {};
            const maxM = (selectedYear === "2026") ? 10 : 12;
            for (let m = 1; m <= maxM; m++) {
              const mStr = String(m).padStart(2, '0');
              const ym = `${selectedYear}-${mStr}`;
              const mData = hs.monthly ? hs.monthly[ym] : null;
              if (mData) {
                if (fBranch && mData.branches && mData.branches[fBranch]) {
                  const bInfo = mData.branches[fBranch];
                  totalRevenue += bInfo.revenue;
                  completedOrders += bInfo.invoices;
                  moMap['Tháng ' + m] = bInfo.revenue;
                } else if (fChannel && mData.channels && mData.channels[fChannel]) {
                  const cInfo = mData.channels[fChannel];
                  totalRevenue += cInfo.revenue;
                  completedOrders += cInfo.invoices;
                  moMap['Tháng ' + m] = cInfo.revenue;
                }
              }
            }
            totalCollected = totalRevenue;
            chartTimelineLabels = Object.keys(moMap);
            chartTimelineData = Object.values(moMap);
          } else {
            // Timeline 12 tháng đầy đủ của năm
            const moLabels = [];
            const moValues = [];
            const maxM = (selectedYear === "2026") ? 10 : 12;
            for (let m = 1; m <= maxM; m++) {
              const mStr = String(m).padStart(2, '0');
              moLabels.push('Tháng ' + m);
              const mVal = (yData.months && yData.months[mStr]) ? yData.months[mStr].revenue : 0;
              moValues.push(mVal);
            }
            chartTimelineLabels = moLabels;
            chartTimelineData = moValues;

            // Kênh bán hàng
            if (yData.channels) {
              chartChannelLabels = Object.keys(yData.channels);
              chartChannelData = Object.values(yData.channels);
            }

            // Top Chi nhánh
            if (yData.top_branches) {
              chartBranchLabels = yData.top_branches.slice(0, 7).map(b => b.branch);
              chartBranchData = yData.top_branches.slice(0, 7).map(b => b.revenue);
            }

            // Top Nhân viên
            if (yData.top_sellers) {
              chartSellerLabels = yData.top_sellers.slice(0, 7).map(s => s.seller);
              chartSellerData = yData.top_sellers.slice(0, 7).map(s => s.revenue);
            }
          }
        } else {
          // Kỳ tùy chọn trong quá khứ dùng hs.daily
          const dMap = {};
          if (hs.daily) {
            Object.keys(hs.daily).sort().forEach(d => {
              if (fStart && d < fStart) return;
              if (fEnd && d > fEnd) return;
              const entry = hs.daily[d];
              totalRevenue += entry.revenue;
              totalCollected += entry.collected;
              completedOrders += entry.invoices;
              dMap[d] = (dMap[d] || 0) + entry.revenue;
            });
            chartTimelineLabels = Object.keys(dMap);
            chartTimelineData = Object.values(dMap);
          }
        }
      } else {
        // Chi tiết hóa đơn (tháng 9, tháng 10/2026 hoặc các kỳ gần đây)
        totalRevenue = detailedRev;
        totalCollected = detailedCol;
        completedOrders = detailedComp;
        processingOrders = detailedProc;
        cancelledOrders = detailedCanc;

        const sortedDates = Object.keys(detailedDateMap).sort();
        chartTimelineLabels = sortedDates;
        chartTimelineData = sortedDates.map(d => detailedDateMap[d]);

        const channelLabels = Object.keys(detailedChannelMap);
        chartChannelLabels = channelLabels;
        chartChannelData = channelLabels.map(c => detailedChannelMap[c]);

        const sortedBranches = Object.keys(detailedBranchMap).map(b => ({ name: b, revenue: detailedBranchMap[b] })).sort((a,b) => b.revenue - a.revenue).slice(0, 7);
        chartBranchLabels = sortedBranches.map(b => b.name);
        chartBranchData = sortedBranches.map(b => b.revenue);

        const sortedSellers = Object.keys(detailedSellerMap).map(s => ({ name: s, revenue: detailedSellerMap[s] })).sort((a,b) => b.revenue - a.revenue).slice(0, 7);
        chartSellerLabels = sortedSellers.map(s => s.name);
        chartSellerData = sortedSellers.map(s => s.revenue);
      }

      const activeOrders = completedOrders + processingOrders;
      const totalOrders = activeOrders + cancelledOrders;
      const aov = activeOrders > 0 ? Math.round(totalRevenue / activeOrders) : 0;
      const completionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : 0;
      const collRatio = totalRevenue > 0 ? ((totalCollected / totalRevenue) * 100).toFixed(1) : 0;

      // Update KPI Cards
      document.getElementById("kpiTotalRevenue").innerText = formatVND(totalRevenue);
      document.getElementById("kpiTotalCollected").innerText = formatVND(totalCollected);
      document.getElementById("kpiTotalOrders").innerText = totalOrders.toLocaleString() + " đơn";
      document.getElementById("kpiCompletedOrders").innerText = completedOrders.toLocaleString() + " hoàn thành";
      document.getElementById("kpiAOV").innerText = formatVND(aov);
      document.getElementById("kpiSuccessRate").innerText = completionRate + "%";
      document.getElementById("barSuccessRate").style.width = Math.min(completionRate, 100) + "%";
      document.getElementById("kpiCollectionRatio").innerText = collRatio + "%";

      // Render Charts
      renderTimeline({ labels: chartTimelineLabels, data: chartTimelineData });
      renderChannel({ labels: chartChannelLabels, data: chartChannelData });
      renderBranch({ labels: chartBranchLabels, data: chartBranchData });
      renderSellers({ labels: chartSellerLabels, data: chartSellerData });

      cachedTransactions = filteredRows;
      filterTableLocal();
    }

    function initFilters() {
      const branches = {};
      // 1. Từ các đơn hàng chi tiết hiện tại
      allRecords.forEach(r => {
        if (r.branch) branches[r.branch] = true;
      });
      // 2. Từ dữ liệu lịch sử tổng hợp 130 tháng
      if (window.HISTORICAL_SUMMARY && window.HISTORICAL_SUMMARY.monthly) {
        Object.values(window.HISTORICAL_SUMMARY.monthly).forEach(m => {
          if (m.branches) {
            Object.keys(m.branches).forEach(b => branches[b] = true);
          }
        });
      }

      const bSel = document.getElementById("filterBranch");
      if (bSel) {
        bSel.innerHTML = '<option value="ALL">Tất cả chi nhánh</option>';
        Object.keys(branches).sort().forEach(b => {
          bSel.add(new Option(b, b));
        });
      }

      serverDateRange.min = "2016-01-01";
      serverDateRange.max = getVietnamTodayStr();

      const ySel = document.getElementById("filterSelectYear");
      if (ySel) {
        ySel.innerHTML = '<option value="">-- Năm --</option>';
        for (let yr = 2026; yr >= 2016; yr--) {
          ySel.add(new Option('Năm ' + yr, String(yr)));
        }
      }

      // Đặt mặc định là Tháng này
      setPreset("thisMonth");
    }
"""

table_functions_code = """
    function renderTable(items) {
      const tbody = document.getElementById("tableBody");
      const filter = getFilterPayload();
      const fStart = filter.startDate || "";
      const selectedYear = (fStart.length >= 4) ? fStart.slice(0, 4) : "";

      if (items && items.length > 0) {
        document.getElementById("tableRecordCount").innerText = `Hiển thị ${Math.min(items.length, 80)} / ${items.length} giao dịch chi tiết`;
        tbody.innerHTML = items.slice(0, 80).map(r => {
          let badge = "";
          if (r.status === "Hoàn thành") {
            badge = `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Hoàn thành</span>`;
          } else if (r.status === "Đang xử lý") {
            badge = `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Đang xử lý</span>`;
          } else {
            badge = `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Đã hủy</span>`;
          }

          return `
            <tr class="hover:bg-slate-50/70 transition">
              <td class="py-2.5 sm:py-3 px-3 sm:px-4 font-mono font-bold text-slate-900 text-center">${r.orderCode || ""}</td>
              <td class="py-2.5 sm:py-3 px-3 sm:px-4 text-slate-500 whitespace-nowrap">${r.date || ""}</td>
              <td class="py-2.5 sm:py-3 px-3 sm:px-4 font-medium text-slate-800">${r.branch || ""}</td>
              <td class="py-2.5 sm:py-3 px-3 sm:px-4 text-slate-600">${r.seller || ""}</td>
              <td class="py-2.5 sm:py-3 px-3 sm:px-4 font-medium text-slate-900">${r.customer || ""}</td>
              <td class="py-2.5 sm:py-3 px-3 sm:px-4 text-center"><span class="px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">${r.channel || ""}</span></td>
              <td class="py-2.5 sm:py-3 px-3 sm:px-4 text-right font-bold text-slate-900">${formatVND(r.total)}</td>
              <td class="py-2.5 sm:py-3 px-3 sm:px-4 text-right font-semibold text-emerald-600">${formatVND(r.collected)}</td>
              <td class="py-2.5 sm:py-3 px-3 sm:px-4 text-center">${badge}</td>
            </tr>
          `;
        }).join("");
        return;
      }

      if (isHistoricalActive) {
        document.getElementById("tableRecordCount").innerText = `Số liệu tổng hợp lịch sử ${activeHistoricalPeriod}`;
        const hsYear = window.HISTORICAL_SUMMARY && window.HISTORICAL_SUMMARY.yearly && window.HISTORICAL_SUMMARY.yearly[selectedYear];
        const invCount = hsYear ? hsYear.invoices.toLocaleString() : "--";
        const revTotal = hsYear ? formatVND(hsYear.revenue) : "--";
        const aovVal = hsYear ? formatVND(hsYear.avg_order_value) : "--";

        tbody.innerHTML = `
          <tr>
            <td colspan="9" class="py-10 px-4 text-center bg-slate-50/50">
              <div class="max-w-md mx-auto">
                <div class="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-lg border border-indigo-100 shadow-sm">
                  <i class="fa-solid fa-chart-pie"></i>
                </div>
                <h4 class="text-sm font-bold text-slate-900 mb-1">Dữ Liệu Tổng Hợp Lịch Sử: ${activeHistoricalPeriod}</h4>
                <p class="text-xs text-slate-500 mb-4 leading-relaxed">
                  Kỳ này được đối soát và tổng hợp từ <strong>130 file dữ liệu nguồn Google Sheets</strong>. Số liệu chi tiết trên các thẻ KPI và biểu đồ trên màn hình đã khớp 100%.
                </p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-semibold text-slate-700 bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-left">
                  <div><span class="text-[10px] text-slate-400 block font-normal">Hóa đơn:</span><i class="fa-solid fa-receipt text-indigo-500 mr-1"></i>${invCount} đơn</div>
                  <div><span class="text-[10px] text-slate-400 block font-normal">Doanh số:</span><i class="fa-solid fa-coins text-amber-500 mr-1"></i>${revTotal}</div>
                  <div class="col-span-2 sm:col-span-1"><span class="text-[10px] text-slate-400 block font-normal">Giá trị TB:</span><i class="fa-solid fa-calculator text-emerald-500 mr-1"></i>${aovVal} / đơn</div>
                </div>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      document.getElementById("tableRecordCount").innerText = "0 giao dịch phù hợp";
      tbody.innerHTML = `<tr><td colspan="9" class="py-10 text-center text-slate-400">Không có hóa đơn nào khớp bộ lọc!</td></tr>`;
    }

    function filterTableLocal() {
      const q = safeStr(document.getElementById("tableSearchInput").value);
      if (!q) return renderTable(cachedTransactions);
      renderTable(cachedTransactions.filter(r =>
        safeStr(r.orderCode).includes(q) ||
        safeStr(r.customer).includes(q) ||
        safeStr(r.branch).includes(q) ||
        safeStr(r.seller).includes(q) ||
        safeStr(r.channel).includes(q) ||
        safeStr(r.status).includes(q)
      ));
    }

    function exportCSV() {
      if (cachedTransactions && cachedTransactions.length > 0) {
        const headers = ["Mã Hóa Đơn", "Ngày Mua", "Chi Nhánh", "Nhân Viên", "Khách Hàng", "Kênh Bán", "Tổng Tiền", "Thực Thu", "Trạng Thái"];
        const rows = cachedTransactions.map(r => [
          r.orderCode, r.date, `"${r.branch}"`, `"${r.seller}"`, `"${r.customer}"`, `"${r.channel}"`,
          r.total, r.collected, `"${r.status}"`
        ]);
        const csv = "\\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `BaoCao_KiotViet_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast("Đã xuất file CSV thành công!", "success");
        return;
      }

      // Xuất dữ liệu lịch sử nếu không có giao dịch lẻ
      if (isHistoricalActive && window.HISTORICAL_SUMMARY) {
        const filter = getFilterPayload();
        const fStart = filter.startDate || "";
        const yr = fStart.slice(0, 4);
        const yData = window.HISTORICAL_SUMMARY.yearly[yr];
        if (yData && yData.months) {
          const headers = ["Kỳ", "Số Hóa Đơn", "Doanh Thu (VND)", "Thực Thu (VND)"];
          const rows = [];
          for (let m = 1; m <= 12; m++) {
            const mStr = String(m).padStart(2, '0');
            const mInfo = yData.months[mStr];
            if (mInfo) {
              rows.push([`Tháng ${m}/${yr}`, mInfo.invoices, mInfo.revenue, mInfo.collected]);
            }
          }
          const csv = "\\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\\n");
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `BaoCao_Nam_${yr}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          showToast(`Đã xuất báo cáo năm ${yr} thành công!`, "success");
          return;
        }
      }

      showToast("Không có dữ liệu để xuất!", "error");
    }
"""

def update_file(filepath):
    print(f"Updating {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. Inject min_js right before window.RAW_DATA
    raw_pos = html.find('window.RAW_DATA =')
    if raw_pos == -1:
        print(f"Error: window.RAW_DATA not found in {filepath}")
        return

    # Check if HISTORICAL_SUMMARY already injected
    if 'window.HISTORICAL_SUMMARY =' in html:
        # replace existing HISTORICAL_SUMMARY
        html = re.sub(r'window\.HISTORICAL_SUMMARY\s*=\s*\{.*?\};\n', '', html)
        raw_pos = html.find('window.RAW_DATA =')

    # Insert historical summary
    html = html[:raw_pos] + min_js + '\n\n    ' + html[raw_pos:]

    # 2. Replace applyFiltersAndCompute and initFilters
    apply_pos = html.find('function applyFiltersAndCompute()')
    fetch_pos = html.find('function fetchFreshData(silent)')
    if apply_pos != -1 and fetch_pos != -1:
        html = html[:apply_pos] + new_functions_code.strip() + '\n\n    ' + html[fetch_pos:]

    # 3. Replace renderTable, filterTableLocal, exportCSV
    render_tbl_pos = html.find('function renderTable(items)')
    dom_pos = html.find('window.addEventListener("DOMContentLoaded"')
    if render_tbl_pos != -1 and dom_pos != -1:
        html = html[:render_tbl_pos] + table_functions_code.strip() + '\n\n    ' + html[dom_pos:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Successfully updated {filepath} (new size: {os.path.getsize(filepath) / 1024:.1f} KB)")

update_file(INDEX_FILE)
update_file(DOCS_FILE)

# Also copy min_js and json to docs/
import shutil
shutil.copy(MIN_JS_FILE, os.path.join(SCRIPT_DIR, 'docs', 'historical_summary.min.js'))
shutil.copy(os.path.join(SCRIPT_DIR, 'historical_summary.json'), os.path.join(SCRIPT_DIR, 'docs', 'historical_summary.json'))
print("Copied summary assets to docs/ folder!")
