import os
import json
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_FILE = os.path.join(SCRIPT_DIR, 'Index.html')
DOCS_FILE = os.path.join(SCRIPT_DIR, 'docs', 'dashboard.html')
MIN_JS_FILE = os.path.join(SCRIPT_DIR, 'historical_summary.min.js')

with open(MIN_JS_FILE, 'r', encoding='utf-8') as f:
    min_js = f.read().strip()

new_functions_code = """
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

      // 1. Lọc các bản ghi chi tiết hiện có trong allRecords (Tháng 09 & Tháng 10/2026)
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

      // 2. Chế độ Tổng hợp lịch sử (Historical Summary):
      // Áp dụng khi chọn Năm (2016-2026) hoặc kỳ trong quá khứ trước tháng 9/2026
      const hs = window.HISTORICAL_SUMMARY;
      const useHistorical = hs && (
        selectedYear !== null || // Bất kỳ năm nào (kể cả 2026, 2025...) dù lọc chi nhánh hay không
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
          const maxM = (selectedYear === "2026") ? 10 : 12;

          if (fBranch) {
            // Lọc theo Chi Nhánh cụ thể cho toàn bộ năm đã chọn (Ví dụ: 161 Võ Văn Ngân)
            const bYearInfo = (yData.branches && yData.branches[fBranch]) ? yData.branches[fBranch] : null;
            totalRevenue = bYearInfo ? bYearInfo.revenue : 0;
            totalCollected = bYearInfo ? (bYearInfo.collected || bYearInfo.revenue) : 0;
            completedOrders = bYearInfo ? bYearInfo.invoices : 0;
            cancelledOrders = 0;
            processingOrders = 0;

            // Monthly timeline cho chi nhánh này (Tháng 1 đến Tháng 10/12)
            const moMap = {};
            for (let m = 1; m <= maxM; m++) {
              const mStr = String(m).padStart(2, '0');
              const ym = `${selectedYear}-${mStr}`;
              const mData = hs.monthly ? hs.monthly[ym] : null;
              moMap['Tháng ' + m] = (mData && mData.branches && mData.branches[fBranch]) ? mData.branches[fBranch].revenue : 0;
            }
            chartTimelineLabels = Object.keys(moMap);
            chartTimelineData = Object.values(moMap);

            // Kênh bán hàng của chi nhánh này
            if (bYearInfo && bYearInfo.channels) {
              chartChannelLabels = Object.keys(bYearInfo.channels);
              chartChannelData = Object.values(bYearInfo.channels);
            }

            // Top chi nhánh (chính chi nhánh đang chọn)
            chartBranchLabels = [fBranch];
            chartBranchData = [totalRevenue];

            // Top nhân viên của chi nhánh này
            if (bYearInfo && bYearInfo.sellers) {
              const sortedSellers = Object.keys(bYearInfo.sellers).map(s => ({ name: s, revenue: bYearInfo.sellers[s] })).sort((a,b) => b.revenue - a.revenue).slice(0, 7);
              chartSellerLabels = sortedSellers.map(s => s.name);
              chartSellerData = sortedSellers.map(s => s.revenue);
            }

            // Nếu người dùng còn lọc thêm cả Kênh bán hàng
            if (fChannel) {
              totalRevenue = (bYearInfo && bYearInfo.channels && bYearInfo.channels[fChannel]) ? bYearInfo.channels[fChannel] : 0;
              totalCollected = totalRevenue;
            }
          } else if (fChannel) {
            // Lọc theo Kênh cụ thể cho toàn bộ năm
            totalRevenue = (yData.channels && yData.channels[fChannel]) ? yData.channels[fChannel] : 0;
            totalCollected = totalRevenue;
            completedOrders = 0;
            const moMap = {};
            for (let m = 1; m <= maxM; m++) {
              const mStr = String(m).padStart(2, '0');
              const ym = `${selectedYear}-${mStr}`;
              const mData = hs.monthly ? hs.monthly[ym] : null;
              moMap['Tháng ' + m] = 0;
              if (mData && mData.channels && mData.channels[fChannel]) {
                const cInfo = mData.channels[fChannel];
                completedOrders += cInfo.invoices;
                moMap['Tháng ' + m] = cInfo.revenue;
              }
            }
            chartTimelineLabels = Object.keys(moMap);
            chartTimelineData = Object.values(moMap);
            chartChannelLabels = [fChannel];
            chartChannelData = [totalRevenue];

            if (yData.top_branches) {
              chartBranchLabels = yData.top_branches.slice(0, 7).map(b => b.branch);
              chartBranchData = yData.top_branches.slice(0, 7).map(b => b.revenue);
            }
          } else {
            // Toàn bộ năm (Tất cả chi nhánh, tất cả kênh)
            totalRevenue = yData.revenue;
            totalCollected = yData.collected;
            completedOrders = yData.invoices;
            cancelledOrders = yData.cancelled;
            processingOrders = 0;

            const moLabels = [];
            const moValues = [];
            for (let m = 1; m <= maxM; m++) {
              const mStr = String(m).padStart(2, '0');
              moLabels.push('Tháng ' + m);
              const mVal = (yData.months && yData.months[mStr]) ? yData.months[mStr].revenue : 0;
              moValues.push(mVal);
            }
            chartTimelineLabels = moLabels;
            chartTimelineData = moValues;

            if (yData.channels) {
              chartChannelLabels = Object.keys(yData.channels);
              chartChannelData = Object.values(yData.channels);
            }

            if (yData.top_branches) {
              chartBranchLabels = yData.top_branches.slice(0, 7).map(b => b.branch);
              chartBranchData = yData.top_branches.slice(0, 7).map(b => b.revenue);
            }

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
      const fBranch = (filter.branch && filter.branch !== "ALL") ? filter.branch : "";

      if (items && items.length > 0) {
        if (isHistoricalActive) {
          document.getElementById("tableRecordCount").innerText = `Hiển thị ${Math.min(items.length, 80)} / ${items.length} giao dịch gần đây (Tháng 9-10). Tổng ${activeHistoricalPeriod}: đầy đủ số liệu trên KPI & Biểu đồ.`;
        } else {
          document.getElementById("tableRecordCount").innerText = `Hiển thị ${Math.min(items.length, 80)} / ${items.length} giao dịch chi tiết`;
        }
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
        let branchNote = "";
        if (fBranch) {
          let firstActiveMonth = null;
          let activeMonthsCount = 0;
          if (hsYear && window.HISTORICAL_SUMMARY && window.HISTORICAL_SUMMARY.monthly) {
            for (let m = 1; m <= 12; m++) {
              const mStr = String(m).padStart(2, '0');
              const ym = `${selectedYear}-${mStr}`;
              const mData = window.HISTORICAL_SUMMARY.monthly[ym];
              if (mData && mData.branches && mData.branches[fBranch]) {
                if (!firstActiveMonth) firstActiveMonth = m;
                activeMonthsCount++;
              }
            }
          }
          if (firstActiveMonth && activeMonthsCount < 12 && selectedYear !== "2026") {
            branchNote = `<div class="mt-2 text-[11px] text-indigo-700 bg-indigo-50 p-2.5 rounded-xl border border-indigo-200 text-left"><i class="fa-solid fa-circle-info mr-1.5 text-indigo-600"></i><strong>Thông tin chi nhánh:</strong> Trong năm ${selectedYear}, <strong>${fBranch}</strong> phát sinh đơn hàng từ <strong>Tháng ${firstActiveMonth}/${selectedYear}</strong> (${activeMonthsCount} tháng hoạt động).</div>`;
          }
        }

        const bYearInfo = (hsYear && fBranch && hsYear.branches && hsYear.branches[fBranch]) ? hsYear.branches[fBranch] : null;
        const invCount = bYearInfo ? bYearInfo.invoices.toLocaleString() : (hsYear ? hsYear.invoices.toLocaleString() : "--");
        const revTotal = bYearInfo ? formatVND(bYearInfo.revenue) : (hsYear ? formatVND(hsYear.revenue) : "--");
        const aovVal = bYearInfo ? formatVND(Math.round(bYearInfo.revenue / bYearInfo.invoices)) : (hsYear ? formatVND(hsYear.avg_order_value) : "--");

        tbody.innerHTML = `
          <tr>
            <td colspan="9" class="py-10 px-4 text-center bg-slate-50/50">
              <div class="max-w-md mx-auto">
                <div class="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-lg border border-indigo-100 shadow-sm">
                  <i class="fa-solid fa-chart-pie"></i>
                </div>
                <h4 class="text-sm font-bold text-slate-900 mb-1">Dữ Liệu Tổng Hợp Lịch Sử: ${activeHistoricalPeriod} ${fBranch ? ('(' + fBranch + ')') : ''}</h4>
                <p class="text-xs text-slate-500 mb-3 leading-relaxed">
                  Kỳ này được đối soát và tổng hợp từ <strong>130 file dữ liệu nguồn Google Sheets</strong>. Số liệu trên các thẻ KPI và biểu đồ trên màn hình đã khớp 100%.
                </p>
                ${branchNote}
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-semibold text-slate-700 bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-left mt-3">
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
        const fBranch = (filter.branch && filter.branch !== "ALL") ? filter.branch : "";

        if (yData && yData.months) {
          const headers = ["Kỳ", "Chi Nhánh", "Số Hóa Đơn", "Doanh Thu (VND)"];
          const rows = [];
          const maxM = (yr === "2026") ? 10 : 12;
          for (let m = 1; m <= maxM; m++) {
            const mStr = String(m).padStart(2, '0');
            const ym = `${yr}-${mStr}`;
            const mData = window.HISTORICAL_SUMMARY.monthly[ym];
            if (fBranch) {
              const bInfo = mData && mData.branches ? mData.branches[fBranch] : null;
              if (bInfo) {
                rows.push([`Tháng ${m}/${yr}`, `"${fBranch}"`, bInfo.invoices, bInfo.revenue]);
              } else {
                rows.push([`Tháng ${m}/${yr}`, `"${fBranch}"`, 0, 0]);
              }
            } else {
              const mInfo = yData.months[mStr];
              if (mInfo) {
                rows.push([`Tháng ${m}/${yr}`, "Tất cả chi nhánh", mInfo.invoices, mInfo.revenue]);
              }
            }
          }
          const csv = "\\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\\n");
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `BaoCao_Nam_${yr}_${fBranch ? fBranch.replace(/[^a-zA-Z0-9]/g, '_') : 'TatCa'}.csv`;
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

    hist_pos = html.find('window.HISTORICAL_SUMMARY =')
    if hist_pos != -1 and hist_pos < raw_pos:
        html = html[:hist_pos] + min_js + '\n\n    ' + html[raw_pos:]
    else:
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
