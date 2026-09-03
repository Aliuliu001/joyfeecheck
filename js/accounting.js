/**
 * JOY FEE CHECK - Accounting Module (v2 — UNION-based invoice classification)
 * Single shared function classifyInvoiceStudents() drives both Tab 2 and Tab 3.
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
   * UNION-based invoice classification.
   * Source = UNION(DS_Tong_ThangNay, DS_HD_ThangTruoc)
   * Each MSHS is classified into exactly one group (priority A > B > C > skip).
   *
   * Group A: in prevInvoice AND in currentMaster → present Tab 2, no tag (or "Giữ nguyên")
   * Group B: NOT in prevInvoice AND has VTB CK this month → present Tab 2, tag "📈 Tăng mới"
   * Group C: in prevInvoice AND NOT in DS_HD_ThangNay (A∪B) → Tab 3 "📉 Giảm bớt"
   * Skip: everything else → no Tab 2, no Tab 3
   *
   * @param {Array} studentsMaster - DS_Tong_ThangNay (students from import #1)
   * @param {Array} prevInvoiceStudents - DS_HD_ThangTruoc (from prev invoice file)
   * @param {Set} vtbMatchedMSHS - MSHS that CK to VTB company account this month
   * @param {Map} currMap - MSHS → student object
   * @param {Set} freeTuitionSet - MSHS with HP=0
   * @param {Object} vtbAmountByMSHS - MSHS → total VTB amount
   * @returns {Object} { tab2Rows, tab3Changes, classificationMap, tongKyVong, tongCKSai }
   */
  classifyInvoiceStudents(studentsMaster, prevInvoiceStudents, vtbMatchedMSHS, currMap, freeTuitionSet, vtbAmountByMSHS) {
    const dsTongSet = new Set((studentsMaster || []).map(s => s.mshs));

    // prevInvoiceStudents can be: array of strings (MSHS) OR array of objects ({mshs, fullName, ...})
    const prevHDSet = new Set((prevInvoiceStudents || []).map(s => typeof s === 'string' ? s : s.mshs));
    // Also build a map for looking up prev student data
    const prevHDMap = new Map();
    for (const s of (prevInvoiceStudents || [])) {
      const mshs = typeof s === 'string' ? s : s.mshs;
      if (mshs) prevHDMap.set(mshs, typeof s === 'string' ? { mshs, fullName: mshs, hocPhi: 0 } : s);
    }

    // UNION of all MSHS we need to consider
    const allMSHS = new Set();
    for (const s of (studentsMaster || [])) allMSHS.add(s.mshs);
    for (const s of (prevInvoiceStudents || [])) allMSHS.add(s.mshs);

    const tab2Rows = [];       // Groups A + B
    const groupA = new Set();  // MSHS in Group A
    const groupB = new Set();  // MSHS in Group B
    const classificationMap = new Map(); // mshs → 'A' | 'B' | 'C' | 'skip'

    for (const mshs of allMSHS) {
      const inPrev = prevHDSet.has(mshs);
      const inMaster = dsTongSet.has(mshs);
      const hasVTB = vtbMatchedMSHS.has(mshs);
      const student = currMap.get(mshs);
      const hp = student ? (Number(student.hocPhi) || 0) : 0;

      if (inPrev && inMaster && hp > 0) {
        // GROUP A: in prev invoice + still in master + HP > 0 (actively studying)
        classificationMap.set(mshs, 'A');
        groupA.add(mshs);
        tab2Rows.push({
          mshs,
          fullName: student ? student.fullName : mshs,
          className: student ? student.className : '',
          teacher: student ? student.teacher : '',
          hocPhi: hp,
          group: 'A',
          tag: '',
          source: hasVTB ? '💳 CK VTB' : (student ? (student.ghiChu || '') : ''),
          ghiChu: ''
        });
      } else if (!inPrev && hasVTB) {
        // GROUP B
        classificationMap.set(mshs, 'B');
        groupB.add(mshs);
        tab2Rows.push({
          mshs,
          fullName: student ? student.fullName : mshs,
          className: student ? student.className : '',
          teacher: student ? student.teacher : '',
          hocPhi: hp,
          group: 'B',
          tag: '📈 Tăng mới',
          source: '💳 CK VTB tháng này',
          ghiChu: 'Mới CK vào TK Công ty'
        });
      } else if (inPrev && !groupA.has(mshs) && !groupB.has(mshs)) {
        // GROUP C: in prev but NOT in A∪B → giảm bớt
        classificationMap.set(mshs, 'C');
      } else {
        classificationMap.set(mshs, 'skip');
      }
    }

    // Sort Tab 2: A first (by className), then B (by className)
    tab2Rows.sort((a, b) => {
      if (a.group !== b.group) return a.group === 'A' ? -1 : 1;
      const c = (a.className || '').localeCompare(b.className || '');
      return c !== 0 ? c : a.mshs.localeCompare(b.mshs);
    });

    // Build Tab 3: Changes
    const tab3Changes = this._buildTab3Changes(prevHDMap, tab2Rows, classificationMap, currMap, dsTongSet, freeTuitionSet, vtbMatchedMSHS, vtbAmountByMSHS);

    // Cross-check totals
    let tongKyVong = 0;
    for (const r of tab2Rows) {
      tongKyVong += (Number(r.hocPhi) || 0);
    }

    return { tab2Rows, tab3Changes, classificationMap, tongKyVong };
  },

  _buildTab3Changes(prevHDMap, tab2Rows, classificationMap, currMap, dsTongSet, freeTuitionSet, vtbMatchedMSHS, vtbAmountByMSHS) {
    const changes = { tangMoi: [], giamBot: [], saiTienCK: [] };
    const tab2MSHS = new Set(tab2Rows.map(r => r.mshs));

    // 📈 Tăng mới: in DS_HD_ThangNay (tab2) but NOT in DS_HD_ThangTruoc
    for (const r of tab2Rows) {
      if (r.group === 'B') {
        changes.tangMoi.push({
          mshs: r.mshs, fullName: r.fullName, className: r.className,
          hocPhi: r.hocPhi, lyDo: '💳 CK VTB tháng này'
        });
      }
    }

    // 📉 Giảm bớt: Group C — in prev but NOT in current DS_HD
    for (const [mshs, group] of classificationMap.entries()) {
      if (group !== 'C') continue;
      const student = currMap.get(mshs) || prevHDMap.get(mshs) || null;
      const inMaster = dsTongSet.has(mshs);
      const hp = student ? (Number(student.hocPhi) || 0) : 0;

      let lyDo;
      if (!inMaster && hp === 0) {
        lyDo = '🚫 Không còn trong DS Tổng + HP=0';
      } else if (!inMaster) {
        lyDo = '🚫 Không còn trong DS Tổng';
      } else if (hp === 0) {
        lyDo = '💰 HP = 0';
      } else {
        lyDo = '⚠️ Bất thường — cần rà tay';
        console.warn(`[Accounting] Group C anomaly: ${mshs} still in DS Tổng AND HP=${hp}. Manual review needed.`);
      }

      changes.giamBot.push({
        mshs, fullName: student ? student.fullName : mshs,
        className: student ? student.className : '',
        hocPhi: hp, lyDo
      });
    }

    // ⚠️ CK sai tiền: all students in Tab 2 who have VTB CK ≠ their HP
    for (const r of tab2Rows) {
      if (!vtbMatchedMSHS.has(r.mshs)) continue;
      const ckNop = (vtbAmountByMSHS && vtbAmountByMSHS[r.mshs]) || 0;
      const hp = Number(r.hocPhi) || 0;
      if (hp > 0 && ckNop !== hp) {
        const chenh = ckNop - hp;
        changes.saiTienCK.push({
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
