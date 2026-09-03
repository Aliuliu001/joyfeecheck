/**
 * JOY FEE CHECK - Accounting Module
 */
window.Accounting = {
  generateThucTe(students) {
    const validStudents = students.filter(s => {
      const note = (s.ghiChuGiaDinh || '').toLowerCase().trim();
      return !note.includes('nghỉ học');
    });
    validStudents.sort((a, b) => {
      const c = (a.className || '').localeCompare(b.className || '');
      return c !== 0 ? c : (a.stt || 0) - (b.stt || 0);
    });
    let counter = 1;
    return validStudents.map(s => ({
      stt: counter++, mshs: s.mshs, className: s.className || '', fullName: s.fullName || '',
      teacher: s.teacher || '', hocPhi: s.hocPhi || 0, diaChi: s.diaChi || '', ghiChu: s.ghiChuGiaDinh || ''
    }));
  },

  generateGhiHD(studentsThucTe, prevMonthHDList, vtbMatchedMSHS) {
    const selectedMSHS = new Set();
    const rows = [];
    for (const s of studentsThucTe) {
      const isVTB = vtbMatchedMSHS.has(s.mshs);
      const wasInPrevMonth = prevMonthHDList.includes(s.mshs);

      // Logic DS Ghi HĐ tháng này:
      // 1. Co CK VTB thang nay → ✅ Phai co HĐ (bat buoc)
      // 2. Thang TRUOC co trong DS Ghi HĐ → ✅ Giu nguyen (Ke toan da them)
      // 3. Khong co ca hai → ❌ Khong co trong DS
      const isSelected = isVTB || wasInPrevMonth;

      if (isSelected) selectedMSHS.add(s.mshs);

      // Tag:
      // - isVTB + !wasInPrevMonth → Moi CK VTB thang nay (Tang moi)
      // - isVTB + wasInPrevMonth → Giu nguyen (khong tag)
      // - !isVTB + wasInPrevMonth → Ke toan them thu cong (Bo sung)
      const isBoSung = !isVTB && wasInPrevMonth;
      const isTangMoi = isVTB && !wasInPrevMonth;

      rows.push({
        ...s,
        mandatory: isTangMoi,
        boSung: isBoSung,
        wasInPrevMonth
      });
    }
    return { rows, selectedMSHS };
  },

  detectChanges(prevInvoiceStudents, currentInvoiceStudents, currMap, vtbMatchedMSHS, suspendedSet, freeTuitionSet, vtbAmountByMSHS) {
    const changes = { tangMoi: [], giamBot: [], saiTienCK: [] };
    const prevInvSet = new Set((prevInvoiceStudents || []).map(s => s.mshs));
    const currInvSet = new Set((currentInvoiceStudents || []).map(s => s.mshs));

    for (const mshs of currInvSet) {
      if (prevInvSet.has(mshs)) continue;
      const student = currMap.get(mshs);
      const isVTB = vtbMatchedMSHS.has(mshs);
      changes.tangMoi.push({
        mshs, fullName: student ? student.fullName : mshs, className: student ? student.className : '',
        hocPhi: student ? (Number(student.hocPhi) || 0) : 0,
        lyDo: isVTB ? '💳 CK vào TK Công ty' : 'Thêm vào DS Ghi HĐ'
      });
    }

    for (const mshs of prevInvSet) {
      if (currInvSet.has(mshs)) continue;
      const student = currMap.get(mshs) || null;
      let lyDo = 'Bỏ chọn khỏi DS';
      if (!student) lyDo = '🚫 Nghỉ học';
      else if (freeTuitionSet.has(mshs)) lyDo = '💰 HP = 0';
      else if (suspendedSet.has(mshs)) lyDo = '⏸️ Tạm ngưng';
      changes.giamBot.push({
        mshs, fullName: student ? student.fullName : mshs, className: student ? student.className : '',
        hocPhi: student ? (Number(student.hocPhi) || 0) : 0, lyDo
      });
    }

    for (const mshs of currInvSet) {
      if (!vtbMatchedMSHS.has(mshs)) continue;
      const student = currMap.get(mshs);
      if (!student) continue;
      const hp = Number(student.hocPhi) || 0;
      const ckNop = (vtbAmountByMSHS && vtbAmountByMSHS[mshs]) || 0;
      if (hp > 0 && ckNop !== hp) {
        const chenh = ckNop - hp;
        changes.saiTienCK.push({
          mshs, fullName: student.fullName, className: student.className, hocPhi: hp, ckNop, chenhLech: chenh,
          lyDo: chenh < 0 ? `Thiếu ${Utils.formatCurrency(-chenh)}` : `Dư ${Utils.formatCurrency(chenh)}`
        });
      }
    }
    return changes;
  },

  detectThucTeChanges(prevStudents, currStudents) {
    const prevMap = new Map();
    for (const s of prevStudents) { if (!prevMap.has(s.mshs)) prevMap.set(s.mshs, s); }
    const currMap = new Map();
    for (const s of currStudents) { if (!currMap.has(s.mshs)) currMap.set(s.mshs, s); }
    const result = { moi: [], nghiHoc: [], doiLop: [], hpThayDoi: [] };

    for (const [mshs, s] of currMap.entries()) {
      if (!prevMap.has(s.mshs)) result.moi.push({ mshs, fullName: s.fullName, className: s.className, hocPhi: Number(s.hocPhi) || 0, ghiChu: 'Cần thêm vào Kế toán' });
    }
    for (const [mshs, s] of prevMap.entries()) {
      if (!currMap.has(s.mshs)) result.nghiHoc.push({ mshs, fullName: s.fullName, className: s.className, hocPhi: Number(s.hocPhi) || 0, ghiChu: 'Không còn trong DS HS tổng' });
    }
    for (const [mshs, c] of currMap.entries()) {
      const p = prevMap.get(mshs);
      if (!p) continue;
      const cHP = Number(c.hocPhi) || 0;
      const pHP = Number(p.hocPhi) || 0;
      if (c.className !== p.className) result.doiLop.push({ mshs, fullName: c.fullName, classNameOld: p.className, classNameNew: c.className, hocPhi: cHP, ghiChu: 'Cập nhật lớp' });
      else if (cHP !== pHP) result.hpThayDoi.push({ mshs, fullName: c.fullName, className: c.className, hocPhiOld: pHP, hocPhiNew: cHP, ghiChu: pHP === 0 ? 'HP mới (tháng TRC = 0)' : cHP === 0 ? 'HP = 0' : `HP ${Utils.formatCurrency(pHP)} → ${Utils.formatCurrency(cHP)}` });
    }
    return result;
  },

  generateNhacPH(reportRows) {
    return reportRows
      .filter(r => r.trangThai === APP_CONFIG.STATUS.UNPAID || r.trangThai === APP_CONFIG.STATUS.PARTIAL)
      .map(r => ({ mshs: r.mshs, fullName: r.fullName, phone: r.phone || '', soTienThieu: r.soTienThieu || 0, className: r.className || '' }));
  }
};
