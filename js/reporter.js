/**
 * JOY FEE CHECK - Reporter Module
 * Handles report generation, filtering, and statistics logic.
 */

window.Reporter = {
  /**
   * Generates report rows aggregating multiple classes per student and mapping payments.
   * @param {Array} students - Array of STUDENT objects from importer
   * @param {Map} paymentsByMSHS - Map of MSHS -> {vtb, tpb, cash, total}
   * @returns {Array} Array of REPORT_ROW objects
   */
  generateReport(students, paymentsByMSHS, familyGroups = [], monthYear = '') {
    const reportRows = [];
    const grouped = new Map();

    // Group student rows by MSHS
    for (const student of students) {
      if (!grouped.has(student.mshs)) {
        grouped.set(student.mshs, []);
      }
      grouped.get(student.mshs).push(student);
    }

    for (const [mshs, classRows] of grouped.entries()) {
      let tongHocPhi = 0;
      let classes = [];
      let teachers = [];
      
      const primaryRow = classRows[0];
      
      for (const row of classRows) {
        tongHocPhi += (Number(row.hocPhi) || 0);
        if (row.className && !classes.includes(row.className)) {
          classes.push(row.className);
        }
        if (row.teacher && !teachers.includes(row.teacher)) {
          teachers.push(row.teacher);
        }
      }
      
      const paymentData = paymentsByMSHS.get(mshs) || { vtb: 0, tpb: 0, cash: 0, total: 0 };
      
      // Check if student has active package
      const packageInfo = Storage.isPackageActive(mshs, monthYear);
      let trangThai = '';
      let soTienThieu = 0;
      
      if (packageInfo.active) {
        // Student has paid via package
        trangThai = APP_CONFIG.STATUS.PACKAGE;
      } else if (paymentData.total >= tongHocPhi && tongHocPhi > 0) {
        trangThai = paymentData.total > tongHocPhi ? APP_CONFIG.STATUS.OVERPAID : APP_CONFIG.STATUS.PAID;
      } else if (paymentData.total > 0 && paymentData.total < tongHocPhi) {
        trangThai = APP_CONFIG.STATUS.PARTIAL;
        soTienThieu = tongHocPhi - paymentData.total;
      } else if (paymentData.total === 0) {
        trangThai = APP_CONFIG.STATUS.UNPAID;
        soTienThieu = tongHocPhi;
      }

      if (soTienThieu < 0) soTienThieu = 0;
      
      // ==========================
      // Tạo Ghi Chú Tự Động
      // ==========================
      let notes = [];
      
      // 0. Đóng gói
      if (packageInfo.active) {
        const discountPercent = packageInfo.discountPercent || 0;
        const discountAmount = Math.floor(tongHocPhi * discountPercent / 100);
        notes.push(`📦 Đã đóng gói: ${packageInfo.packageName} (${packageInfo.startMonth} → ${packageInfo.endMonth})${discountPercent > 0 ? ` — Giảm ${discountPercent}% (${Utils.formatCurrency(discountAmount)}/tháng)` : ''}`);
      }
      
      // 1. CK VietinBank khác mức học phí quy định (cảnh báo hụt HĐ)
      if (paymentData.vtb > 0 && paymentData.vtb !== tongHocPhi) {
        notes.push(`⚠ CK TK CT: ${Utils.formatCurrency(paymentData.vtb)} (HP: ${Utils.formatCurrency(tongHocPhi)})`);
      }

      // 3. Học nhiều lớp
      if (classes.length > 1) {
        notes.push(`Học ${classes.length} lớp`);
      }

      // 4. Nhóm gia đình
      const fg = familyGroups.find(g => g.members.includes(mshs));
      if (fg) {
        notes.push(`GĐ: ${fg.groupName}`);
      }

      // 5. Thiếu / Dư
      if (trangThai === APP_CONFIG.STATUS.PARTIAL) {
        notes.push(`Thiếu: ${Utils.formatCurrency(soTienThieu)}`);
      } else if (trangThai === APP_CONFIG.STATUS.OVERPAID) {
        notes.push(`Dư: ${Utils.formatCurrency(paymentData.total - tongHocPhi)}`);
      }

      let ghiChu = notes.join(' · ');

      reportRows.push({
        mshs: mshs,
        fullName: primaryRow.fullName || '',
        className: classes.join(', '),
        teacher: teachers.join(', '),
        phone: primaryRow.phone || '', // Keep phone for NhacPH later
        tongHocPhi: tongHocPhi,
        chuyenKhoanVTB: paymentData.vtb,
        tienMat: paymentData.cash,
        chuyenKhoanTPB: paymentData.tpb,
        tongDaDong: paymentData.total,
        trangThai: trangThai,
        soTienThieu: soTienThieu,
        ghiChu: ghiChu,
        ghiChuGiaDinh: primaryRow.ghiChuGiaDinh || '',
        coChuyenTKCongTy: paymentData.vtb > 0
      });
    }

    // Sort by MSHS
    reportRows.sort((a, b) => a.mshs.localeCompare(b.mshs));
    return reportRows;
  },

  /**
   * Calculates overall statistics from report rows.
   */
  getStatistics(reportRows) {
    let stats = {
      tongHS: reportRows.length,
      daDong: 0,
      chuaDong: 0,
      dongThieu: 0,
      dongDu: 0,
      dongGoi: 0,
      tongThu: 0,
      tongHocPhi: 0
    };

    for (const row of reportRows) {
      stats.tongThu += (row.tongDaDong || 0);
      stats.tongHocPhi += (row.tongHocPhi || 0);
      
      switch (row.trangThai) {
        case APP_CONFIG.STATUS.PAID:
          stats.daDong++;
          break;
        case APP_CONFIG.STATUS.UNPAID:
          stats.chuaDong++;
          break;
        case APP_CONFIG.STATUS.PARTIAL:
          stats.dongThieu++;
          break;
        case APP_CONFIG.STATUS.OVERPAID:
          stats.dongDu++;
          break;
        case APP_CONFIG.STATUS.PACKAGE:
          stats.dongGoi++;
          break;
      }
    }
    return stats;
  },

  /**
   * Filters report rows based on active filter criteria.
   */
  filterReport(reportRows, filters) {
    const { trangThai, className, teacher, searchText } = filters || {};
    
    return reportRows.filter(row => {
      if (trangThai && trangThai !== 'all' && row.trangThai !== trangThai) return false;
      if (className && className !== 'all' && !row.className.includes(className)) return false;
      if (teacher && teacher !== 'all' && !row.teacher.includes(teacher)) return false;
      
      if (searchText) {
        const query = searchText.toLowerCase();
        if (!row.mshs.toLowerCase().includes(query) && !row.fullName.toLowerCase().includes(query)) {
          return false;
        }
      }
      
      return true;
    });
  }
};
