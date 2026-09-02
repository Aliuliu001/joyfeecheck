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
   * Compare DS Ghi HĐ tháng trước vs tháng này → Tăng/Giảm.
   *
   * TĂNG MỚI: HS tháng trước KHÔNG có trong DS Ghi HĐ, tháng này CÓ.
   *   - Lý do có thể: CK vào TK Công ty (bắt buộc), hoặc thêm thủ công.
   *
   * GIẢM BỚT: HS tháng trước CÓ trong DS Ghi HĐ, tháng này KHÔNG còn.
   *   - Lý do: Nghỉ học, HP = 0, tạm ngưng, hoặc bỏ chọn thủ công.
   */
  detectChanges(prevInvoiceStudents, currentInvoiceStudents, currMap, vtbMatchedMSHS, suspendedSet, freeTuitionSet) {
    const changes = { tangMoi: [], giamBot: [] };

    const prevInvSet = new Set((prevInvoiceStudents || []).map(s => s.mshs));
    const currInvSet = new Set((currentInvoiceStudents || []).map(s => s.mshs));

    // === TĂNG MỚI ===
    for (const mshs of currInvSet) {
      if (prevInvSet.has(mshs)) continue; // Tháng trước đã có

      const student = currMap.get(mshs);
      const isVTB = vtbMatchedMSHS.has(mshs);
      let lyDo = '';

      if (isVTB) {
        lyDo = '💳 CK vào TK Công ty';
      } else if (student && (Number(student.hocPhi) || 0) === 0) {
        lyDo = '💰 HP = 0';
      } else {
        lyDo = 'Thêm vào DS Ghi HĐ';
      }

      changes.tangMoi.push({
        mshs,
        fullName: student ? student.fullName : mshs,
        className: student ? student.className : '',
        hocPhi: student ? (Number(student.hocPhi) || 0) : 0,
        lyDo
      });
    }

    // === GIẢM BỚT ===
    for (const mshs of prevInvSet) {
      if (currInvSet.has(mshs)) continue; // Tháng này vẫn còn

      const student = currMap.get(mshs) || null;
      let lyDo = '';

      if (!student) {
        // Không còn trong DS Thực tế → nghỉ học
        lyDo = '🚫 Nghỉ học';
      } else if (freeTuitionSet.has(mshs)) {
        // HP = 0 → miễn giảm
        lyDo = '💰 HP = 0';
      } else if (suspendedSet.has(mshs)) {
        // Tạm ngưng
        lyDo = '⏸️ Tạm ngưng';
      } else {
        // Bỏ chọn thủ công
        lyDo = 'Bỏ chọn khỏi DS Ghi HĐ';
      }

      changes.giamBot.push({
        mshs,
        fullName: student ? student.fullName : mshs,
        className: student ? student.className : '',
        hocPhi: student ? (Number(student.hocPhi) || 0) : 0,
        lyDo
      });
    }

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
