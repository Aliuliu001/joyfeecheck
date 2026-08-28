/**
 * Importer - Xử lý đọc file Excel (SheetJS)
 */

window.Importer = {
  // Đọc file dưới dạng ArrayBuffer
  readFileAsArrayBuffer: function(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Không thể đọc file: ' + e.message));
      reader.readAsArrayBuffer(file);
    });
  },

  // Tìm index của cột dựa trên từ khóa header
  findColumnIndex: function(headers, keywords) {
    const lowerKeywords = keywords.map(k => Utils.normalizeText(k));
    for (let i = 0; i < headers.length; i++) {
      if (!headers[i]) continue;
      const val = Utils.normalizeText(headers[i].toString());
      if (lowerKeywords.some(k => val.includes(k))) {
        return i;
      }
    }
    return -1;
  },

  // Parse Danh Sách Học Sinh (Google Sheets)
  parseGoogleSheets: async function(file) {
    try {
      const data = await this.readFileAsArrayBuffer(file);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // Tìm sheet chứa dữ liệu (có MSHS hoặc Full name)
      let dataSheet = workbook.Sheets[workbook.SheetNames[0]];
      let dataMatrix = XLSX.utils.sheet_to_json(dataSheet, { header: 1 });
      
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const text = JSON.stringify(matrix).toLowerCase();
        if (text.includes('mã học sinh') || text.includes('mshs') || text.includes('full name')) {
          dataSheet = sheet;
          dataMatrix = matrix;
          break;
        }
      }

      // Xác định header row (dòng có nhiều từ khóa header nhất)
      let headerRowIdx = 0;
      let maxMatches = 0;
      const expectedKeywords = ['stt', 'mshs', 'lớp', 'họ tên', 'stk'];
      
      for (let i = 0; i < Math.min(10, dataMatrix.length); i++) {
        const row = dataMatrix[i];
        if (!row || row.length === 0) continue;
        const rowStr = row.map(cell => Utils.normalizeText(cell || '')).join(' ');
        let matches = expectedKeywords.filter(kw => rowStr.includes(Utils.normalizeText(kw))).length;
        if (matches > maxMatches) {
          maxMatches = matches;
          headerRowIdx = i;
        }
      }

      const headers = dataMatrix[headerRowIdx];
      const students = [];
      
      // Tìm các cột
      const colMap = {
        stt: this.findColumnIndex(headers, ['STT']),
        teacher: this.findColumnIndex(headers, ['Teacher', 'Giáo viên', 'GV']),
        shift: this.findColumnIndex(headers, ['Shift', 'Ca']),
        className: this.findColumnIndex(headers, ['Class', 'Mã lớp', 'Lớp']),
        fullName: this.findColumnIndex(headers, ['Full name', 'Họ tên', 'Tên']),
        mshs: this.findColumnIndex(headers, ['MSHS', 'Mã học sinh', 'Mã HS']),
        phone: this.findColumnIndex(headers, ['SDT', 'SĐT', 'Số điện thoại', 'SDT Liên Lạc']),
        stkPH: this.findColumnIndex(headers, ['STK_PH', 'STK', 'Số tài khoản']),
        tenTK: this.findColumnIndex(headers, ['Tên TK', 'TenTK', 'Tên tài khoản']),
        hocPhi: this.findColumnIndex(headers, ['Học phí', 'Học Phí', 'HP']),
        diaChi: this.findColumnIndex(headers, ['Địa chỉ']),
        ghiChu: this.findColumnIndex(headers, ['Ghi chú', 'GhiChu'])
      };

      // Đọc data rows
      for (let i = headerRowIdx + 1; i < dataMatrix.length; i++) {
        const row = dataMatrix[i];
        if (!row || row.length === 0) continue;
        
        // Skip empty rows
        if (!row[colMap.mshs] && !row[colMap.fullName]) continue;

        let hocPhiVal = Utils.parseNumber(document.getElementById('default-fee')?.value) || APP_CONFIG.DEFAULT_HOC_PHI;
        const hocPhiRaw = row[colMap.hocPhi];
        if (hocPhiRaw !== undefined) {
            const parsed = Utils.parseNumber(hocPhiRaw);
            if (parsed > 0) hocPhiVal = parsed;
        }

        const student = {
          stt: row[colMap.stt] || i,
          mshs: (row[colMap.mshs] || '').toString().trim().toUpperCase(),
          fullName: (row[colMap.fullName] || '').toString().trim(),
          teacher: colMap.teacher >= 0 ? (row[colMap.teacher] || '').toString().trim() : '',
          shift: colMap.shift >= 0 ? (row[colMap.shift] || '').toString().trim() : '',
          className: colMap.className >= 0 ? (row[colMap.className] || '').toString().trim() : '',
          phone: colMap.phone >= 0 ? (row[colMap.phone] || '').toString().trim() : '',
          stkPH: colMap.stkPH >= 0 ? Utils.normalizeSTK(row[colMap.stkPH]) : '',
          tenTK: colMap.tenTK >= 0 ? (row[colMap.tenTK] || '').toString().trim() : '',
          hocPhi: hocPhiVal,
          ghiChuGiaDinh: colMap.ghiChu >= 0 ? (row[colMap.ghiChu] || '').toString().trim() : '',
          diaChi: colMap.diaChi >= 0 ? (row[colMap.diaChi] || '').toString().trim() : ''
        };
        
        students.push(student);
      }

      console.log(`Đã parse ${students.length} học sinh`);
      return { students, rawHeaders: headers };
    } catch (e) {
      console.error(e);
      if (window.Utils) window.Utils.showToast('Lỗi khi đọc file học sinh: ' + e.message, 'error');
      return { students: [], rawHeaders: [] };
    }
  },

  // Parse Sao Kê VietinBank
  parseSaoKeVietinBank: async function(file) {
    try {
      const data = await this.readFileAsArrayBuffer(file);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const dataMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      let headerRowIdx = -1;
      let bestScore = 0;
      // Duyệt rộng hơn (sao kê VietinBank có block "thông tin tài khoản" phía trên
      // nên dòng tiêu đề thực tế có thể nằm sâu, ví dụ row 24).
      for (let i = 0; i < Math.min(40, dataMatrix.length); i++) {
        const row = dataMatrix[i];
        if (!row) continue;
        const rowStr = row.join(' ').toLowerCase();
        // Ưu tiên dòng tiêu đề chuẩn: chứa "đối ứng" (STK đối ứng + Tên TK đối ứng)
        if (rowStr.includes('đối ứng')) {
          headerRowIdx = i;
          break;
        }
        // Dự phòng: dòng có "ghi có"/"credit"
        const score = (rowStr.includes('ghi có') ? 1 : 0) + (rowStr.includes('credit') ? 1 : 0);
        if (score > bestScore) {
          bestScore = score;
          headerRowIdx = i;
        }
      }

      if (headerRowIdx === -1) {
        throw new Error('Không tìm thấy dòng tiêu đề sao kê VietinBank');
      }

      const headers = dataMatrix[headerRowIdx];
      const colMap = {
        stt: this.findColumnIndex(headers, ['STT']),
        ngayGD: this.findColumnIndex(headers, ['NgayGD', 'Ngày GD', 'Ngày giao dịch', 'Ngày', 'Date']),
        moTa: this.findColumnIndex(headers, ['MoTa', 'Mô tả', 'Nội dung', 'Diễn giải', 'Details']),
        debit: this.findColumnIndex(headers, ['Ghi nợ', 'Debit']),
        credit: this.findColumnIndex(headers, ['Credit', 'Ghi có']),
        balance: this.findColumnIndex(headers, ['Số dư', 'Balance']),
        stkDoiUng: this.findColumnIndex(headers, ['STK_DoiUng', 'STK đối ứng', 'Số TK đối ứng', 'Số tài khoản đối ứng']),
        tenTKDoiUng: this.findColumnIndex(headers, ['TenTK_DoiUng', 'Tên TK đối ứng', 'Tên tài khoản đối ứng', 'Tên đối ứng'])
      };

      const transactions = [];
      for (let i = headerRowIdx + 1; i < dataMatrix.length; i++) {
        const row = dataMatrix[i];
        if (!row || row.length === 0) continue;

        const credit = Utils.parseNumber(row[colMap.credit]);
        if (credit <= 0) continue; // Chỉ lấy dòng có tiền VÀO

        transactions.push({
          stt: row[colMap.stt] || i,
          date: Utils.formatDate(row[colMap.ngayGD]),
          description: (row[colMap.moTa] || '').toString().trim(),
          debit: Utils.parseNumber(row[colMap.debit]),
          credit: credit,
          balance: colMap.balance >= 0 ? Utils.parseNumber(row[colMap.balance]) : 0,
          maGD: '', // Tùy form
          stkDoiUng: colMap.stkDoiUng >= 0 ? Utils.normalizeSTK(row[colMap.stkDoiUng]) : '',
          tenTKDoiUng: colMap.tenTKDoiUng >= 0 ? (row[colMap.tenTKDoiUng] || '').toString().trim() : '',
          matchedMSHS: null,
          matchSource: null
        });
      }

      return transactions;
    } catch (e) {
      console.error(e);
      if (window.Utils) window.Utils.showToast('Lỗi khi đọc sao kê VietinBank: ' + e.message, 'error');
      return [];
    }
  },

  // Parse Sao Kê TPBank
  parseSaoKeTPBank: async function(file) {
    try {
      const data = await this.readFileAsArrayBuffer(file);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const dataMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(20, dataMatrix.length); i++) {
        const row = dataMatrix[i];
        if (!row) continue;
        const rowStr = row.join(' ').toLowerCase();
        if ((rowStr.includes('transaction date') && rowStr.includes('credit')) || 
            (rowStr.includes('ngày') && rowStr.includes('ghi có'))) {
          headerRowIdx = i;
          break;
        }
      }

      if (headerRowIdx === -1) {
        throw new Error('Không tìm thấy dòng tiêu đề sao kê TPBank');
      }

      const headers = dataMatrix[headerRowIdx];
      const colMap = {
        date: this.findColumnIndex(headers, ['Transaction Date', 'Ngày giao dịch', 'Ngày', 'Ngày GD']),
        ref: this.findColumnIndex(headers, ['Reference Number', 'Số tham chiếu']),
        explanation: this.findColumnIndex(headers, ['Explanation', 'Diễn giải', 'Nội dung']),
        credit: this.findColumnIndex(headers, ['Credit', 'Ghi có']),
        balance: this.findColumnIndex(headers, ['Balance', 'Số dư']),
        debit: this.findColumnIndex(headers, ['Debit', 'Ghi nợ'])
      };

      const transactions = [];
      for (let i = headerRowIdx + 1; i < dataMatrix.length; i++) {
        const row = dataMatrix[i];
        if (!row || row.length === 0) continue;

        const credit = Utils.parseNumber(row[colMap.credit]);
        const debit = Utils.parseNumber(row[colMap.debit]);
        
        if (credit <= 0 || debit > 0) continue; // Chỉ lấy tiền VÀO, không chi ra

        const explanation = (row[colMap.explanation] || '').toString().trim();
        
        // Bỏ qua các giao dịch nội bộ cá nhân
        // const isPersonal = /LE THI TUYET NHUNG chuyen tien/i.test(explanation);
        // if (isPersonal) return null;
                           
        transactions.push({
          date: Utils.formatDate(row[colMap.date]),
          refNumber: colMap.ref >= 0 ? (row[colMap.ref] || '').toString().trim() : '',
          explanation: explanation,
          debit: debit,
          credit: credit,
          balance: colMap.balance >= 0 ? Utils.parseNumber(row[colMap.balance]) : 0,
          matchedMSHS: null,
          matchSource: null,
          matchedKeyword: null
        });
      }

      return transactions;
    } catch (e) {
      console.error(e);
      if (window.Utils) window.Utils.showToast('Lỗi khi đọc sao kê TPBank: ' + e.message, 'error');
      return [];
    }
  },

  // Parse Tiền Mặt
  parseTienMat: async function(file) {
    try {
      const data = await this.readFileAsArrayBuffer(file);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const dataMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(10, dataMatrix.length); i++) {
        const row = dataMatrix[i];
        if (!row) continue;
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('số tiền') || rowStr.includes('số tiền đóng')) {
          headerRowIdx = i;
          break;
        }
      }

      if (headerRowIdx === -1) {
        throw new Error('Không tìm thấy dòng tiêu đề file Tiền mặt');
      }

      const headers = dataMatrix[headerRowIdx];
      const colMap = {
        date: this.findColumnIndex(headers, ['NGAY', 'Ngày']),
        className: this.findColumnIndex(headers, ['LỚP', 'Lớp']),
        fullName: this.findColumnIndex(headers, ['HỌ TÊN', 'Họ tên', 'Tên']),
        amount: this.findColumnIndex(headers, ['SỐ TIỀN', 'Số tiền', 'Số tiền đóng']),
        mshs: this.findColumnIndex(headers, ['MSHS', 'Mã HS', 'Mã']),
        ghiChu: this.findColumnIndex(headers, ['GHI CHÚ', 'Ghi chú'])
      };

      const payments = [];
      for (let i = headerRowIdx + 1; i < dataMatrix.length; i++) {
        const row = dataMatrix[i];
        if (!row || row.length === 0) continue;

        const amount = Utils.parseNumber(row[colMap.amount]);
        if (amount <= 0) continue;

        payments.push({
          date: Utils.formatDate(row[colMap.date]),
          className: colMap.className >= 0 ? (row[colMap.className] || '').toString().trim() : '',
          fullName: colMap.fullName >= 0 ? (row[colMap.fullName] || '').toString().trim() : '',
          amount: amount,
          mshs: colMap.mshs >= 0 ? (row[colMap.mshs] || '').toString().trim() : '',
          ghiChu: colMap.ghiChu >= 0 ? (row[colMap.ghiChu] || '').toString().trim() : ''
        });
      }

      return payments;
    } catch (e) {
      console.error(e);
      if (window.Utils) window.Utils.showToast('Lỗi khi đọc file Tiền mặt: ' + e.message, 'error');
      return [];
    }
  }
};
