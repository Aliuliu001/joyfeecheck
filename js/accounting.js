/**
 * JOY FEE CHECK - Accounting Module (v3 — simple set operations)
 * 
 * 5 Tabs based on simple set differences:
 * Tab 1: DS HĐ Tháng trước (raw from prev invoice file)
 * Tab 2: DS CK VTB Tháng này (only students who CK to company VietinBank)
 * Tab 3: Tháng trước có, tháng này chưa CK (Tab1 - Tab2)
 * Tab 4: Giảm bớt (Tab3 students NOT in DS Tổng master)
 * Tab 5: Tăng mới (Tab2 - Tab1, new VTB transfers)
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

  /**
   * Simple set-based invoice comparison.
   * 
   * @param {Array} prevInvoiceStudents - Tab 1 data (MSHS strings or objects)
   * @param {Set} vtbMatchedMSHS - MSHS that CK to VTB company account this month (Tab 2 data)
   * @param {Map} currMap - MSHS → student object (from DS Tổng master)
   * @returns {Object} { tab1, tab2, tab3, tab4, tab5, tongCKSai }
   */
  computeInvoiceComparison(prevInvoiceStudents, vtbMatchedMSHS, currMap) {
    // Helper: normalize prevInvoiceStudents to array of MSHS strings
    const prevMSHS = (prevInvoiceStudents || []).map(s => typeof s === 'string' ? s : s.mshs).filter(Boolean);
    const prevSet = new Set(prevMSHS);
    const tab2Set = vtbMatchedMSHS || new Set();
    const masterSet = new Set((currMap || new Map()).keys());

    // Build prev student data map for display
    const prevDataMap = new Map();
    for (const s of (prevInvoiceStudents || [])) {
      const mshs = typeof s === 'string' ? s : s.mshs;
      if (mshs) prevDataMap.set(mshs, typeof s === 'string' ? { mshs, fullName: mshs, hocPhi: 0, className: '' } : s);
    }

    // Tab 1: DS HĐ Tháng trước (all prev invoice students)
    const tab1 = prevMSHS.map(mshs => {
      const prevData = prevDataMap.get(mshs) || {};
      const student = (currMap || new Map()).get(mshs);
      return {
        mshs,
        fullName: student ? student.fullName : (prevData.fullName || mshs),
        className: student ? student.className : (prevData.className || ''),
        hocPhi: student ? (Number(student.hocPhi) || 0) : (prevData.hocPhi || 0),
        teacher: student ? student.teacher : ''
      };
    });

    // Tab 2: DS CK VTB Tháng này (only VTB matched students)
    const tab2 = [];
    for (const mshs of tab2Set) {
      const student = (currMap || new Map()).get(mshs);
      tab2.push({
        mshs,
        fullName: student ? student.fullName : mshs,
        className: student ? student.className : '',
        hocPhi: student ? (Number(student.hocPhi) || 0) : 0,
        teacher: student ? student.teacher : ''
      });
    }
    tab2.sort((a, b) => a.mshs.localeCompare(b.mshs));

    // Tab 3: Tháng trước có, tháng này chưa CK = Tab1 - Tab2
    const tab3 = tab1.filter(r => !tab2Set.has(r.mshs));

    // Tab 4: Giảm bớt = Tab3 students NOT in DS Tổng master OR HP=0
    const tab4 = tab3.filter(r => {
      const student = (currMap || new Map()).get(r.mshs);
      if (!student) return true; // not in master at all
      if ((Number(student.hocPhi) || 0) === 0) return true; // HP=0
      return false;
    }).map(r => {
      const student = (currMap || new Map()).get(r.mshs);
      let lyDo;
      if (!student) {
        lyDo = '🚫 Không còn trong DS Tổng';
      } else if ((Number(student.hocPhi) || 0) === 0) {
        lyDo = '💰 HP = 0';
      } else {
        lyDo = '⚠️ Cần rà tay';
      }
      return { ...r, lyDo };
    });

    // Tab 5: Tăng mới = Tab2 - Tab1 (new VTB transfers not in prev invoice)
    const tab5 = tab2.filter(r => !prevSet.has(r.mshs));

    // CK sai tiền: students in Tab2 with CK amount ≠ HP
    const saiTienCK = [];
    // Note: vtbAmountByMSHS needs to be passed in — but for now compute from tab2 + currMap
    // We'll add this in the caller

    return { tab1, tab2, tab3, tab4, tab5, prevSet, tab2Set };
  },

  /**
   * Detect CK sai tiền (called separately with vtbAmountByMSHS)
   */
  detectSaiTienCK(tab2Rows, vtbAmountByMSHS, currMap) {
    const changes = [];
    for (const r of tab2Rows) {
      const ckNop = (vtbAmountByMSHS && vtbAmountByMSHS[r.mshs]) || 0;
      const hp = Number(r.hocPhi) || 0;
      if (hp > 0 && ckNop > 0 && ckNop !== hp) {
        const chenh = ckNop - hp;
        changes.push({
          mshs: r.mshs, fullName: r.fullName, className: r.className,
          hocPhi: hp, ckNop, chenhLech: chenh,
          lyDo: chenh < 0 ? `Thiếu ${Utils.formatCurrency(-chenh)}` : `Dư ${Utils.formatCurrency(chenh)}`
        });
      }
    }
    return changes;
  },

  generateNhacPH(reportRows) {
    return reportRows
      .filter(r => r.trangThai === APP_CONFIG.STATUS.UNPAID || r.trangThai === APP_CONFIG.STATUS.PARTIAL)
      .map(r => ({ mshs: r.mshs, fullName: r.fullName, phone: r.phone || '', soTienThieu: r.soTienThieu || 0, className: r.className || '' }));
  }
};
