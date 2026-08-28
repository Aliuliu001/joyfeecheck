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
  detectChanges(currentStudents, previousStudents, vtbMatchedMSHS) {
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
    
    for (const [mshs, cStudent] of currMap.entries()) {
      const pStudent = prevMap.get(mshs);
      if (!pStudent) {
        // MSHS in current but NOT in previous
        changes.push({
          type: APP_CONFIG.CHANGE_TYPE.NEW,
          mshs: mshs,
          fullName: cStudent.fullName,
          oldClass: null,
          newClass: cStudent.className,
          ghiChu: 'Học sinh mới'
        });
      } else {
        // MSHS in both, check if class changed
        if (cStudent.className !== pStudent.className) {
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
      
      // If transferred to company account
      if (vtbMatchedMSHS.has(mshs)) {
        changes.push({
          type: APP_CONFIG.CHANGE_TYPE.COMPANY_TRANSFER,
          mshs: mshs,
          fullName: cStudent.fullName,
          oldClass: null,
          newClass: cStudent.className,
          ghiChu: 'CK qua TK Công ty (VietinBank)'
        });
      }
    }
    
    // Check for students who quit
    for (const [mshs, pStudent] of prevMap.entries()) {
      if (!currMap.has(mshs)) {
        changes.push({
          type: APP_CONFIG.CHANGE_TYPE.QUIT,
          mshs: mshs,
          fullName: pStudent.fullName,
          oldClass: pStudent.className,
          newClass: null,
          ghiChu: 'Nghỉ học'
        });
      }
    }
    
    // Sort by type priority
    const priority = {
      [APP_CONFIG.CHANGE_TYPE.NEW]: 1,
      [APP_CONFIG.CHANGE_TYPE.QUIT]: 2,
      [APP_CONFIG.CHANGE_TYPE.CLASS_CHANGE]: 3,
      [APP_CONFIG.CHANGE_TYPE.COMPANY_TRANSFER]: 4
    };
    
    changes.sort((a, b) => priority[a.type] - priority[b.type]);
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
