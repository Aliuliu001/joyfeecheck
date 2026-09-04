/**
 * JOY FEE CHECK - Accounting Module (v5 — 6-tab set operations)
 * 
 * Tab 1: DS HĐ Tháng trước (raw from prev invoice file import)
 * Tab 2: DS CK VTB Tháng này (students who CK to company VietinBank)
 * Tab 3: Giảm bớt = (Tab1 - Tab2) ∩ IN master ∩ HP>0 (còn cơ hội đóng tiền)
 * Tab 4: Stop học nghỉ = (Tab1 - Tab2) ∩ (NOT in master OR HP=0) (hết cơ hội)
 * Tab 5: Tăng mới = Tab2 - Tab1 (new VTB transfers)
 * Tab 6: Chuyển tiền sai = Tab2 ∩ (VTB amount ≠ HP)
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
   * Compute 6-tab accounting comparison.
   *
   * @param {Array} prevInvoiceStudents - Tab 1 data (MSHS strings or objects)
   * @param {Set} vtbMatchedMSHS - Unique MSHS that CK to VTB company account this month
   * @param {Map} currMap - MSHS → student object (from DS Tổng master)
   * @param {Map} vtbAmountByMSHS - MSHS → total VTB CK amount this month
   * @returns {Object} { tab1, tab2, tab3, tab4, tab5, tab6 }
   */
  computeInvoiceComparison(prevInvoiceStudents, vtbMatchedMSHS, currMap, vtbAmountByMSHS, reportRows) {
    const prevMSHS = (prevInvoiceStudents || []).map(s => typeof s === 'string' ? s : s.mshs).filter(Boolean);
    const prevSet = new Set(prevMSHS);
    const tab2Set = vtbMatchedMSHS || new Set();

    // Build prev student data map for display
    const prevDataMap = new Map();
    for (const s of (prevInvoiceStudents || [])) {
      const mshs = typeof s === 'string' ? s : s.mshs;
      if (mshs) prevDataMap.set(mshs, typeof s === 'string' ? { mshs, fullName: mshs, hocPhi: 0, className: '' } : s);
    }

    // Tab 1: DS HĐ Tháng trước
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

    // Tab 2: DS CK VTB Tháng này
    const tab2 = [];
    for (const mshs of tab2Set) {
      const student = (currMap || new Map()).get(mshs);
      const ckAmount = (vtbAmountByMSHS || new Map()).get(mshs) || 0;
      tab2.push({
        mshs,
        fullName: student ? student.fullName : mshs,
        className: student ? student.className : '',
        hocPhi: student ? (Number(student.hocPhi) || 0) : 0,
        teacher: student ? student.teacher : '',
        ckAmount
      });
    }
    tab2.sort((a, b) => a.mshs.localeCompare(b.mshs));

    // Tab1 - Tab2
    const tab1MinusTab2 = tab1.filter(r => !tab2Set.has(r.mshs));

    // Tab 3: Giảm bớt = (Tab1 - Tab2) ∩ IN master ∩ HP>0
    const tab3 = tab1MinusTab2.filter(r => {
      const student = (currMap || new Map()).get(r.mshs);
      if (!student) return false;
      if ((Number(student.hocPhi) || 0) === 0) return false;
      return true;
    });

    // Tab 4: Stop học nghỉ = (Tab1 - Tab2) ∩ (NOT in master OR HP=0)
    const tab4 = tab1MinusTab2.filter(r => {
      const student = (currMap || new Map()).get(r.mshs);
      if (!student) return true;
      if ((Number(student.hocPhi) || 0) === 0) return true;
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

    // Tab 5: Tăng mới = Tab2 - Tab1
    const tab5 = tab2.filter(r => !prevSet.has(r.mshs));

    // Tab 6: Chuyển tiền sai — compare allocated payment vs HP (after family split)
    // Build allocated amounts map from report rows
    const allocatedByMSHS = new Map();
    (reportRows || []).forEach(r => {
      allocatedByMSHS.set(r.mshs, {
        allocated: r.tongDaDong || 0,
        hocPhi: r.tongHocPhi || 0
      });
    });
    const vtbAmt = vtbAmountByMSHS || new Map();
    const tab6 = tab2.filter(r => {
      const alloc = allocatedByMSHS.get(r.mshs);
      if (alloc) {
        // Use allocated amount (after family split)
        return alloc.hocPhi > 0 && alloc.allocated > 0 && alloc.allocated !== alloc.hocPhi;
      }
      // Fallback: no report row, use raw VTB amount
      const ck = vtbAmt.get(r.mshs) || 0;
      const hp = Number(r.hocPhi) || 0;
      return hp > 0 && ck > 0 && ck !== hp;
    }).map(r => {
      const alloc = allocatedByMSHS.get(r.mshs);
      let ck, hp;
      if (alloc) {
        ck = alloc.allocated;
        hp = alloc.hocPhi;
      } else {
        ck = vtbAmt.get(r.mshs) || 0;
        hp = Number(r.hocPhi) || 0;
      }
      const chenh = ck - hp;
      return {
        ...r,
        ckAmount: ck,
        hocPhi: hp,
        chenhLech: chenh,
        lyDo: chenh < 0 ? `Thiếu ${Utils.formatCurrency(-chenh)}` : `Dư ${Utils.formatCurrency(chenh)}`
      };
    });

    return { tab1, tab2, tab3, tab4, tab5, tab6, prevSet, tab2Set };
  },

  generateNhacPH(reportRows) {
    return reportRows
      .filter(r => r.trangThai === APP_CONFIG.STATUS.UNPAID || r.trangThai === APP_CONFIG.STATUS.PARTIAL)
      .map(r => ({ mshs: r.mshs, fullName: r.fullName, phone: r.phone || '', soTienThieu: r.soTienThieu || 0, className: r.className || '' }));
  }
};
