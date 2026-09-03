/**
 * JOY FEE CHECK - Accounting Module
 * Handles preparation of accounting reports, practical student lists, invoice selection, and changes detection.
 */

window.Accounting = {
  /**
   * Generate practical student list (DS Thực tế)
   */
  generateThucTe(students) {
    const validStudents = students.filter(s => {
      const note = (s.ghiChuGiaDinh || '').toLowerCase().trim();
      if (note.includes('nghỉ học')) return false;
      return true;
    });

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
      const isVTB = vtbMatchedMSHS.has(s.mshs);
      const wasInPrevMonth = prevMonthHDList.includes(s.mshs);

      // Logic DS Ghi HĐ tháng này:
      // DS Ghi HĐ tháng trước (base) + thay đổi dựa trên CK VTB tháng này
      //
      // 1. Thang TRUOC co trong DS Ghi HD + thang NAY co CK VTB → ✅ Giu nguyen
      // 2. Thang TRUOC co trong DS Ghi HD + thang NAY KHONG CK VTB → ❌ Loai bo
      // 3. Thang TRUOC KHONG co + thang NAY co CK VTB → ✅ Them moi
      // 4. Thang TRUOC KHONG co + thang NAY KHONG CK VTB → ❌ Khong co

      let isSelected = false;
      if (wasInPrevMonth && isVTB) {
        // 1. Giữ nguyên
        isSelected = true;
      } else if (wasInPrevMonth && !isVTB) {
        // 2. Loại bỏ (không CK tháng này)
        isSelected = false;
      } else if (!wasInPrevMonth && isVTB) {
        // 3. Thêm mới (CK mới tháng này)
        isSelected = true;
      }
      // 4. Không có gì → không chọn

      if (isSelected) {
        selectedMSHS.add(s.mshs);
      }

      rows.push({
        ...s,
        mandatory: isVTB && !wasInPrevMonth, // Moi chi CK thang nay
        wasInPrevMonth: wasInPrevMonth
      });
    }

    return { rows, selectedMSHS };
  },

  /**
   * TAB 1: So sánh DS Ghi HĐ tháng trước vs tháng này.
   *
   * Returns: { tangMoi, giamBot, saiTienCK }
   */
  detectChanges(prevInvoiceStudents, currentInvoiceStudents, currMap, vtbMatchedMSHS, suspendedSet, freeTuitionSet, vtbAmountByMSHS) {
    const changes = { tangMoi: [], giamBot: [], saiTienCK: [] };

    const prevInvSet = new Set((prevInvoiceStudents || []).map(s => s.mshs));
    const currInvSet = new Set((currentInvoiceStudents || []).map(s => s.mshs));

    // === TĂNG MỚI ===
    for (const mshs of currInvSet) {
      if (prevInvSet.has(mshs)) continue;

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
      if (currInvSet.has(mshs)) continue;

      const student = currMap.get(mshs) || null;
      let lyDo = '';

      if (!student) {
        lyDo = '🚫 Nghỉ học';
      } else if (freeTuitionSet.has(mshs)) {
        lyDo = '💰 HP = 0';
      } else if (suspendedSet.has(mshs)) {
        lyDo = '⏸️ Tạm ngưng';
      } else {
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

    // === CK SAI TIỀN (HS có trong DS Ghi HĐ + CK VTB nhưng sai số tiền) ===
    for (const mshs of currInvSet) {
      if (!vtbMatchedMSHS.has(mshs)) continue;
      const student = currMap.get(mshs);
      if (!student) continue;

      const hp = Number(student.hocPhi) || 0;
      const ckNop = (vtbAmountByMSHS && vtbAmountByMSHS[mshs]) || 0;
      if (hp > 0 && ckNop !== hp) {
        const chenh = ckNop - hp;
        changes.saiTienCK.push({
          mshs,
          fullName: student.fullName,
          className: student.className,
          hocPhi: hp,
          ckNop,
          chenhLech: chenh,
          lyDo: chenh < 0
            ? `Thiếu ${Utils.formatCurrency(-chenh)}`
            : `Dư ${Utils.formatCurrency(chenh)}`
        });
      }
    }

    return changes;
  },

  /**
   * TAB 2: So sánh DS Thực tế tháng trước vs tháng này.
   *
   * Returns: { moi, nghiHoc, doiLop, tamNgung, hpThayDoi }
   */
  detectThucTeChanges(prevStudents, currStudents, suspendedSet) {
    const prevMap = new Map();
    for (const s of prevStudents) {
      if (!prevMap.has(s.mshs)) prevMap.set(s.mshs, s);
    }
    const currMap = new Map();
    for (const s of currStudents) {
      if (!currMap.has(s.mshs)) currMap.set(s.mshs, s);
    }

    const result = { moi: [], nghiHoc: [], doiLop: [], tamNgung: [], hpThayDoi: [] };

    // === HS MỚI ===
    for (const [mshs, s] of currMap.entries()) {
      if (prevMap.has(mshs)) continue;
      result.moi.push({
        mshs,
        fullName: s.fullName,
        className: s.className,
        hocPhi: Number(s.hocPhi) || 0,
        ghiChu: 'Thêm vào DS Thực tế'
      });
    }

    // === NGHỈ HỌC ===
    for (const [mshs, s] of prevMap.entries()) {
      if (currMap.has(mshs)) continue;
      result.nghiHoc.push({
        mshs,
        fullName: s.fullName,
        className: s.className,
        hocPhi: Number(s.hocPhi) || 0,
        ghiChu: 'Xóa khỏi DS Thực tế'
      });
    }

    // === ĐỔI LỚP / HP THAY ĐỔI / TẠM NGƯNG ===
    for (const [mshs, c] of currMap.entries()) {
      const p = prevMap.get(mshs);
      if (!p) continue;

      const cHP = Number(c.hocPhi) || 0;
      const pHPOld = Number(p.hocPhi) || 0;

      // Đổi lớp
      if (c.className !== p.className) {
        result.doiLop.push({
          mshs,
          fullName: c.fullName,
          classNameOld: p.className,
          classNameNew: c.className,
          hocPhi: cHP,
          ghiChu: 'Cập nhật lớp mới'
        });
      }

      // HP thay đổi (giữ nguyên lớp)
      if (cHP !== pHPOld && c.className === p.className) {
        result.hpThayDoi.push({
          mshs,
          fullName: c.fullName,
          className: c.className,
          hocPhiOld: pHPOld,
          hocPhiNew: cHP,
          ghiChu: pHPOld === 0
            ? 'HP mới (tháng TRC = 0)'
            : cHP === 0
              ? 'HP = 0 (miễn/tạm ngưng)'
              : `HP ${Utils.formatCurrency(pHPOld)} → ${Utils.formatCurrency(cHP)}`
        });
      }

      // Tạm ngưng (vẫn có trong DS nhưng HP = 0)
      if (suspendedSet.has(mshs) && cHP === 0 && p.className === c.className) {
        result.tamNgung.push({
          mshs,
          fullName: c.fullName,
          className: c.className,
          hocPhi: 0,
          ghiChu: 'Tạm ngưng lớp'
        });
      }
    }

    return result;
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
