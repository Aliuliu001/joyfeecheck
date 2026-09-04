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
   * @param {Array} prevInvoiceStudents - Tab 1 data
   * @param {Set} vtbMatchedMSHS - Unique MSHS that CK to VTB this month
   * @param {Map} currMap - MSHS → student object (DS Tổng master)
   * @param {Map} vtbAmountByMSHS - MSHS → total VTB CK amount this month
   * @param {Array} reportRows - Report rows (for txList)
   * @param {Array} familyGroups - Family groups (for Tab 6 NAIVE formula)
   * @param {number} hpDefault - Default HP per student (for Tab 6 NAIVE formula)
   * @returns {Object} { tab1, tab2, tab3, tab4, tab5, tab6 }
   */
  computeInvoiceComparison(prevInvoiceStudents, vtbMatchedMSHS, currMap, vtbAmountByMSHS, reportRows, familyGroups, hpDefault) {
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

    // ═══════════════════════════════════════════════════════════════
    // Tab 6: Chuyển tiền sai — NAIVE formula (RIÊNG BIỆT, không dùng Report)
    // KyVong = HP_default × số MSHS trong nhóm gia đình
    // Tong_CK = tổng VTB CK của cả nhóm gia đình trong tháng
    // Nếu Tong_CK ≠ KyVong → flag
    // ═══════════════════════════════════════════════════════════════
    const vtbAmt = vtbAmountByMSHS || new Map();
    const hpDef = hpDefault || APP_CONFIG.DEFAULT_HOC_PHI || 800000;
    const groups = familyGroups || [];

    // Step 1: Build family membership map (mshs → groupId)
    const mshsToGroup = new Map();
    for (const fg of groups) {
      for (const m of (fg.members || [])) {
        mshsToGroup.set(m.toUpperCase(), fg);
      }
    }

    // Step 2: Group VTB CK by family (or individual)
    // familyKey → { members: Set, totalCK: number, family: object|null }
    const familyCKMap = new Map();
    for (const mshs of tab2Set) {
      const ck = vtbAmt.get(mshs) || 0;
      const fg = mshsToGroup.get(mshs);
      const fKey = fg ? fg.groupId : 'solo_' + mshs;
      if (!familyCKMap.has(fKey)) {
        familyCKMap.set(fKey, { members: new Set(), totalCK: 0, family: fg, soloMSHS: mshs });
      }
      const entry = familyCKMap.get(fKey);
      entry.members.add(mshs);
      entry.totalCK += ck;
    }

    // Step 3: For each family/individual, compare naive expectation vs actual CK
    const tab6 = [];
    for (const [fKey, entry] of familyCKMap) {
      const memberCount = entry.members.size;
      const kyVong = hpDef * memberCount;
      const tongCK = entry.totalCK;
      if (tongCK !== kyVong) {
        const chenh = tongCK - kyVong;
        const isSolo = !entry.family;
        const members = [...entry.members];
        // Get display info from first member
        const firstMSHS = isSolo ? entry.soloMSHS : members[0];
        const firstStudent = (currMap || new Map()).get(firstMSHS) || {};
        // Build member names for display
        const memberNames = members.map(m => {
          const s = (currMap || new Map()).get(m);
          return s ? `${m} - ${s.fullName}` : m;
        }).join(', ');
        // Get txList for Nguon CK
        const reportRow = (reportRows || []).find(rr => rr.mshs === firstMSHS);
        const lyDo = chenh < 0
          ? `Thiếu ${Utils.formatCurrency(-chenh)}`
          : `Dư ${Utils.formatCurrency(chenh)} — có thể gộp tiền sách/gộp nhiều tháng`;
        tab6.push({
          mshs: isSolo ? firstMSHS : members.join(', '),
          fullName: isSolo ? (firstStudent.fullName || firstMSHS) : memberNames,
          className: isSolo ? (firstStudent.className || '') : members.map(m => {
            const s = (currMap || new Map()).get(m);
            return s ? s.className : '';
          }).filter(Boolean).join(', '),
          hocPhi: kyVong,
          ckAmount: tongCK,
          chenhLech: chenh,
          lyDo,
          txList: reportRow ? reportRow.txList : [],
          isFamily: !isSolo,
          memberCount
        });
      }
    }
    // Sort: families first, then by chenhLech desc
    tab6.sort((a, b) => {
      if (a.isFamily !== b.isFamily) return a.isFamily ? -1 : 1;
      return Math.abs(b.chenhLech) - Math.abs(a.chenhLech);
    });

    return { tab1, tab2, tab3, tab4, tab5, tab6, prevSet, tab2Set };
  },

  generateNhacPH(reportRows) {
    return reportRows
      .filter(r => r.trangThai === APP_CONFIG.STATUS.UNPAID || r.trangThai === APP_CONFIG.STATUS.PARTIAL)
      .map(r => ({ mshs: r.mshs, fullName: r.fullName, phone: r.phone || '', soTienThieu: r.soTienThieu || 0, className: r.className || '' }));
  }
};
