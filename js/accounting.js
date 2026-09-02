/**
 * JOY FEE CHECK - Accounting Module
 * Handles preparation of accounting reports, practical student lists, invoice selection, and changes detection.
 */

window.Accounting = {
  /**
   * Generate practical student list (DS Thực tế)
   */
  generateThucTe(students) {
    // Exclude students who permanently quit
    const validStudents = students.filter(s => {
      const note = (s.ghiChuGiaDinh || '').toLowerCase().trim();
      // Keep 'nghỉ hè' but exclude 'nghỉ học'
      if (note.includes('nghỉ học')) {
        return false;
      }
      return true;
    });

    // Sort by className then STT
    validStudents.sort((a, b) => {
      const c = (a.className || '').localeCompare(b.className || '');
      if (c !== 0) return c;
      return (a.stt || 0) - (b.stt || 0);
    });

    let counter = 1;
    return validStudents.map(s => ({
      stt: counter++,
      mshs: s.mshs,
      className: s.className || '',
      fullName: s.fullName || '',
      teacher: s.teacher || '',
      hocPhi: s.hocPhi || 0,
      diaChi: s.diaChi || '',
      ghiChu: s.ghiChuGiaDinh || ''
    }));
  },

  /**
   * Prepare the Ghi Hóa Đơn list with auto-selection.
   */
  generateGhiHD(studentsThucTe, prevMonthHDList, vtbMatchedMSHS) {
    const selectedMSHS = new Set();
    const rows = [];
    
    for (const s of studentsThucTe) {
      let isMandatory = vtbMatchedMSHS.has(s.mshs);
      let isSelected = false;
      
      if (prevMonthHDList.includes(s.mshs) || isMandatory) {
        isSelected = true;
      }
      
      if (isSelected) {
        selectedMSHS.add(s.mshs);
      }
      
      rows.push({
        ...s,
        mandatory: isMandatory
      });
    }
    
    return { rows, selectedMSHS };
  },

  /**
   * Compare with previous month to detect new, quit, changed class, or company transfer.
   */
  detectChanges(currentStudents, previousStudents, vtbMatchedMSHS, vtbAmountByMSHS, prevInvoiceStudents, currentInvoiceStudents, suspendedStudents) {
    const changes = [];

    // Use first class row as primary class if multiple exist
    const getPrimary = (students) => {
      const map = new Map();
      for (const s of students) {
        if (!map.has(s.mshs)) {
          map.set(s.mshs, s);
        }
      }
      return map;
    };

    const currMap = getPrimary(currentStudents);
    const prevMap = getPrimary(previousStudents);

    // Set HS tạm ngưng tháng này
    const suspendedSet = new Set((suspendedStudents || []).map(s => s.mshs));

    // Set HS có HP = 0 tháng này
    const freeTuitionSet = new Set();
    for (const [mshs, s] of currMap.entries()) {
      if ((Number(s.hocPhi) || 0) === 0) {
        freeTuitionSet.add(mshs);
      }
    }

    // ============================================================
    // 1. TĂNG MỚI = HS mới CK vào TK Công ty (VietinBank)
    //    Đây là HS bắt buộc có trong DS Ghi HĐ vì đã đóng tiền vào tài khoản công ty
    // ============================================================
    for (const mshs of vtbMatchedMSHS) {
      const cStudent = currMap.get(mshs);
      if (!cStudent) continue;

      const pStudent = prevMap.get(mshs);
      const isNewStudent = !pStudent; // Chưa có tháng trước

      changes.push({
        type: APP_CONFIG.CHANGE_TYPE.COMPANY_TRANSFER,
        mshs: mshs,
        fullName: cStudent.fullName,
        oldClass: null,
        newClass: cStudent.className,
        ghiChu: isNewStudent ? '🆕 HS mới CK TK Công ty' : 'CK qua TK Công ty (VietinBank)'
      });

      // Kiểm tra sai số tiền CK TK công ty
      const hp = Number(cStudent.hocPhi) || 0;
      const ckNop = (vtbAmountByMSHS && vtbAmountByMSHS[mshs]) || 0;
      if (hp > 0 && ckNop !== hp) {
        const chenh = ckNop - hp;
        changes.push({
          type: APP_CONFIG.CHANGE_TYPE.WRONG_AMOUNT,
          mshs: mshs,
          fullName: cStudent.fullName,
          oldClass: null,
          newClass: cStudent.className,
          ghiChu: `Sai số tiền CK TK Công ty: nộp ${Utils.formatCurrency(ckNop)} / quy định ${Utils.formatCurrency(hp)} (${chenh < 0 ? 'THIẾU ' + Utils.formatCurrency(-chenh) : 'DƯ ' + Utils.formatCurrency(chenh)})`
        });
      }
    }

    // ============================================================
    // 2. ĐỔI LỚP = HS có trong cả 2 tháng nhưng lớp khác
    // ============================================================
    for (const [mshs, cStudent] of currMap.entries()) {
      if (vtbMatchedMSHS.has(mshs)) continue; // Đã xử lý ở trên
      const pStudent = prevMap.get(mshs);
      if (pStudent && cStudent.className !== pStudent.className) {
        changes.push({
          type: APP_CONFIG.CHANGE_TYPE.CLASS_CHANGE,
          mshs: mshs,
          fullName: cStudent.fullName,
          oldClass: pStudent.className,
          newClass: cStudent.className,
          ghiChu: 'Đổi lớp'
        });
      }
    }

    // ============================================================
    // 3. GIẢM BỚT = HS tháng trước có trong DS Ghi HĐ mà tháng này:
    //    a) Không còn trong DS Thực tế (nghỉ học), HOẶC
    //    b) HP tháng này = 0 (miễn giảm), HOẶC
    //    c) Bị tạm ngưng lớp
    // ============================================================
    const prevInvSet = new Set((prevInvoiceStudents || []).map(s => s.mshs));

    for (const mshs of prevInvSet) {
      const cStudent = currMap.get(mshs);
      const pStudent = prevMap.get(mshs);
      let ghiChu = '';
      let isReduced = false;

      if (!cStudent) {
        // a) Không còn trong DS Thực tế → nghỉ học
        ghiChu = '🚫 Nghỉ học (không còn trong DS)';
        isReduced = true;
      } else if (freeTuitionSet.has(mshs)) {
        // b) HP = 0 → miễn giảm
        ghiChu = '💰 HP = 0 (miễn giảm)';
        isReduced = true;
      } else if (suspendedSet.has(mshs)) {
        // c) Tạm ngưng lớp
        ghiChu = '⏸️ Tạm ngưng lớp';
        isReduced = true;
      }

      if (isReduced) {
        changes.push({
          type: APP_CONFIG.CHANGE_TYPE.QUIT,
          mshs: mshs,
          fullName: pStudent ? pStudent.fullName : (cStudent ? cStudent.fullName : mshs),
          oldClass: pStudent ? pStudent.className : '',
          newClass: null,
          ghiChu: ghiChu
        });
      }
    }

    // ============================================================
    // 4. TĂNG MỚI DS GHI HĐ = HS tháng trước KHÔNG có trong DS Ghi HĐ
    //    mà tháng này CÓ trong DS Ghi HĐ (nhưng chưa CK TK Công ty)
    // ============================================================
    const currInvSet = new Set((currentInvoiceStudents || []).map(s => s.mshs));

    for (const mshs of currInvSet) {
      if (prevInvSet.has(mshs)) continue; // Đã có tháng trước
      if (vtbMatchedMSHS.has(mshs)) continue; // Đã xử lý ở phần TĂNG MỚI
      const student = currMap.get(mshs);
      if (student) {
        changes.push({
          type: 'tang_hoa_don',
          mshs: mshs,
          fullName: student.fullName,
          oldClass: null,
          newClass: student.className,
          ghiChu: '📋 Tăng mới DS Ghi HĐ (chưa CK TK CT)'
        });
      }
    }

    // Sort by type priority
    const priority = {
      [APP_CONFIG.CHANGE_TYPE.COMPANY_TRANSFER]: 1,
      [APP_CONFIG.CHANGE_TYPE.WRONG_AMOUNT]: 2,
      [APP_CONFIG.CHANGE_TYPE.CLASS_CHANGE]: 3,
      [APP_CONFIG.CHANGE_TYPE.QUIT]: 4,
      'tang_hoa_don': 5
    };

    changes.sort((a, b) => (priority[a.type] || 99) - (priority[b.type] || 99));
    return changes;
  },

  /**
   * Generates list of parents to remind about unpaid fees.
   */
  generateNhacPH(reportRows) {
    return reportRows
      .filter(r => r.trangThai === APP_CONFIG.STATUS.UNPAID || r.trangThai === APP_CONFIG.STATUS.PARTIAL)
      .map(r => ({
        mshs: r.mshs,
        fullName: r.fullName,
        phone: r.phone || '',
        soTienThieu: r.soTienThieu || 0,
        className: r.className || ''
      }));
  }
};
