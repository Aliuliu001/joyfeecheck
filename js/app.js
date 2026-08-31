/**
 * App.js - Controller chính Joy Fee Check
 * Kết nối tất cả modules: Importer, Matcher, Reporter, Accounting, Exporter, Storage
 */

window.App = {
  // ========================
  // STATE
  // ========================
  state: {
    students: [],
    vtbTransactions: [],
    tpbTransactions: [],
    cashPayments: [],
    vtbMatched: [],
    vtbUnmatched: [],
    tpbMatched: [],
    tpbUnmatched: [],
    reportRows: [],
    thucTeRows: [],
    ghiHDRows: [],
    selectedHDMSHS: new Set(),
    changeRecords: [],
    prevInvoiceStudents: [],
    currentInvoiceStudents: [],
    importStatus: {
      dsHocSinh: false,
      vietinBank: false,
      tpBank: false,
      tienMat: false,
      prevInvoice: false
    },
    matchingDone: false
  },

  // ========================
  // INIT
  // ========================
  init: function() {
    console.log('Joy Fee Check v1.0 - Initializing...');
    this.setupDate();
    this.setupTabs();
    this.setupSubTabs();
    this.setupDropZones();
    this.setupButtons();
    this.setupFilters();
    this.loadSettingsUI();
    this.autoLoadMappings();
    this.checkExpiringPackages();
    // Load prev invoice students from storage
    this.state.prevInvoiceStudents = Storage._get('joy_prev_invoice_students', []);
    console.log('Joy Fee Check initialized successfully.');
  },

  autoLoadMappings: async function() {
    try {
      const response = await fetch('shared_data/joy_mappings.json');
      if (response.ok) {
        const data = await response.json();
        let addedSTK = 0;
        let addedKw = 0;
        if (data.joy_stk_phu) addedSTK = Storage.mergeSTKPhu(data.joy_stk_phu);
        if (data.joy_keywords) addedKw = Storage.mergeKeywords(data.joy_keywords);
        
        if (addedSTK > 0 || addedKw > 0) {
          Utils.showToast(`Đã tự động tải mapping: thêm mới ${addedSTK} STK, ${addedKw} từ khóa`, 'success');
          this.loadSettingsUI();
        }
      }
    } catch (e) {
      console.log('Không tìm thấy file shared_data/joy_mappings.json hoặc có lỗi đọc file');
    }
  },

  // Kiểm tra gói đóng sắp hết hạn
  checkExpiringPackages: function() {
    const packages = Storage.loadPackages() || [];
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    packages.forEach(pkg => {
      if (!pkg.endMonth) return;
      const [endYear, endMon] = pkg.endMonth.split('-').map(Number);
      const endDate = new Date(endYear, endMon);
      const monthsLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24 * 30));
      
      if (monthsLeft <= 1 && monthsLeft >= 0) {
        // Gói sắp hết hạn - hiển thị cảnh báo
        const memberNames = pkg.members.join(', ');
        Utils.showToast(`⚠ Gói "${pkg.packageName}" sắp hết hạn (${pkg.endMonth})! Thành viên: ${memberNames}. Phụ huynh cần đóng thêm.`, 'warning');
      }
    });
  },

  setupDate: function() {
    const now = new Date();
    document.getElementById('current-date').textContent =
      now.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    // Set default month
    const monthInput = document.getElementById('month-selector');
    if (monthInput) {
      monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  },

  // ========================
  // TAB NAVIGATION
  // ========================
  setupTabs: function() {
    const tabBtns = document.querySelectorAll('#tab-bar .tab-btn');
    const indicator = document.querySelector('.tab-indicator');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active from all
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        // Activate clicked
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        // Move indicator
        if (indicator) {
          indicator.style.left = btn.offsetLeft + 'px';
          indicator.style.width = btn.offsetWidth + 'px';
        }
        // Render undo button when exception tab is shown
        if (tabId === 'exception-tab') {
          this.renderUndoButton();
        }
      });
    });

    // Set initial indicator
    const activeBtn = document.querySelector('#tab-bar .tab-btn.active');
    if (activeBtn && indicator) {
      indicator.style.left = activeBtn.offsetLeft + 'px';
      indicator.style.width = activeBtn.offsetWidth + 'px';
    }
  },

  setupSubTabs: function() {
    const subTabBtns = document.querySelectorAll('.sub-tab-btn');
    subTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.closest('.tab-content');
        parent.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        parent.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const subTabId = btn.getAttribute('data-subtab');
        document.getElementById(subTabId).classList.add('active');
      });
    });
  },

  // ========================
  // DROP ZONES
  // ========================
  setupDropZones: function() {
    const zones = [
      { id: 'drop-ds-hs', type: 'dsHocSinh', parser: 'parseGoogleSheets' },
      { id: 'drop-vietinbank', type: 'vietinBank', parser: 'parseSaoKeVietinBank' },
      { id: 'drop-tpbank', type: 'tpBank', parser: 'parseSaoKeTPBank' },
      { id: 'drop-cash', type: 'tienMat', parser: 'parseTienMat' },
      { id: 'drop-prev-invoice', type: 'prevInvoice', parser: 'parsePrevInvoice' }
    ];

    zones.forEach(zone => {
      const el = document.getElementById(zone.id);
      if (!el) return;
      const fileInput = el.querySelector('input[type="file"]');

      // Click to browse
      el.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') fileInput.click();
      });

      // Drag events
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) this.handleFileImport(file, zone.type, zone.parser, el);
      });

      // File input change
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleFileImport(file, zone.type, zone.parser, el);
      });
    });
  },

  handleFileImport: async function(file, type, parserName, dropZoneEl) {
    const statusEl = dropZoneEl.querySelector('.status-text');
    statusEl.textContent = 'Đang đọc...';
    statusEl.className = 'status-text info';

    try {
      let result;
      if (type === 'dsHocSinh') {
        const parsed = await Importer.parseGoogleSheets(file);
        this.state.students = parsed.students || parsed;
        result = Array.isArray(parsed.students) ? parsed.students : parsed;
      } else if (type === 'vietinBank') {
        this.state.vtbTransactions = await Importer.parseSaoKeVietinBank(file);
        result = this.state.vtbTransactions;
      } else if (type === 'tpBank') {
        this.state.tpbTransactions = await Importer.parseSaoKeTPBank(file);
        result = this.state.tpbTransactions;
      } else if (type === 'tienMat') {
        this.state.cashPayments = await Importer.parseTienMat(file);
        result = this.state.cashPayments;
      } else if (type === 'prevInvoice') {
        this.state.prevInvoiceStudents = await Importer.parsePrevInvoice(file);
        result = this.state.prevInvoiceStudents;
        // Save to storage for comparison
        if (result && result.length > 0) {
          Storage._set('joy_prev_invoice_students', result);
        }
      }

      const count = result ? result.length : 0;
      statusEl.textContent = `✅ Đã import ${count} dòng`;
      statusEl.className = 'status-text success';
      dropZoneEl.classList.add('imported');
      this.state.importStatus[type] = true;
      Utils.showToast(`Import ${file.name} thành công: ${count} dòng`, 'success');
      this.checkStartButton();
    } catch (err) {
      statusEl.textContent = '❌ Lỗi import';
      statusEl.className = 'status-text error';
      Utils.showToast(`Lỗi import file: ${err.message}`, 'error');
      console.error('Import error:', err);
    }
  },

  checkStartButton: function() {
    const btn = document.getElementById('btn-start-matching');
    const hasDS = this.state.importStatus.dsHocSinh;
    const hasSource = this.state.importStatus.vietinBank || 
                      this.state.importStatus.tpBank || 
                      this.state.importStatus.tienMat;
    btn.disabled = !(hasDS && hasSource);
  },

  // ========================
  // BUTTONS
  // ========================
  setupButtons: function() {
    // Start matching
    document.getElementById('btn-start-matching')?.addEventListener('click', () => this.runMatching());
    
    // Export buttons
    document.getElementById('btn-export-report')?.addEventListener('click', () => this.exportReport());
    document.getElementById('btn-export-full')?.addEventListener('click', () => {
      Exporter.exportFullExcel({
        students: this.state.students,
        vtb: this.state.vtbTransactions,
        tpb: this.state.tpbTransactions,
        cash: this.state.cashPayments,
        reportRows: this.state.reportRows,
        stats: Reporter.getStatistics(this.state.reportRows),
        stkPhu: Storage.loadSTKPhu(),
        keywords: Storage.loadKeywords(),
        monthYear: document.getElementById('month-selector')?.value || ''
      });
    });
    document.getElementById('btn-export-accounting')?.addEventListener('click', () => this.exportAccounting());
    document.getElementById('btn-export-nhac-ph')?.addEventListener('click', () => this.exportNhacPH());

    // Accounting sub-tab buttons
    document.getElementById('btn-auto-select-invoice')?.addEventListener('click', () => this.autoSelectInvoice());
    document.getElementById('check-all-invoice')?.addEventListener('change', (e) => this.toggleAllInvoice(e.target.checked));

    // Settings buttons
    document.getElementById('btn-set-prev-month')?.addEventListener('click', () => this.savePrevMonth());
    document.getElementById('btn-export-stkphu')?.addEventListener('click', () => this.exportSTKPhu());
    document.getElementById('btn-export-backup')?.addEventListener('click', () => this.exportBackup());
    document.getElementById('btn-import-backup')?.addEventListener('click', () => this.importBackup());
    
    // Settings - Mapping buttons
    document.getElementById('btn-export-mapping')?.addEventListener('click', () => this.exportMapping());
    document.getElementById('btn-import-mapping')?.addEventListener('click', () => this.importMapping());

    // Family Group button
    document.getElementById('btn-add-family')?.addEventListener('click', () => this.addFamilyGroupUI());
    document.getElementById('btn-add-package')?.addEventListener('click', () => this.addPackageUI());
  },

  // ========================
  // FILTERS
  // ========================
  setupFilters: function() {
    const applyFilters = Utils.debounce(() => this.applyReportFilters(), 300);
    document.getElementById('filter-status')?.addEventListener('change', applyFilters);
    document.getElementById('filter-class')?.addEventListener('change', applyFilters);
    document.getElementById('filter-teacher')?.addEventListener('change', applyFilters);
    document.getElementById('search-report')?.addEventListener('input', applyFilters);
  },

  applyReportFilters: function() {
    const filters = {
      trangThai: document.getElementById('filter-status')?.value || 'all',
      className: document.getElementById('filter-class')?.value || 'all',
      teacher: document.getElementById('filter-teacher')?.value || 'all',
      searchText: document.getElementById('search-report')?.value || ''
    };
    const filtered = Reporter.filterReport(this.state.reportRows, filters);
    this.renderReportTable(filtered);
  },

  // ========================
  // CORE: MATCHING
  // ========================
  runMatching: async function(switchToReport) {
    // switchToReport: true = nhảy sang Báo cáo (khi bấm "Bắt đầu đối soát");
    //                     false = giữ nguyên tab hiện tại (khi gán tay từ tab Ngoại lệ)
    if (typeof switchToReport === 'undefined') switchToReport = true;
    Utils.showLoading(true);
    
    try {
      const stkPhu = Storage.loadSTKPhu() || [];
      const keywords = Storage.loadKeywords() || [];

      // 1. Match VietinBank
      if (this.state.vtbTransactions.length > 0) {
        const vtbResult = Matcher.matchVietinBank(this.state.vtbTransactions, this.state.students, stkPhu);
        this.state.vtbMatched = vtbResult.matched;
        this.state.vtbUnmatched = vtbResult.unmatched;
      }

      // 2. Match TPBank  
      if (this.state.tpbTransactions.length > 0) {
        const tpbResult = Matcher.matchTPBank(this.state.tpbTransactions, keywords, this.state.students);
        this.state.tpbMatched = tpbResult.matched;
        this.state.tpbUnmatched = tpbResult.unmatched;
      }

      // 3. Aggregate payments by MSHS
      let paymentsByMSHS = Matcher.aggregateByMSHS(
        this.state.vtbMatched,
        this.state.tpbMatched,
        this.state.cashPayments
      );

      // 3.5. Distribute family payments
      const familyGroups = Storage.loadFamilyGroups();
      if (familyGroups && familyGroups.length > 0) {
        paymentsByMSHS = Matcher.distributeByFamily(paymentsByMSHS, this.state.students, familyGroups);
      }

      // 4. Generate report
      this.state.reportRows = Reporter.generateReport(this.state.students, paymentsByMSHS, familyGroups, this.state.monthYear || '');
      const stats = Reporter.getStatistics(this.state.reportRows);

      // 5. Generate accounting
      this.state.thucTeRows = Accounting.generateThucTe(this.state.students);
      
      const prevMonthHD = Storage.loadPrevMonthHD() || [];
      const vtbMatchedMSHS = new Set(this.state.vtbMatched.map(t => t.matchedMSHS).filter(Boolean));
      const ghiHDResult = Accounting.generateGhiHD(this.state.thucTeRows, prevMonthHD, vtbMatchedMSHS);
      this.state.ghiHDRows = ghiHDResult.rows;
      this.state.selectedHDMSHS = ghiHDResult.selectedMSHS;
      
      // Set currentInvoiceStudents from ghiHDRows (for comparison with prev month)
      this.state.currentInvoiceStudents = this.state.ghiHDRows.map(r => ({
        mshs: r.mshs,
        fullName: r.fullName,
        className: r.className,
        hocPhi: r.hocPhi
      }));

      // 6. Detect changes
      const prevMonthDS = Storage.loadPrevMonthDS();
      if (prevMonthDS && prevMonthDS.length > 0) {
        // Map MSHS -> tổng CK VietinBank (TK Công ty) để kiểm tra sai số tiền
        const vtbAmountByMSHS = {};
        this.state.vtbMatched.forEach(t => {
          if (t.matchedMSHS) vtbAmountByMSHS[t.matchedMSHS] = (vtbAmountByMSHS[t.matchedMSHS] || 0) + (Number(t.credit) || 0);
        });
        this.state.changeRecords = Accounting.detectChanges(this.state.students, prevMonthDS, vtbMatchedMSHS, vtbAmountByMSHS, this.state.prevInvoiceStudents, this.state.currentInvoiceStudents);
      } else {
        this.state.changeRecords = [];
      }

      // 7. Get new STKs
      const newSTKs = Matcher.getNewSTKs(this.state.vtbTransactions, this.state.students, stkPhu);

      // RENDER ALL
      this.renderSummaryCards(stats);
      this.populateFilterDropdowns();
      this.renderReportTable(this.state.reportRows);
      this.renderExceptions(newSTKs, this.state.tpbUnmatched);
      this.renderAccountingTabs();
      this.renderSyncChanges();

      this.state.matchingDone = true;
      Utils.showToast('Đối soát hoàn tất!', 'success');

      // Chỉ nhảy sang Báo cáo khi được yêu cầu (bấm "Bắt đầu đối soát")
      // và không còn ngoại lệ. Nếu còn STK/từ khóa chưa gán -> ở lại tab Ngoại lệ.
      const stillHasExceptions = (newSTKs && newSTKs.length > 0) ||
                                 (this.state.tpbUnmatched && this.state.tpbUnmatched.length > 0);
      if (switchToReport && !stillHasExceptions) {
        document.querySelector('[data-tab="report-tab"]').click();
      } else if (stillHasExceptions) {
        Utils.showToast('Còn ' + ((newSTKs ? newSTKs.length : 0) + (this.state.tpbUnmatched ? this.state.tpbUnmatched.length : 0)) + ' ngoại lệ cần xử lý', 'warning');
      }

    } catch (err) {
      Utils.showToast(`Lỗi đối soát: ${err.message}`, 'error');
      console.error('Matching error:', err);
    } finally {
      Utils.showLoading(false);
    }
  },

  // ========================
  // RENDER: Summary Cards
  // ========================
  renderSummaryCards: function(stats) {
    document.getElementById('sum-total-hs').textContent = stats.tongHS || 0;
    document.getElementById('sum-paid').textContent = stats.daDong || 0;
    document.getElementById('sum-unpaid').textContent = stats.chuaDong || 0;
    document.getElementById('sum-partial').textContent = stats.dongThieu || 0;
    document.getElementById('sum-overpaid').textContent = stats.dongDu || 0;
    document.getElementById('sum-package').textContent = stats.dongGoi || 0;
    document.getElementById('sum-total-money').textContent = Utils.formatCurrency(stats.tongThu || 0) + ' ₫';
  },

  // ========================
  // RENDER: Filter Dropdowns
  // ========================
  populateFilterDropdowns: function() {
    const classes = [...new Set(this.state.students.map(s => s.className).filter(Boolean))].sort();
    const teachers = [...new Set(this.state.students.map(s => s.teacher).filter(Boolean))].sort();

    const classSelect = document.getElementById('filter-class');
    const teacherSelect = document.getElementById('filter-teacher');

    if (classSelect) {
      classSelect.innerHTML = '<option value="all">Tất cả lớp</option>';
      classes.forEach(c => {
        classSelect.innerHTML += `<option value="${c}">${c}</option>`;
      });
    }
    if (teacherSelect) {
      teacherSelect.innerHTML = '<option value="all">Tất cả GV</option>';
      teachers.forEach(t => {
        teacherSelect.innerHTML += `<option value="${t}">${t}</option>`;
      });
    }
  },

  // ========================
  // RENDER: Report Table
  // ========================
  renderReportTable: function(rows) {
    const tbody = document.querySelector('#table-report tbody');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:20px; color:var(--text-secondary)">Chưa có dữ liệu. Hãy import file và bấm "Bắt đầu đối soát".</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const statusClass = this.getStatusClass(r.trangThai);
      const isWarning = (r.ghiChu || '').includes('⚠');
      const isOverpaid = r.trangThai === APP_CONFIG.STATUS.OVERPAID;
      const safeName = (r.fullName || '').replace(/'/g, "\\'");
      const safeMshs = (r.mshs || '').replace(/'/g, "\\'");
      return `<tr class="${isWarning ? 'warning-row' : ''}">
        <td><button class="btn btn-xs btn-outline" title="Thêm gia đình" onclick="App.addFamilyGroupForStudent('${safeMshs}', '${safeName}')">➕</button></td>
        <td>${r.mshs || ''}</td>
        <td>${r.fullName || ''}</td>
        <td>${r.className || ''}</td>
        <td>${r.teacher || ''}</td>
        <td class="number">${Utils.formatCurrency(r.tongHocPhi)}</td>
        <td class="number">${Utils.formatCurrency(r.chuyenKhoanVTB)}</td>
        <td class="number">${Utils.formatCurrency(r.tienMat)}</td>
        <td class="number">${Utils.formatCurrency(r.chuyenKhoanTPB)}</td>
        <td class="number">${Utils.formatCurrency(r.tongDaDong)}</td>
        <td><span class="badge ${statusClass}">${r.trangThai || ''}</span></td>
        <td style="${isWarning ? 'color: var(--danger-color); font-weight: 500;' : ''}">${r.ghiChu || ''}${isOverpaid ? '<br><button class="btn btn-xs btn-outline mt-1" onclick="App.markBookFee(\'' + safeMshs + '\')">📚 Tiền sách</button>' : ''}</td>
      </tr>`;
    }).join('');
  },

  getStatusClass: function(status) {
    switch (status) {
      case APP_CONFIG.STATUS.PAID: return 'success';
      case APP_CONFIG.STATUS.UNPAID: return 'error';
      case APP_CONFIG.STATUS.PARTIAL: return 'warning';
      case APP_CONFIG.STATUS.OVERPAID: return 'info';
      case APP_CONFIG.STATUS.PACKAGE: return 'purple';
      case 'MIỄN PHÍ': return 'success';
      default: return '';
    }
  },

  // ========================
  // RENDER: Exceptions
  // ========================
  renderExceptions: function(newSTKs, unmatchedTPB) {
    // Filter out skipped transactions
    const skippedSTK = Storage._get('joy_skipped_stk', []);
    const skippedSTKSet = new Set(skippedSTK.map(s => s.stk));
    const skippedTPB = Storage._get('joy_skipped_tpb', []);
    const skippedTPBSet = new Set(skippedTPB.map(s => s.key));
    
    // Filter newSTKs to exclude skipped
    newSTKs = newSTKs.filter(s => !skippedSTKSet.has(s.stk));
    
    // Filter unmatchedTPB to exclude skipped
    unmatchedTPB = (unmatchedTPB || []).filter(t => {
      const key = `${t.date}_${t.credit}_${t.explanation}`;
      return !skippedTPBSet.has(key);
    });

    // New STKs
    const stkTbody = document.querySelector('#table-unmapped-stk tbody');
    const stkCount = document.getElementById('unmapped-stk-count');
    if (stkTbody) {
      if (newSTKs.length === 0) {
        stkTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary)">Không có STK mới</td></tr>';
      } else {
        stkTbody.innerHTML = newSTKs.map(s => {
          // Get suggestions
          const suggestions = Matcher.suggestMatch(
            { description: s.tenTK, stkDoiUng: s.stk, tenTKDoiUng: s.tenTK }, 
            this.state.students
          );
          const suggestText = suggestions.length > 0
            ? suggestions.map(sg => `${sg.mshs} - ${sg.studentName} (${Math.round(sg.score * 100)}%)`).join('<br>')
            : '<span style="color:var(--text-secondary)">Không có gợi ý</span>';

          return `<tr>
            <td><code>${s.stk}</code></td>
            <td>${s.tenTK}</td>
            <td class="number">${Utils.formatCurrency(s.totalAmount)}</td>
            <td class="suggestion">${suggestText}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="App.assignSTKToMSHS('${s.stk.replace(/'/g, "\\'")}', '${s.tenTK.replace(/'/g, "\\'")}', '${(suggestions[0]?suggestions[0].mshs:'').replace(/'/g, "\\'")}', '${(suggestions[0]?suggestions[0].studentName:'').replace(/'/g, "\\'")}', false)">Gán MSHS</button>
              <button class="btn btn-sm btn-warning" onclick="App.assignSTKToMSHS('${s.stk.replace(/'/g, "\\'")}', '${s.tenTK.replace(/'/g, "\\'")}', '${(suggestions[0]?suggestions[0].mshs:'').replace(/'/g, "\\'")}', '${(suggestions[0]?suggestions[0].studentName:'').replace(/'/g, "\\'")}', true)">📅 Tháng trước</button>
              <button class="btn btn-sm btn-outline" onclick="App.skipSTK('${s.stk.replace(/'/g, "\\'")}', '${s.tenTK.replace(/'/g, "\\'")}')">Bỏ qua</button>
            </td>
          </tr>`;
        }).join('');
      }
      if (stkCount) stkCount.textContent = newSTKs.length;
    }

    // Unmatched TPBank
    const tpbTbody = document.querySelector('#table-unidentified-tpb tbody');
    const tpbCount = document.getElementById('unidentified-tpb-count');
    if (tpbTbody) {
      if (!unmatchedTPB || unmatchedTPB.length === 0) {
        tpbTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary)">Không có giao dịch chưa xác định</td></tr>';
      } else {
        tpbTbody.innerHTML = unmatchedTPB.map((t, idx) => {
          const suggestions = Matcher.suggestMatch(t, this.state.students);
          const suggestText = suggestions.length > 0
            ? suggestions.map(sg => `${sg.mshs} - ${sg.studentName} (${Math.round(sg.score * 100)}%)`).join('<br>')
            : '<span style="color:var(--text-secondary)">Chưa có gợi ý</span>';
          return `<tr>
            <td>${t.date || ''}</td>
            <td class="description">${t.explanation || ''}</td>
            <td class="number">${Utils.formatCurrency(t.credit)}</td>
            <td class="suggestion">${suggestText}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="App.assignTPBToMSHS(${idx}, '${(suggestions[0]?suggestions[0].mshs:'').replace(/'/g, "\\'")}', '${(suggestions[0]?suggestions[0].studentName:'').replace(/'/g, "\\'")}', false)">Gán MSHS</button>
              <button class="btn btn-sm btn-warning" onclick="App.assignTPBToMSHS(${idx}, '${(suggestions[0]?suggestions[0].mshs:'').replace(/'/g, "\\'")}', '${(suggestions[0]?suggestions[0].studentName:'').replace(/'/g, "\\'")}', true)">📅 Tháng trước</button>
              <button class="btn btn-sm btn-outline" onclick="App.skipTPB('${t.date}_${t.credit}_${t.explanation}')">Bỏ qua</button>
            </td>
          </tr>`;
        }).join('');
      }
      if (tpbCount) tpbCount.textContent = unmatchedTPB ? unmatchedTPB.length : 0;
    }

    // Update exception counter badge
    const totalExceptions = newSTKs.length + (unmatchedTPB ? unmatchedTPB.length : 0);
    const exceptionCounter = document.getElementById('exception-counter');
    if (exceptionCounter) {
      exceptionCounter.textContent = totalExceptions;
      exceptionCounter.style.display = totalExceptions > 0 ? 'inline-flex' : 'none';
    }
  },

  // ========================
  // RENDER: Accounting Tabs
  // ========================
  renderAccountingTabs: function() {
    // DS Thực tế
    const thucTeTbody = document.querySelector('#table-acc-real tbody');
    if (thucTeTbody) {
      thucTeTbody.innerHTML = this.state.thucTeRows.map(r => `<tr>
        <td>${r.stt}</td>
        <td>${r.mshs}</td>
        <td>${r.className}</td>
        <td>${r.fullName}</td>
        <td>${r.teacher}</td>
        <td class="number">${Utils.formatCurrency(r.hocPhi)}</td>
        <td>${r.ghiChu || ''}</td>
      </tr>`).join('');
    }

    // DS Ghi HĐ (with checkboxes)
    this.renderInvoiceTable();

    // Thay đổi
    const changesTbody = document.querySelector('#table-acc-changes tbody');
    if (changesTbody) {
      if (this.state.changeRecords.length === 0) {
        changesTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-secondary)">Chưa có dữ liệu tháng trước để so sánh. Hãy lưu DS tháng này làm tham chiếu ở tab Cài đặt.</td></tr>';
      } else {
        changesTbody.innerHTML = this.state.changeRecords.map(c => {
          const typeInfo = this.getChangeTypeInfo(c.type);
          return `<tr class="${typeInfo.rowClass}">
            <td>${typeInfo.icon} ${typeInfo.label}</td>
            <td>${c.mshs}</td>
            <td>${c.fullName}</td>
            <td>${c.oldClass || '—'}</td>
            <td>${c.newClass || '—'}</td>
            <td>${c.ghiChu || ''}</td>
          </tr>`;
        }).join('');
      }
    }
  },

  renderInvoiceTable: function() {
    const tbody = document.querySelector('#table-acc-invoice tbody');
    if (!tbody) return;
    const selectedCount = document.getElementById('invoice-selected-count');

    // Build sets for labels
    const newStudents = new Set();
    if (this.state.changeRecords) {
      this.state.changeRecords.forEach(c => {
        if (c.type === APP_CONFIG.CHANGE_TYPE.NEW) newStudents.add(c.mshs);
      });
    }

    tbody.innerHTML = this.state.ghiHDRows.map((r, idx) => {
      const isSelected = this.state.selectedHDMSHS.has(r.mshs);
      const isMandatory = r.mandatory || false;
      const isNew = newStudents.has(r.mshs);
      
      let badges = '';
      if (isNew) badges += ' <span class="badge success" style="font-size:10px">Tang moi</span>';
      if (isMandatory) badges += ' <span class="badge info" style="font-size:10px">CK TK CT</span>';

      return `<tr class="${isMandatory ? 'mandatory-row' : ''}">
        <td>
          <input type="checkbox" class="invoice-check" data-mshs="${r.mshs}" 
            ${isSelected ? 'checked' : ''} ${isMandatory ? 'disabled title="Bắt buộc (CK vào TK Công ty)"' : ''}
            onchange="App.toggleInvoiceItem('${r.mshs}', this.checked)">
        </td>
        <td>${idx + 1}</td>
        <td>${r.mshs}</td>
        <td>${r.className}</td>
        <td>${r.fullName}</td>
        <td>${r.teacher}</td>
        <td class="number">${Utils.formatCurrency(r.hocPhi)}</td>
        <td>${r.ghiChu || ''}${badges}</td>
      </tr>`;
    }).join('');

    if (selectedCount) selectedCount.textContent = this.state.selectedHDMSHS.size;
  },

  getChangeTypeInfo: function(type) {
    switch (type) {
      case APP_CONFIG.CHANGE_TYPE.NEW:
        return { icon: '🆕', label: 'Tăng mới', rowClass: 'change-new' };
      case APP_CONFIG.CHANGE_TYPE.QUIT:
        return { icon: '🚫', label: 'Nghỉ học', rowClass: 'change-quit' };
      case APP_CONFIG.CHANGE_TYPE.CLASS_CHANGE:
        return { icon: '🔄', label: 'Đổi lớp', rowClass: 'change-class' };
      case APP_CONFIG.CHANGE_TYPE.COMPANY_TRANSFER:
        return { icon: '💳', label: 'CK vào TK CT', rowClass: 'change-company' };
      case 'giam_hoa_don':
        return { icon: '📋', label: 'Giảm HĐ', rowClass: 'change-quit' };
      case 'tang_hoa_don':
        return { icon: '📋', label: 'Tăng HĐ', rowClass: 'change-new' };
      default:
        return { icon: '❓', label: type, rowClass: '' };
    }
  },

  // ========================
  // RENDER: Sync Changes
  // ========================
  renderSyncChanges: function() {
    const tbody = document.querySelector('#table-sync-changes tbody');
    const syncCount = document.getElementById('sync-changes-count');
    const changes = Storage.loadSyncChanges() || [];
    
    if (tbody) {
      if (changes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-secondary)">Chưa có thay đổi cần sync</td></tr>';
      } else {
        tbody.innerHTML = changes.map((c, idx) => `<tr>
          <td><span class="badge ${c.type === 'stk_phu_moi' ? 'info' : 'warning'}">${c.type === 'stk_phu_moi' ? 'STK phụ' : 'Keyword'}</span></td>
          <td>${c.mshs}</td>
          <td>${c.content}</td>
          <td><input type="checkbox" ${c.synced ? 'checked' : ''} onchange="App.toggleSyncStatus(${idx}, this.checked)"></td>
        </tr>`).join('');
      }
      if (syncCount) syncCount.textContent = changes.filter(c => !c.synced).length;
    }
  },

  // ========================
  // ACTIONS: Assign STK → MSHS
  // ========================
  assignSTKToMSHS: function(stk, tenTK, suggestedMSHS, suggestedName, isPreviousMonth) {
    const title = isPreviousMonth ? 'Gán STK cho Học sinh (📅 Tháng trước)' : 'Gán STK cho Học sinh';
    const extraNote = isPreviousMonth ? '<p style="color:var(--warning-color); font-weight:bold;">⚠ Khoản này sẽ được tính vào tháng TRƯỚC, không tính vào tháng đang đối soát.</p>' : '';
    Utils.showModal(
      title,
      `<p>STK: <strong>${stk}</strong> (${tenTK})</p>
       ${extraNote}
       <div class="form-group mt-3">
         <label>Nhập MSHS (vd: HV001):</label>
         <input type="text" id="input-assign-mshs" class="form-input" placeholder="HVxxx" value="${(suggestedMSHS||'').replace(/"/g, '&quot;')}" autofocus>
       </div>
       <div class="form-group mt-2">
         <label>Tên học sinh:</label>
         <input type="text" id="input-assign-name" class="form-input" placeholder="Tên đầy đủ" value="${(suggestedName||'').replace(/"/g, '&quot;')}">
       </div>`,
      () => {
        const mshs = document.getElementById('input-assign-mshs')?.value?.trim();
        const name = document.getElementById('input-assign-name')?.value?.trim();
        if (!mshs) {
          Utils.showToast('Vui lòng nhập MSHS', 'error');
          return false;
        }
        // Save to STK_PHU
        Storage.addSTKPhu({
          mshs: mshs.toUpperCase(),
          fullName: name || '',
          stk: stk,
          tenTK: tenTK,
          addedDate: new Date().toISOString()
        });
        // Save previous month flag if needed
        if (isPreviousMonth) {
          Storage.addPreviousMonthPayment({
            mshs: mshs.toUpperCase(),
            stk: stk,
            tenTK: tenTK,
            amount: 0, // Will be filled by matching
            source: 'vtb',
            date: new Date().toISOString()
          });
        }
        // Add sync change
        Storage.addSyncChange({
          type: 'stk_phu_moi',
          mshs: mshs.toUpperCase(),
          content: `STK: ${stk} - ${tenTK}${isPreviousMonth ? ' (📅 Tháng trước)' : ''}`,
          synced: false,
          date: new Date().toISOString()
        });
        Storage.addHistory({
          date: new Date().toISOString(),
          action: isPreviousMonth ? 'Thêm STK phụ (Tháng trước)' : 'Thêm STK phụ',
          detail: `${mshs} ← STK ${stk} (${tenTK})`
        });
        Utils.showToast(`Đã gán STK ${stk} → ${mshs}${isPreviousMonth ? ' (thuộc tháng trước)' : ''}`, 'success');
        // Run matching in background WITHOUT showing loading overlay
        setTimeout(() => {
          this.runMatchingBackground();
        }, 100);
        return true;
      }
    );
  },

  assignTPBToMSHS: function(txIndex, suggestedMSHS, suggestedName, isPreviousMonth) {
    const tx = this.state.tpbUnmatched[txIndex];
    if (!tx) return;
    this._currentAssignTx = tx; // Store for keyword matching

    const title = isPreviousMonth ? 'Gán GD TPBank (📅 Tháng trước)' : 'Gán GD TPBank cho Học sinh';
    const extraNote = isPreviousMonth ? '<p style="color:var(--warning-color); font-weight:bold;">⚠ Khoản này sẽ được tính vào tháng TRƯỚC, không tính vào tháng đang đối soát.</p>' : '';
    Utils.showModal(
      title,
      `<p>Nội dung: <strong>${tx.explanation}</strong></p>
       <p>Số tiền: <strong>${Utils.formatCurrency(tx.credit)}</strong></p>
       ${extraNote}
       <div class="form-group mt-3">
         <label>Nhập MSHS:</label>
         <input type="text" id="input-assign-mshs" class="form-input" placeholder="HVxxx" value="${(suggestedMSHS||'').replace(/"/g, '&quot;')}" autofocus>
       </div>
       <div class="form-group mt-2">
         <label>Từ khóa để lưu (keyword):</label>
         <input type="text" id="input-assign-keyword" class="form-input" placeholder="Từ khóa nhận diện PH">
       </div>
       <div class="form-group mt-2">
         <label>Tên học sinh:</label>
         <input type="text" id="input-assign-name" class="form-input" placeholder="Tên đầy đủ" value="${(suggestedName||'').replace(/"/g, '&quot;')}">
       </div>`,
      () => {
        const mshs = document.getElementById('input-assign-mshs')?.value?.trim();
        const keyword = document.getElementById('input-assign-keyword')?.value?.trim();
        const name = document.getElementById('input-assign-name')?.value?.trim();
        if (!mshs) {
          Utils.showToast('Vui lòng nhập MSHS', 'error');
          return false;
        }
        if (keyword) {
          Storage.addKeyword({
            keyword: keyword,
            mshs: mshs.toUpperCase(),
            studentName: name || '',
            addedDate: new Date().toISOString()
          });
          Storage.addSyncChange({
            type: 'keyword_moi',
            mshs: mshs.toUpperCase(),
            content: `Keyword: "${keyword}"${isPreviousMonth ? ' (📅 Tháng trước)' : ''}`,
            synced: false,
            date: new Date().toISOString()
          });
        }
        // Save previous month flag if needed
        if (isPreviousMonth) {
          Storage.addPreviousMonthPayment({
            mshs: mshs.toUpperCase(),
            stk: '',
            tenTK: name || '',
            amount: tx.credit,
            source: 'tpb',
            date: new Date().toISOString()
          });
        }
        Storage.addHistory({
          date: new Date().toISOString(),
          action: isPreviousMonth ? 'Gán GD TPBank (Tháng trước)' : 'Gán GD TPBank',
          detail: `${mshs} ← "${keyword || tx.explanation.substring(0, 40)}..."`
        });
        Utils.showToast(`Đã gán GD TPBank → ${mshs}${isPreviousMonth ? ' (thuộc tháng trước)' : ''}`, 'success');
        // Run matching in background WITHOUT showing loading overlay
        setTimeout(() => {
          this.runMatchingBackground();
        }, 100);
        return true;
      }
    );
  },

  // Background matching - không hiện loading overlay
  runMatchingBackground: async function() {
    try {
      const stkPhu = Storage.loadSTKPhu() || [];
      const keywords = Storage.loadKeywords() || [];

      if (this.state.vtbTransactions.length > 0) {
        const vtbResult = Matcher.matchVietinBank(this.state.vtbTransactions, this.state.students, stkPhu);
        this.state.vtbMatched = vtbResult.matched;
        this.state.vtbUnmatched = vtbResult.unmatched;
      }

      if (this.state.tpbTransactions.length > 0) {
        const tpbResult = Matcher.matchTPBank(this.state.tpbTransactions, keywords, this.state.students);
        this.state.tpbMatched = tpbResult.matched;
        this.state.tpbUnmatched = tpbResult.unmatched;
      }

      let paymentsByMSHS = Matcher.aggregateByMSHS(
        this.state.vtbMatched,
        this.state.tpbMatched,
        this.state.cashPayments
      );

      const familyGroups = Storage.loadFamilyGroups();
      if (familyGroups && familyGroups.length > 0) {
        paymentsByMSHS = Matcher.distributeByFamily(paymentsByMSHS, this.state.students, familyGroups);
      }

      this.state.reportRows = Reporter.generateReport(this.state.students, paymentsByMSHS, familyGroups, this.state.monthYear || '');

      // Re-render current tab
      this.renderCurrentTab();
    } catch (e) {
      console.error('Background matching error:', e);
    }
  },

  renderCurrentTab: function() {
    // Check which tab is currently active and re-render it
    const exceptionTab = document.getElementById('exception-tab');
    if (exceptionTab && exceptionTab.classList.contains('active')) {
      // Re-render exceptions with current state
      const newSTKs = this.state.vtbUnmatched.filter(t => !t.matchedMSHS);
      this.renderExceptions(newSTKs, this.state.tpbUnmatched);
    }
    // Also re-render report if visible
    const reportTab = document.getElementById('report-tab');
    if (reportTab && reportTab.classList.contains('active')) {
      this.renderReportTable(this.state.reportRows);
    }
  },

  // Bỏ qua giao dịch VietinBank (lưu vào storage để không hiện lại)
  skipSTK: function(stk, tenTK) {
    const skipped = Storage._get('joy_skipped_stk', []);
    if (!skipped.some(s => s.stk === stk)) {
      skipped.push({ stk, tenTK, date: new Date().toISOString() });
      Storage._set('joy_skipped_stk', skipped);
    }
    Utils.showToast('Đã bỏ qua giao dịch này', 'success');
    this.renderCurrentTab();
  },

  // Bỏ qua giao dịch TPBank (lưu vào storage để không hiện lại)
  skipTPB: function(txKey) {
    const tx = this.state.tpbUnmatched.find(t => `${t.date}_${t.credit}_${t.explanation}` === txKey);
    if (!tx) return;
    
    // Thêm vào danh sách bỏ qua
    const skipped = Storage._get('joy_skipped_tpb', []);
    if (!skipped.some(s => s.key === txKey)) {
      skipped.push({ key: txKey, date: tx.date, credit: tx.credit, explanation: tx.explanation, skippedDate: new Date().toISOString() });
      Storage._set('joy_skipped_tpb', skipped);
    }
    
    // Xóa khỏi danh sách hiện tại
    this.state.tpbUnmatched = this.state.tpbUnmatched.filter(t => `${t.date}_${t.credit}_${t.explanation}` !== txKey);
    
    Utils.showToast('Đã bỏ qua. Nhấn "Hoàn tác" nếu nhầm.', 'success');
    this.renderCurrentTab();
    this.renderUndoButton();
  },

  // Hoàn tác giao dịch vừa bỏ qua
  undoSkipTPB: function() {
    const skipped = Storage._get('joy_skipped_tpb', []);
    if (skipped.length === 0) {
      Utils.showToast('Không có giao dịch nào để hoàn tác', 'warning');
      return;
    }
    // Lấy giao dịch vừa bỏ qua gần nhất
    const lastSkipped = skipped.pop();
    Storage._set('joy_skipped_tpb', skipped);
    
    // Thêm lại vào danh sách hiện tại (nếu chưa có)
    const exists = this.state.tpbUnmatched.some(t => `${t.date}_${t.credit}_${t.explanation}` === lastSkipped.key);
    if (!exists) {
      this.state.tpbUnmatched.push({
        date: lastSkipped.date,
        credit: lastSkipped.credit,
        explanation: lastSkipped.explanation
      });
    }
    
    Utils.showToast('Đã hoàn tác giao dịch', 'success');
    this.renderCurrentTab();
    this.renderUndoButton();
  },

  renderUndoButton: function() {
    const skipped = Storage._get('joy_skipped_tpb', []);
    const undoContainer = document.getElementById('undo-container');
    if (undoContainer) {
      if (skipped.length > 0) {
        undoContainer.innerHTML = `<button class="btn btn-sm btn-warning" onclick="App.undoSkipTPB()">↩ Hoàn tác bỏ qua</button>`;
      } else {
        undoContainer.innerHTML = '';
      }
    }
  },

  // ========================
  // ACTIONS: Invoice selection
  // ========================
  toggleInvoiceItem: function(mshs, checked) {
    if (checked) {
      this.state.selectedHDMSHS.add(mshs);
    } else {
      this.state.selectedHDMSHS.delete(mshs);
    }
    document.getElementById('invoice-selected-count').textContent = this.state.selectedHDMSHS.size;
  },

  toggleAllInvoice: function(checked) {
    this.state.ghiHDRows.forEach(r => {
      if (checked) {
        this.state.selectedHDMSHS.add(r.mshs);
      } else if (!r.mandatory) {
        this.state.selectedHDMSHS.delete(r.mshs);
      }
    });
    this.renderInvoiceTable();
  },

  autoSelectInvoice: function() {
    const prevHD = Storage.loadPrevMonthHD() || [];
    const vtbMSHS = new Set(this.state.vtbMatched.map(t => t.matchedMSHS).filter(Boolean));
    
    this.state.selectedHDMSHS = new Set();
    this.state.ghiHDRows.forEach(r => {
      if (prevHD.includes(r.mshs) || vtbMSHS.has(r.mshs) || r.mandatory) {
        this.state.selectedHDMSHS.add(r.mshs);
      }
    });
    this.renderInvoiceTable();
    Utils.showToast(`Đã tự động chọn ${this.state.selectedHDMSHS.size} học sinh`, 'success');
  },

  toggleSyncStatus: function(idx, checked) {
    const changes = Storage.loadSyncChanges() || [];
    if (changes[idx]) {
      changes[idx].synced = checked;
      Storage.saveSyncChanges(changes);
      this.renderSyncChanges();
    }
  },

  // ========================
  // EXPORT
  // ========================
  exportReport: function() {
    if (!this.state.reportRows.length) {
      Utils.showToast('Chưa có dữ liệu báo cáo', 'error');
      return;
    }
    const monthYear = document.getElementById('month-selector')?.value || '';
    const stats = Reporter.getStatistics(this.state.reportRows);
    Exporter.exportBaoCao(this.state.reportRows, stats, monthYear);
    Utils.showToast('Đã xuất file báo cáo đối soát', 'success');
  },

  exportAccounting: function() {
    if (!this.state.thucTeRows.length) {
      Utils.showToast('Chưa có dữ liệu kế toán', 'error');
      return;
    }
    const monthYear = document.getElementById('month-selector')?.value || '';
    const ghiHDSelected = this.state.ghiHDRows.filter(r => this.state.selectedHDMSHS.has(r.mshs));
    const prevMonthHD = Storage.loadPrevMonthHD() || [];
    Exporter.exportKeToan(this.state.thucTeRows, ghiHDSelected, this.state.changeRecords, monthYear, prevMonthHD);
    Utils.showToast('Đã xuất file báo cáo kế toán', 'success');
  },

  // ========================
  // SETTINGS
  // ========================
  savePrevMonth: function() {
    if (!this.state.students.length) {
      Utils.showToast('Chưa có dữ liệu học sinh', 'error');
      return;
    }
    const monthYear = document.getElementById('month-selector')?.value || '';
    Storage.savePrevMonthDS(this.state.students, {
      month: monthYear,
      savedDate: new Date().toISOString()
    });
    // Save HD list
    Storage.savePrevMonthHD([...this.state.selectedHDMSHS]);
    
    // Auto-archive
    if (this.state.matchingDone) {
      Exporter.exportMonthlyArchive({
        students: this.state.students,
        reportRows: this.state.reportRows,
        thucTeRows: this.state.thucTeRows,
        selectedHDMSHS: [...this.state.selectedHDMSHS],
        changeRecords: this.state.changeRecords,
        stkPhu: Storage.loadSTKPhu(),
        keywords: Storage.loadKeywords()
      }, monthYear);
    }

    Storage.addHistory({
      date: new Date().toISOString(),
      action: 'Lưu DS tháng tham chiếu',
      detail: `Tháng ${monthYear}, ${this.state.students.length} HS`
    });
    Utils.showToast('Đã lưu DS tháng này làm tham chiếu + xuất file backup', 'success');
    this.loadSettingsUI();
  },

  // (C) Nhập DS nộp Kế toán tháng trước từ file Excel (để đối chiếu Tăng mới/Giảm/Sai số tiền)
  importPrevMonthExcel: function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      Utils.showLoading(true);
      try {
        const ds = await Importer.parseGoogleSheets(file);
        const students = ds.students || ds;
        
        // Trích MSHS có cờ ghi HĐ (cột ghiChuGiaDinh chứa 'ghi hd' / 'hóa đơn')
        const hdList = students
          .filter(s => {
            const note = (s.ghiChuGiaDinh || '').toLowerCase();
            return note.includes('ghi hd') || note.includes('hoá đơn') || note.includes('hóa đơn');
          })
          .map(s => s.mshs);
        
        // Lưu danh sách học sinh tháng trước
        const monthYear = document.getElementById('month-selector')?.value || '';
        Storage.savePrevMonthDS(students, { month: monthYear + ' (Kế toán T)', savedDate: new Date().toISOString() });
        Storage.savePrevMonthHD(hdList);
        
        // Lưu thêm trạng thái đóng tiền của từng bé (nếu có trong file)
        const paymentStatus = {};
        students.forEach(s => {
          if (s.mshs) {
            paymentStatus[s.mshs] = {
              hocPhi: s.hocPhi || 0,
              trangThai: s.ghiChuGiaDinh || ''
            };
          }
        });
        Storage._set('joy_prev_month_payment_status', paymentStatus);
        
        Storage.addHistory({
          date: new Date().toISOString(),
          action: 'Nhập DS Kế toán tháng trước',
          detail: `${students.length} HS, ${hdList.length} ghi HĐ`
        });
        Utils.showToast(`Đã nhập DS tháng trước: ${students.length} HS (${hdList.length} ghi HĐ). Tab "Thay đổi" sẽ hiển thị so sánh.`, 'success');
        this.loadSettingsUI();
      } catch (err) {
        Utils.showToast(`Lỗi đọc file: ${err.message}`, 'error');
      } finally {
        Utils.showLoading(false);
      }
    };
    input.click();
  },

  exportSTKPhu: function() {
    Exporter.exportSTKPhu(Storage.loadSTKPhu(), this.state.students);
    Utils.showToast('Đã xuất DS STK phụ (dán vào Google Trang tính)', 'success');
  },

  exportBackup: function() {
    Utils.showToast('Đã xuất file backup', 'success');
  },

  importBackup: function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          Storage.importFullBackup(data);
          Utils.showToast('Đã khôi phục dữ liệu từ backup', 'success');
          this.loadSettingsUI();
        } catch (err) {
          Utils.showToast('File backup không hợp lệ', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  exportNhacPH: function() {
    if (!this.state.reportRows || this.state.reportRows.length === 0) {
      Utils.showToast('Chưa có dữ liệu báo cáo. Hãy chạy đối soát trước.', 'error');
      return;
    }
    const nhacList = Accounting.generateNhacPH(this.state.reportRows);
    if (nhacList.length === 0) {
      Utils.showToast('Không có học sinh nào cần nhắc phí!', 'info');
      return;
    }
    const monthYear = document.getElementById('month-selector')?.value || '';
    Exporter.exportNhacPH(nhacList, monthYear);
    Utils.showToast(`Đã xuất DS nhắc phí (${nhacList.length} học sinh)`, 'success');
  },

  exportMapping: function() {
    const data = {
      joy_stk_phu: Storage.loadSTKPhu(),
      joy_keywords: Storage.loadKeywords(),
      joy_family_groups: Storage.loadFamilyGroups(),
      exportDate: new Date().toISOString()
    };
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `joy_mappings.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    Utils.showToast('Đã xuất file mapping (STK + Từ khóa + Nhóm GĐ)', 'success');
  },

  importMapping: function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          let addedSTK = 0;
          let addedKw = 0;
          let addedFG = 0;
          if (data.joy_stk_phu) addedSTK = Storage.mergeSTKPhu(data.joy_stk_phu);
          if (data.joy_keywords) addedKw = Storage.mergeKeywords(data.joy_keywords);
          if (data.joy_family_groups) addedFG = Storage.mergeFamilyGroups(data.joy_family_groups);
          
          Utils.showToast(`Đã gộp mapping: +${addedSTK} STK, +${addedKw} từ khóa, +${addedFG} nhóm GĐ`, 'success');
          this.loadSettingsUI();
        } catch (err) {
          Utils.showToast('Lỗi đọc file JSON mapping', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  loadSettingsUI: function() {
    // Family groups table
    const familyGroups = Storage.loadFamilyGroups() || [];
    const fgTbody = document.querySelector('#table-family-groups tbody');
    if (fgTbody) {
      if (familyGroups.length === 0) {
        fgTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary)">Chưa có nhóm gia đình nào</td></tr>';
      } else {
        fgTbody.innerHTML = familyGroups.map(g => `<tr>
          <td>${g.groupName}</td>
          <td><code>${g.stkDaiDien}</code></td>
          <td>${g.tenPH}</td>
          <td>${g.members.join(', ')}</td>
          <td><button class="btn btn-sm btn-danger" onclick="App.deleteFamilyGroup('${g.groupId}')">Xóa</button></td>
        </tr>`).join('');
      }
    }

    // Packages table
    const packages = Storage.loadPackages() || [];
    const pkgTbody = document.querySelector('#table-packages tbody');
    if (pkgTbody) {
      if (packages.length === 0) {
        pkgTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-secondary)">Chưa có gói đóng học phí nào</td></tr>';
      } else {
        pkgTbody.innerHTML = packages.map(p => {
          // Calculate discount amount per student per month
          const hpDefault = APP_CONFIG.DEFAULT_HOC_PHI || 800000;
          const discountPerMonth = Math.floor(hpDefault * (p.discountPercent || 0) / 100);
          const totalDiscount = discountPerMonth * (p.months || 1) * p.members.length;
          
          // Check if package is expiring soon (last month)
          const now = new Date();
          const [endYear, endMon] = (p.endMonth || '').split('-').map(Number);
          const endDate = new Date(endYear, endMon);
          const monthsLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24 * 30));
          const isExpiring = monthsLeft <= 1 && monthsLeft >= 0;
          
          return `<tr style="${isExpiring ? 'background: rgba(255,193,7,0.1);' : ''}">
            <td>${p.packageName} ${isExpiring ? '<span style="color:var(--warning-color);">⚠ Hết hạn</span>' : ''}</td>
            <td>${p.members.join(', ')}</td>
            <td>${p.months} tháng</td>
            <td>${p.discountPercent || 0}%</td>
            <td class="number">${Utils.formatCurrency(totalDiscount)}</td>
            <td>${p.startMonth}</td>
            <td>${p.endMonth}</td>
            <td><button class="btn btn-sm btn-danger" onclick="App.deletePackage('${p.packageId}')">Xóa</button></td>
          </tr>`;
        }).join('');
      }
    }

    // STK Phu table
    const stkPhu = Storage.loadSTKPhu() || [];
    const stkTbody = document.querySelector('#table-stk-mapping tbody');
    if (stkTbody) {
      if (stkPhu.length === 0) {
        stkTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-secondary)">Chưa có dữ liệu</td></tr>';
      } else {
        stkTbody.innerHTML = stkPhu.map(m => `<tr>
          <td>${m.mshs}</td>
          <td><code>${m.stk}</code></td>
          <td>${m.tenTK}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="App.editSTKPhu('${m.stk.replace(/'/g, "\\'")}', '${m.mshs.replace(/'/g, "\\'")}', '${(m.tenTK||'').replace(/'/g, "\\'")}')">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteSTKPhu('${m.stk.replace(/'/g, "\\'")}')">Xóa</button>
          </td>
        </tr>`).join('');
      }
    }

    // Keywords table
    const keywords = Storage.loadKeywords() || [];
    const kwTbody = document.querySelector('#table-keyword-mapping tbody');
    if (kwTbody) {
      if (keywords.length === 0) {
        kwTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-secondary)">Chưa có dữ liệu</td></tr>';
      } else {
        kwTbody.innerHTML = keywords.map(k => `<tr>
          <td>${k.keyword}</td>
          <td>${k.mshs}</td>
          <td>${k.studentName || ''}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="App.editKeyword('${k.keyword.replace(/'/g, "\\'")}', '${k.mshs.replace(/'/g, "\\'")}', '${(k.studentName||'').replace(/'/g, "\\'")}')">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteKeyword('${k.keyword.replace(/'/g, "\\'")}')">Xóa</button>
          </td>
        </tr>`).join('');
      }
    }

    // Storage info
    const info = Storage.getStorageInfo();
    const prevMonthStatus = document.getElementById('status-prev-month');
    const prevAccountingStatus = document.getElementById('status-prev-accounting');
    const lastBackup = document.getElementById('status-last-backup');
    if (prevMonthStatus) {
      if (info.prevMonthInfo) {
        prevMonthStatus.textContent = `Đã có (${info.prevMonthInfo.month || 'N/A'})`;
        prevMonthStatus.className = 'badge success';
      } else {
        prevMonthStatus.textContent = 'Chưa có';
        prevMonthStatus.className = 'badge warning';
      }
    }
    if (prevAccountingStatus) {
      const prevPaymentStatus = Storage._get('joy_prev_month_payment_status', null);
      if (prevPaymentStatus && Object.keys(prevPaymentStatus).length > 0) {
        prevAccountingStatus.textContent = `Đã có (${Object.keys(prevPaymentStatus).length} HS)`;
        prevAccountingStatus.className = 'badge success';
      } else {
        prevAccountingStatus.textContent = 'Chưa có';
        prevAccountingStatus.className = 'badge warning';
      }
    }
    const prevInvoiceStatus = document.getElementById('status-prev-invoice');
    if (prevInvoiceStatus) {
      const prevInvStudents = Storage._get('joy_prev_invoice_students', []);
      if (prevInvStudents.length > 0) {
        prevInvoiceStatus.textContent = `Đã có (${prevInvStudents.length} HS)`;
        prevInvoiceStatus.className = 'badge success';
      } else {
        prevInvoiceStatus.textContent = 'Chưa có';
        prevInvoiceStatus.className = 'badge warning';
      }
    }
    if (lastBackup) {
      lastBackup.textContent = info.lastHistoryDate || 'Chưa có';
    }

    // History log
    const historyLog = document.getElementById('history-log');
    const history = Storage.loadHistory() || [];
    if (historyLog) {
      if (history.length === 0) {
        historyLog.innerHTML = '<li style="color:var(--text-secondary)">Chưa có hoạt động nào</li>';
      } else {
        historyLog.innerHTML = history.slice(0, 50).map(h => {
          const date = new Date(h.date).toLocaleString('vi-VN');
          return `<li><span class="history-date">${date}</span> <strong>${h.action}</strong>: ${h.detail}</li>`;
        }).join('');
      }
    }
  },

  deleteSTKPhu: function(stk) {
    Storage.removeSTKPhu(stk);
    Utils.showToast('Đã xóa STK phụ', 'success');
    this.loadSettingsUI();
  },

  editSTKPhu: function(oldStk, oldMshs, oldTenTK) {
    Utils.showModal(
      'Sửa STK Phụ',
      `
      <div class="form-group mb-3">
        <label>MSHS:</label>
        <input type="text" id="input-edit-stk-mshs" class="form-control" value="${oldMshs}">
      </div>
      <div class="form-group mb-3">
        <label>STK:</label>
        <input type="text" id="input-edit-stk-stk" class="form-control" value="${oldStk}">
      </div>
      <div class="form-group mb-3">
        <label>Tên TK:</label>
        <input type="text" id="input-edit-stk-ten" class="form-control" value="${oldTenTK}">
      </div>
      `,
      () => {
        const mshs = document.getElementById('input-edit-stk-mshs').value.trim().toUpperCase();
        const stk = document.getElementById('input-edit-stk-stk').value.trim();
        const tenTK = document.getElementById('input-edit-stk-ten').value.trim();
        if (!mshs || !stk) {
          Utils.showToast('MSHS và STK không được để trống', 'error');
          return false;
        }
        // Xóa cũ, thêm mới
        Storage.removeSTKPhu(oldStk);
        Storage.addSTKPhu({ mshs, stk, tenTK, addedDate: new Date().toISOString() });
        Utils.showToast(`Đã cập nhật STK ${stk} → ${mshs}`, 'success');
        this.loadSettingsUI();
        return true;
      }
    );
  },

  deleteKeyword: function(keyword) {
    Storage.removeKeyword(keyword);
    Utils.showToast('Đã xóa từ khóa', 'success');
    this.loadSettingsUI();
  },

  editKeyword: function(oldKeyword, oldMshs, oldName) {
    Utils.showModal(
      'Sửa Từ khóa',
      `
      <div class="form-group mb-3">
        <label>Từ khóa:</label>
        <input type="text" id="input-edit-kw-keyword" class="form-control" value="${oldKeyword}">
      </div>
      <div class="form-group mb-3">
        <label>MSHS:</label>
        <input type="text" id="input-edit-kw-mshs" class="form-control" value="${oldMshs}">
      </div>
      <div class="form-group mb-3">
        <label>Tên HS:</label>
        <input type="text" id="input-edit-kw-name" class="form-control" value="${oldName}">
      </div>
      `,
      () => {
        const keyword = document.getElementById('input-edit-kw-keyword').value.trim();
        const mshs = document.getElementById('input-edit-kw-mshs').value.trim().toUpperCase();
        const name = document.getElementById('input-edit-kw-name').value.trim();
        if (!keyword || !mshs) {
          Utils.showToast('Từ khóa và MSHS không được để trống', 'error');
          return false;
        }
        Storage.removeKeyword(oldKeyword);
        Storage.addKeyword({ keyword, mshs, studentName: name, addedDate: new Date().toISOString() });
        Utils.showToast(`Đã cập nhật từ khóa "${keyword}" → ${mshs}`, 'success');
        this.loadSettingsUI();
        return true;
      }
    );
  },

  addFamilyGroupUI: function() {
    Utils.showModal(
      'Thêm Nhóm Gia đình',
      `
      <div class="form-group mb-3">
        <label>Tên nhóm (gợi nhớ)</label>
        <input type="text" id="input-fg-name" class="form-control" placeholder="VD: Nhà Cô Lan">
      </div>
      <div class="form-group mb-3">
        <label>Danh sách MSHS của các con (bắt buộc)</label>
        <input type="text" id="input-fg-members" class="form-control" placeholder="Cách nhau dấu phẩy (VD: HV011, HV012)">
      </div>
      <div class="form-group mb-3">
        <label>Tên PH / Chủ tài khoản (tùy chọn)</label>
        <input type="text" id="input-fg-ten" class="form-control" placeholder="Tên phụ huynh nếu biết">
      </div>
      <div class="form-group mb-3">
        <label>STK Đại diện (tùy chọn)</label>
        <input type="text" id="input-fg-stk" class="form-control" placeholder="Bỏ trống nếu CK qua TPBank/Zalo">
      </div>
      <p class="text-sm text-secondary">Khi phụ huynh này CK, hệ thống sẽ tự chia đều cho các MSHS trên dựa theo mức học phí của từng bé.</p>
      <p class="text-sm text-secondary">💡 Chỉ cần nhập MSHS là đủ. Tên PH và STK là thông tin bổ sung, không bắt buộc.</p>
      `,
      () => {
        const groupName = document.getElementById('input-fg-name').value.trim();
        const membersRaw = document.getElementById('input-fg-members').value.trim();
        const tenPH = document.getElementById('input-fg-ten').value.trim();
        const stkDaiDien = document.getElementById('input-fg-stk').value.trim();

        if (!groupName || !membersRaw) {
          Utils.showToast('Vui lòng nhập Tên nhóm và MSHS các con', 'error');
          return false;
        }

        const members = membersRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        if (members.length < 2) {
          Utils.showToast('Nhóm gia đình phải có ít nhất 2 MSHS', 'error');
          return false;
        }

        Storage.addFamilyGroup({
          groupName,
          stkDaiDien: stkDaiDien || tenPH || groupName,
          tenPH: tenPH || '',
          members
        });

        Utils.showToast('Đã thêm nhóm gia đình', 'success');
        this.loadSettingsUI();
        return true;
      }
    );
  },

  deleteFamilyGroup: function(groupId) {
    Storage.removeFamilyGroup(groupId);
    Utils.showToast('Đã xóa nhóm gia đình', 'success');
    this.loadSettingsUI();
  },

  // ========================
  // ACTIONS: Package Payments
  // ========================
  addPackageUI: function() {
    const monthYear = document.getElementById('input-month')?.value || '';
    const discount6 = document.getElementById('input-pkg-discount-6')?.value || 6;
    const discount12 = document.getElementById('input-pkg-discount-12')?.value || 12;
    Utils.showModal(
      'Thêm Gói Đóng Góc Học Phí',
      `
      <div class="form-group mb-3">
        <label>Tên gói (gợi nhớ)</label>
        <input type="text" id="input-pkg-name" class="form-control" placeholder="VD: Gói 6 tháng Nhà Cô Lan">
      </div>
      <div class="form-group mb-3">
        <label>Danh sách MSHS của các con (bắt buộc)</label>
        <input type="text" id="input-pkg-members" class="form-control" placeholder="Cách nhau dấu phẩy (VD: HV011, HV012)">
      </div>
      <div class="form-group mb-3">
        <label>Số tháng đóng trước</label>
        <select id="input-pkg-months" class="form-control">
          <option value="6">6 tháng (giảm ${discount6}%)</option>
          <option value="12">12 tháng (giảm ${discount12}%)</option>
        </select>
      </div>
      <div class="form-group mb-3">
        <label>Tháng bắt đầu (YYYY-MM)</label>
        <input type="text" id="input-pkg-start" class="form-control" placeholder="VD: 2026-08" value="${monthYear}">
      </div>
      <p class="text-sm text-secondary">Hệ thống sẽ tự động ghi nhận các con đã đóng học phí + giảm giá cho tất cả các tháng trong gói.</p>
      `,
      () => {
        const packageName = document.getElementById('input-pkg-name').value.trim();
        const membersRaw = document.getElementById('input-pkg-members').value.trim();
        const months = parseInt(document.getElementById('input-pkg-months').value) || 6;
        const startMonth = document.getElementById('input-pkg-start').value.trim();

        if (!packageName || !membersRaw || !startMonth) {
          Utils.showToast('Vui lòng nhập Tên gói, MSHS và Tháng bắt đầu', 'error');
          return false;
        }

        // Validate month format
        if (!/^\d{4}-\d{2}$/.test(startMonth)) {
          Utils.showToast('Tháng bắt đầu phải có định dạng YYYY-MM (VD: 2026-08)', 'error');
          return false;
        }

        const members = membersRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        if (members.length < 1) {
          Utils.showToast('Vui lòng nhập ít nhất 1 MSHS', 'error');
          return false;
        }

        // Calculate end month and discount
        const [startYear, startMon] = startMonth.split('-').map(Number);
        const endDate = new Date(startYear, startMon - 1 + months);
        const endMonth = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
        
        // Get discount percentage based on months
        const discountPercent = months >= 12 ? parseFloat(discount12) : parseFloat(discount6);

        Storage.addPackage({
          packageName,
          members,
          months,
          startMonth,
          endMonth,
          discountPercent
        });

        Utils.showToast(`Đã thêm gói "${packageName}" cho ${members.length} bé, ${months} tháng`, 'success');
        this.loadSettingsUI();
        return true;
      }
    );
  },

  deletePackage: function(packageId) {
    Storage.removePackage(packageId);
    Utils.showToast('Đã xóa gói', 'success');
    this.loadSettingsUI();
  },

  // ========================
  // ACTIONS: Quick Family Group from Report
  // ========================
  addFamilyGroupForStudent: function(mshs, fullName) {
    // Pre-fill form with this student's info
    Utils.showModal(
      `Thêm Nhóm Gia đình — ${fullName} (${mshs})`,
      `
      <div class="form-group mb-3">
        <label>Tên nhóm (gợi nhớ)</label>
        <input type="text" id="input-fg-name" class="form-control" placeholder="VD: Nhà ${fullName}" value="Nhà ${fullName}">
      </div>
      <div class="form-group mb-3">
        <label>Danh sách MSHS của các con (bắt buộc)</label>
        <input type="text" id="input-fg-members" class="form-control" placeholder="Cách nhau dấu phẩy" value="${mshs}, ">
      </div>
      <div class="form-group mb-3">
        <label>Tên PH / Chủ tài khoản (tùy chọn)</label>
        <input type="text" id="input-fg-ten" class="form-control" placeholder="Tên phụ huynh nếu biết">
      </div>
      <div class="form-group mb-3">
        <label>STK Đại diện (tùy chọn)</label>
        <input type="text" id="input-fg-stk" class="form-control" placeholder="Bỏ trống nếu CK qua TPBank/Zalo">
      </div>
      <p class="text-sm text-secondary">💡 Bổ sung thêm MSHS anh chị em vào ô trên, rồi bấm Xác nhận.</p>
      `,
      () => {
        const groupName = document.getElementById('input-fg-name').value.trim();
        const membersRaw = document.getElementById('input-fg-members').value.trim();
        const tenPH = document.getElementById('input-fg-ten').value.trim();
        const stkDaiDien = document.getElementById('input-fg-stk').value.trim();

        if (!groupName || !membersRaw) {
          Utils.showToast('Vui lòng nhập Tên nhóm và MSHS các con', 'error');
          return false;
        }

        const members = membersRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        if (members.length < 2) {
          Utils.showToast('Nhóm gia đình phải có ít nhất 2 MSHS', 'error');
          return false;
        }

        Storage.addFamilyGroup({
          groupName,
          stkDaiDien: stkDaiDien || tenPH || groupName,
          tenPH: tenPH || '',
          members
        });

        Utils.showToast(`Đã thêm nhóm gia đình: ${groupName}`, 'success');
        this.loadSettingsUI();
        return true;
      }
    );
  },

  // ========================
  // ACTIONS: Book Fee Mark
  // ========================
  markBookFee: function(mshs) {
    Utils.showModal(
      `📚 Ghi nhận Tiền sách — ${mshs}`,
      `
      <p>Học sinh <strong>${mshs}</strong> đóng dư học phí.</p>
      <div class="form-group mt-3">
        <label>Số tiền sách (VNĐ):</label>
        <input type="text" id="input-book-fee" class="form-control" placeholder="VD: 200000" autofocus>
      </div>
      <p class="text-sm text-secondary">Sau khi xác nhận, ghi chú "📚 Tiền sách: X.XXX.XXXđ" sẽ được thêm vào dòng này.</p>
      `,
      () => {
        const amount = Utils.parseNumber(document.getElementById('input-book-fee')?.value);
        if (!amount || amount <= 0) {
          Utils.showToast('Vui lòng nhập số tiền sách hợp lệ', 'error');
          return false;
        }

        // Update the report row note
        const row = this.state.reportRows.find(r => r.mshs === mshs);
        if (row) {
          const bookNote = `📚 Tiền sách: ${Utils.formatCurrency(amount)}`;
          row.ghiChu = row.ghiChu ? row.ghiChu + ' · ' + bookNote : bookNote;
          row.tienSach = amount;
          // Re-render report
          this.renderReportTable(this.state.reportRows);
        }

        Utils.showToast(`Đã ghi nhận tiền sách ${Utils.formatCurrency(amount)} cho ${mshs}`, 'success');
        return true;
      }
    );
  }
};

// ========================
// BOOTSTRAP
// ========================
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
