/**
 * JOY FEE CHECK - Exporter Module
 * Handles Excel file generation using SheetJS (XLSX)
 */

window.Exporter = {
  // Simple helper to download
  triggerDownload(workbook, filename) {
    XLSX.writeFile(workbook, filename);
  },

  // Helper to autofit columns based on data length
  autoFitColumns(ws, data, headerKeys) {
    const colWidths = headerKeys.map(key => {
      let maxLen = key.length;
      if (data && data.length) {
        data.forEach(row => {
          const val = row[key];
          const len = val ? val.toString().length : 0;
          if (len > maxLen) maxLen = len;
        });
      }
      return { wch: Math.min(maxLen + 2, 50) };
    });
    ws['!cols'] = colWidths;
  },

  /**
   * Export internal reconciliation report
   */
  exportBaoCao(reportRows, stats, monthYear) {
    const wb = XLSX.utils.book_new();
    
    const dataRows = reportRows.map((row, index) => ({
      'STT': index + 1,
      'MSHS': row.mshs,
      'Họ tên': row.fullName,
      'Lớp': row.className,
      'GV': row.teacher,
      'Tổng HP': row.tongHocPhi,
      'CK VietinBank': row.chuyenKhoanVTB,
      'Tiền mặt': row.tienMat,
      'CK TPBank': row.chuyenKhoanTPB,
      'Tổng đã đóng': row.tongDaDong,
      'Trạng thái': row.trangThai,
      'Ghi chú': row.ghiChuGiaDinh
    }));

    // Add total row
    dataRows.push({
      'STT': '',
      'MSHS': '',
      'Họ tên': 'TỔNG CỘNG',
      'Lớp': '',
      'GV': '',
      'Tổng HP': stats.tongHocPhi,
      'CK VietinBank': '',
      'Tiền mặt': '',
      'CK TPBank': '',
      'Tổng đã đóng': stats.tongThu,
      'Trạng thái': '',
      'Ghi chú': ''
    });

    const ws = XLSX.utils.json_to_sheet(dataRows);
    
    // Add Header Rows above data manually by inserting them
    XLSX.utils.sheet_add_aoa(ws, [
      [APP_CONFIG.COMPANY_NAME],
      [`BÁO CÁO ĐỐI SOÁT - ${monthYear}`],
      [`Ngày tạo: ${new Date().toLocaleDateString('vi-VN')}`],
      []
    ], { origin: 'A1' });

    // Shift the JSON data down (we need to remake the sheet to insert titles easily)
    // Actually, a better way is to create an array of arrays (AoA) from start
    
    const finalAoA = [
      [APP_CONFIG.COMPANY_NAME],
      [`BÁO CÁO ĐỐI SOÁT - ${monthYear}`],
      [`Ngày tạo: ${new Date().toLocaleDateString('vi-VN')}`],
      [],
      ['STT', 'MSHS', 'Họ tên', 'Lớp', 'GV', 'Tổng HP', 'CK VietinBank', 'Tiền mặt', 'CK TPBank', 'Tổng đã đóng', 'Trạng thái', 'Ghi chú']
    ];

    dataRows.forEach(row => {
      finalAoA.push([
        row['STT'], row['MSHS'], row['Họ tên'], row['Lớp'], row['GV'], row['Tổng HP'],
        row['CK VietinBank'], row['Tiền mặt'], row['CK TPBank'], row['Tổng đã đóng'],
        row['Trạng thái'], row['Ghi chú']
      ]);
    });

    const finalWs = XLSX.utils.aoa_to_sheet(finalAoA);
    this.autoFitColumns(finalWs, dataRows, ['STT', 'MSHS', 'Họ tên', 'Lớp', 'GV', 'Tổng HP', 'CK VietinBank', 'Tiền mặt', 'CK TPBank', 'Tổng đã đóng', 'Trạng thái', 'Ghi chú']);
    
    XLSX.utils.book_append_sheet(wb, finalWs, 'BÁO CÁO ĐỐI SOÁT');
    
    const filename = `BaoCao_DoiSoat_${monthYear.replace(/[/ ]/g, '_')}.xlsx`;
    this.triggerDownload(wb, filename);
  },

  /**
   * Export accounting outputs (Thuc te, Ghi HD, Thay doi)
   */
  exportKeToan(thucTeRows, ghiHDRows, changeRows, monthYear, prevMonthHD = []) {
    const wb = XLSX.utils.book_new();

    const newStudents = new Set();
    const quitStudents = new Set();
    changeRows.forEach(c => {
      if (c.type === APP_CONFIG.CHANGE_TYPE.NEW) {
        newStudents.add(c.mshs);
      }
      if (c.type === APP_CONFIG.CHANGE_TYPE.QUIT) {
        quitStudents.add(c.mshs);
      }
    });

    // Detect "Giam bot" from HĐ perspective:
    // HS was in prevMonthHD (ghi HĐ tháng trước) but NOT in current ghiHDRows
    const currentHDMSHS = new Set(ghiHDRows.map(r => r.mshs));
    const giamBotFromHD = prevMonthHD.filter(mshs => !currentHDMSHS.has(mshs) || quitStudents.has(mshs));

    const headers = ['STT', 'Mã học sinh', 'Mã lớp', 'Họ tên học sinh', 'Giáo viên', 'Học phí', 'Địa chỉ', 'Ghi chú'];

    // 1. Sheet "Thực Tế"
    const aoaThucTe = [ headers ];
    let totalThucTe = 0;
    thucTeRows.forEach((item, idx) => {
      aoaThucTe.push([
        idx + 1, item.mshs, item.className, item.fullName, item.teacher, item.hocPhi, item.diaChi, item.ghiChu || ''
      ]);
      totalThucTe += (item.hocPhi || 0);
    });
    aoaThucTe.push(['', '', '', '', '', totalThucTe, '', '']);
    const wsThucTe = XLSX.utils.aoa_to_sheet(aoaThucTe);
    this.autoFitColumns(wsThucTe, thucTeRows, headers);
    XLSX.utils.book_append_sheet(wb, wsThucTe, 'Thực Tế');

    // 2. Sheet "Danh sách viết HĐ"
    const aoaGhiHD = [
      [APP_CONFIG.COMPANY_NAME, '', '', '', '', '', '', ''],
      [APP_CONFIG.COMPANY_TAX, '', '', '', '', '', '', ''],
      [APP_CONFIG.COMPANY_ADDRESS, '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      [`DANH SACH HỌC SINH THÁNG ${monthYear.replace('/', '.')}`, '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      headers
    ];
    let totalGhiHD = 0;
    ghiHDRows.forEach((item, idx) => {
      let note = item.ghiChu || '';
      if (newStudents.has(item.mshs)) {
        note = note ? note + ' - Tang moi' : 'Tang moi';
      }
      aoaGhiHD.push([
        idx + 1, item.mshs, item.className, item.fullName, item.teacher, item.hocPhi, item.diaChi, note
      ]);
      totalGhiHD += (item.hocPhi || 0);
    });
    
    aoaGhiHD.push(['', '', '', '', '', totalGhiHD, '', '']);
    aoaGhiHD.push(['Số tiền bằng chữ:', '', '', '', '', '', '', '']);
    aoaGhiHD.push(['', '', '', '', '', 'Giám đốc', '', '']);
    aoaGhiHD.push(['', '', '', '', '', '', '', '']);
    aoaGhiHD.push(['', '', '', '', '', 'TRUONG TUAN NGOC', '', '']);

    const wsGhiHD = XLSX.utils.aoa_to_sheet(aoaGhiHD);
    this.autoFitColumns(wsGhiHD, ghiHDRows, headers);
    XLSX.utils.book_append_sheet(wb, wsGhiHD, 'Danh sách viết HĐ');

    // 3. Sheet "Bảng thay đổi" — include "Giam bot" rows
    const changeHeaders = ['Loại thay đổi', 'MSHS', 'Họ tên', 'Lớp cũ', 'Lớp mới', 'Ghi chú'];
    const aoaThayDoi = [
      [APP_CONFIG.COMPANY_NAME],
      [`MST: ${APP_CONFIG.COMPANY_TAX}`],
      [`Địa chỉ: ${APP_CONFIG.COMPANY_ADDRESS}`],
      [],
      ['BẢNG THAY ĐỔI SO VỚI THÁNG TRƯỚC'],
      [],
      changeHeaders
    ];
    changeRows.forEach(item => {
      let typeLabel = '';
      switch (item.type) {
        case APP_CONFIG.CHANGE_TYPE.NEW: typeLabel = 'Tăng mới'; break;
        case APP_CONFIG.CHANGE_TYPE.QUIT: typeLabel = 'Nghỉ học'; break;
        case APP_CONFIG.CHANGE_TYPE.CLASS_CHANGE: typeLabel = 'Đổi lớp'; break;
        case APP_CONFIG.CHANGE_TYPE.COMPANY_TRANSFER: typeLabel = 'CK TK Công ty'; break;
      }
      aoaThayDoi.push([
        typeLabel, item.mshs, item.fullName, item.oldClass || '', item.newClass || '', item.ghiChu || ''
      ]);
    });

    // Append "Giảm bớt HĐ" rows — HS had HĐ last month but gone this month
    if (giamBotFromHD.length > 0) {
      aoaThayDoi.push([]);
      aoaThayDoi.push(['--- GIẢM BỚT (HĐ tháng trước → không còn) ---', '', '', '', '', '']);
      giamBotFromHD.forEach(mshs => {
        const quitRecord = changeRows.find(c => c.mshs === mshs && c.type === APP_CONFIG.CHANGE_TYPE.QUIT);
        aoaThayDoi.push([
          'Giảm bớt HĐ',
          mshs,
          quitRecord ? quitRecord.fullName : mshs,
          quitRecord ? (quitRecord.oldClass || '') : '',
          '',
          'Tháng trước có ghi HĐ'
        ]);
      });
    }

    const wsThayDoi = XLSX.utils.aoa_to_sheet(aoaThayDoi);
    this.autoFitColumns(wsThayDoi, changeRows, changeHeaders);
    XLSX.utils.book_append_sheet(wb, wsThayDoi, 'Thay đổi');

    const filename = `BaoCao_KeToan_${monthYear.replace(/[/ ]/g, '_')}.xlsx`;
    this.triggerDownload(wb, filename);
  },

  /**
   * Export reminder list for parents
   */
  exportNhacPH(nhacList, monthYear) {
    const wb = XLSX.utils.book_new();
    const dataRows = nhacList.map((row, idx) => ({
      'STT': idx + 1,
      'MSHS': row.mshs,
      'Họ tên': row.fullName,
      'SĐT': row.phone,
      'Số tiền thiếu': row.soTienThieu,
      'Lớp': row.className
    }));

    const ws = XLSX.utils.json_to_sheet(dataRows);
    this.autoFitColumns(ws, dataRows, ['STT', 'MSHS', 'Họ tên', 'SĐT', 'Số tiền thiếu', 'Lớp']);
    
    XLSX.utils.book_append_sheet(wb, ws, 'NHẮC PHỤ HUYNH');
    
    const filename = `DanhSach_NhacPH_${monthYear.replace(/[/ ]/g, '_')}.xlsx`;
    this.triggerDownload(wb, filename);
  },

  /**
   * Export full JSON backup
   */
  exportBackupJSON(data) {
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `JoyFeeCheck_Backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Export monthly archive
   */
  exportMonthlyArchive(allData, monthYear) {
    const dataStr = JSON.stringify(allData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `JoyFeeCheck_Archive_${monthYear.replace(/[/ ]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Export Full Excel (Nhiều sheet)
   */
  exportFullExcel(data) {
    const wb = XLSX.utils.book_new();
    const { students, vtb, tpb, cash, reportRows, stats, stkPhu, keywords, monthYear } = data;

    const createSheet = (aoa, cols) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      this.autoFitColumns(ws, null, cols);
      return ws;
    };

    // 1. Ds_HocSinh
    const hsAoA = [['STT', 'Teacher', 'Shift', 'Class', 'Full name', 'MSHS', 'SDT', 'STK_PH', 'Tên TK', 'Học Phí', 'Địa chỉ', 'Ghi chú']];
    (students || []).forEach((s, idx) => {
      hsAoA.push([idx + 1, s.teacher, s.shift, s.className, s.fullName, s.mshs, s.phone, s.stkPH, s.tenTK, s.hocPhi, s.diaChi, s.ghiChuGiaDinh]);
    });
    XLSX.utils.book_append_sheet(wb, createSheet(hsAoA, hsAoA[0]), 'Ds_HocSinh');

    // 2. SAOKE_RAW (VietinBank)
    const vtbAoA = [['STT', 'NgàyGD', 'Nội dung', 'Ghi nợ', 'Ghi có', 'Số dư', 'STK đối ứng', 'Tên TK đối ứng']];
    (vtb || []).forEach((t, idx) => {
      vtbAoA.push([t.stt || idx + 1, t.date, t.description, t.debit, t.credit, t.balance, t.stkDoiUng, t.tenTKDoiUng]);
    });
    XLSX.utils.book_append_sheet(wb, createSheet(vtbAoA, vtbAoA[0]), 'SAOKE_RAW');

    // 3. SAO_KE_CA_NHAN (TPBank)
    const tpbAoA = [['Transaction Date', 'Reference Number', 'Explanation', 'Debit', 'Credit', 'Balance']];
    (tpb || []).forEach(t => {
      tpbAoA.push([t.date, t.refNumber, t.explanation, t.debit, t.credit, t.balance]);
    });
    XLSX.utils.book_append_sheet(wb, createSheet(tpbAoA, tpbAoA[0]), 'SAO_KE_CA_NHAN');

    // 4. TIEN_MAT
    const cashAoA = [['NGAY DONG', 'LỚP', 'HỌ TEN', 'SỐ TIỀN', 'MSHS', 'GHI CHU']];
    (cash || []).forEach(c => {
      cashAoA.push([c.date, c.className, c.fullName, c.amount, c.mshs, c.ghiChu]);
    });
    XLSX.utils.book_append_sheet(wb, createSheet(cashAoA, cashAoA[0]), 'TIEN_MAT');

    // 5. STK_PHU
    const stkPhuAoA = [['MSHS', 'Họ tên', 'STK_PH', 'Tên TK']];
    (stkPhu || []).forEach(s => {
      stkPhuAoA.push([s.mshs, s.fullName, s.stk, s.tenTK]);
    });
    XLSX.utils.book_append_sheet(wb, createSheet(stkPhuAoA, stkPhuAoA[0]), 'STK_PHU');

    // 6. MAP_TU_KHOA
    const kwAoA = [['TỪ KHÓA', 'MSHS', 'Tên HS']];
    (keywords || []).forEach(k => {
      kwAoA.push([k.keyword, k.mshs, k.studentName]);
    });
    XLSX.utils.book_append_sheet(wb, createSheet(kwAoA, kwAoA[0]), 'MAP_TU_KHOA');

    // 7. BAO_CAO
    const reportAoA = [
      [APP_CONFIG.COMPANY_NAME],
      [`BÁO CÁO ĐỐI SOÁT - ${monthYear}`],
      [],
      ['STT', 'MSHS', 'Họ tên', 'Lớp', 'GV', 'Tổng HP', 'CK VietinBank', 'Tiền mặt', 'CK TPBank', 'Tổng đã đóng', 'Trạng thái', 'Ghi chú']
    ];
    (reportRows || []).forEach((row, idx) => {
      reportAoA.push([
        idx + 1, row.mshs, row.fullName, row.className, row.teacher, row.tongHocPhi,
        row.chuyenKhoanVTB, row.tienMat, row.chuyenKhoanTPB, row.tongDaDong,
        row.trangThai, row.ghiChuGiaDinh
      ]);
    });
    if (stats) {
      reportAoA.push([
        '', '', 'TỔNG CỘNG', '', '', stats.tongHocPhi, '', '', '', stats.tongThu, '', ''
      ]);
    }
    XLSX.utils.book_append_sheet(wb, createSheet(reportAoA, reportAoA[3]), 'BAO_CAO');

    const filename = `JoyFeeCheck_Full_${monthYear.replace(/[/ ]/g, '_')}.xlsx`;
    this.triggerDownload(wb, filename);
  }
};
