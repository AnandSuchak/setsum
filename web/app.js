// SetSum Frontend State Controller
let token = localStorage.getItem('setsum_token') || '';
let currentUser = null;
let currentView = 'calendar';
let selectedDate = new Date().toISOString().split('T')[0]; // Today's date YYYY-MM-DD
let activeCalendarMonth = new Date().getMonth(); // 0-11
let activeCalendarYear = new Date().getFullYear();

// Cache lists
let cachedRates = [];
let cachedShifts = [];
let cachedAgencies = [];

// Calendar views & filters
let activeStatusFilter = 'all';

// Chart state
let activeChartYear = new Date().getFullYear();

// Elements Cache
const DOM = {
  screenAuth: document.getElementById('screen-auth'),
  screenApp: document.getElementById('screen-app'),
  formSignin: document.getElementById('form-signin'),
  formSignup: document.getElementById('form-signup'),
  
  // Auth fields
  signinEmail: document.getElementById('signin-email'),
  signinPass: document.getElementById('signin-password'),
  signupEmail: document.getElementById('signup-email'),
  signupPass: document.getElementById('signup-password'),
  signupComm: document.getElementById('signup-comm'),
  signupTaxStart: document.getElementById('signup-tax-start'),
  headerUserEmail: document.getElementById('header-user-email'),
  toggleToSignup: document.getElementById('toggle-to-signup'),
  toggleToSignin: document.getElementById('toggle-to-signin'),
  btnLogout: document.getElementById('btn-logout'),
  
  // Nav
  navItems: document.querySelectorAll('.nav-item'),
  appViews: document.querySelectorAll('.app-view'),
  
  // Calendar elements
  calendarGrid: document.getElementById('calendar-grid'),
  calendarMonthYear: document.getElementById('calendar-month-year'),
  calendarShiftList: document.getElementById('calendar-shift-list'),
  filterChips: document.querySelectorAll('.filter-chip'),
  btnCalPrev: document.getElementById('btn-cal-prev'),
  btnCalNext: document.getElementById('btn-cal-next'),
  
  // Modals close
  btnCloseShiftModal: document.getElementById('btn-close-shift-modal'),
  btnClosePendingModal: document.getElementById('btn-close-pending-modal'),
  
  // Calculator elements
  calcRateSelect: document.getElementById('calc-rate-select'),
  calcCallTime: document.getElementById('calc-call-time'),
  calcWrapTime: document.getElementById('calc-wrap-time'),
  calcBaseAmount: document.getElementById('calc-base-amount'),
  calcRateLabel: document.getElementById('calc-rate-label'),
  calcSuppFees: document.getElementById('calc-supp-fees'),
  calcMealAllow: document.getElementById('calc-meal-allow'),
  calcTravelAllow: document.getElementById('calc-travel-allow'),
  calcHolidayPay: document.getElementById('calc-holiday-pay'),
  calcCommPct: document.getElementById('calc-comm-pct'),
  calcAddPayment: document.getElementById('calc-add-payment'),
  calcIsHoliday: document.getElementById('calc-is-holiday'),
  calcIsNight: document.getElementById('calc-is-night'),
  calcNetTotal: document.getElementById('calc-net-total'),
  calcToggleBreakdown: document.getElementById('calc-toggle-breakdown'),
  calcBreakdownDrawer: document.getElementById('calc-breakdown-drawer'),
  breakdownBase: document.getElementById('breakdown-base'),
  breakdownOt: document.getElementById('breakdown-ot'),
  breakdownHoliday: document.getElementById('breakdown-holiday'),
  breakdownAllowances: document.getElementById('breakdown-allowances'),
  breakdownGross: document.getElementById('breakdown-gross'),
  breakdownComm: document.getElementById('breakdown-comm'),
  
  // Dashboard elements
  dashNetTotal: document.getElementById('dash-net-total'),
  dashPendingTotal: document.getElementById('dash-pending-total'),
  taxYearLabel: document.getElementById('tax-year-label'),
  taxGrossVal: document.getElementById('tax-gross-val'),
  taxExpVal: document.getElementById('tax-exp-val'),
  taxNetVal: document.getElementById('tax-net-val'),
  chartSelectedYear: document.getElementById('chart-selected-year'),
  btnOpenPendingModal: document.getElementById('btn-open-pending-modal'),
  btnGoExport: document.getElementById('btn-go-export'),
  btnShareTax: document.getElementById('btn-share-tax'),
  btnEnterAdmin: document.getElementById('btn-enter-admin'),
  btnExitAdmin: document.getElementById('btn-exit-admin'),
  btnRunExport: document.getElementById('btn-run-export'),
  
  // Tax Exporter elements
  exportStartDate: document.getElementById('export-start-date'),
  exportEndDate: document.getElementById('export-end-date'),
  exportResultBox: document.getElementById('export-result-box'),
  expResGross: document.getElementById('exp-res-gross'),
  expResExp: document.getElementById('exp-res-exp'),
  expResComm: document.getElementById('exp-res-comm'),
  expResVat: document.getElementById('exp-res-vat'),
  expResNet: document.getElementById('exp-res-net'),
  exportSpinner: document.getElementById('export-spinner'),
  
  // Feedback elements
  feedbackSubject: document.getElementById('feedback-subject'),
  feedbackMessage: document.getElementById('feedback-message'),
  btnSubmitFeedback: document.getElementById('btn-submit-feedback'),
  
  // Admin Panel elements
  adminEntryCard: document.getElementById('admin-entry-card'),
  adminStatTotalUsers: document.getElementById('admin-stat-total-users'),
  adminStatNewUsers: document.getElementById('admin-stat-new-users'),
  adminStatDau: document.getElementById('admin-stat-dau'),
  adminUsersTableBody: document.getElementById('admin-users-table-body'),
  adminFeedbackList: document.getElementById('admin-feedback-list'),
  
  // Modals
  modalShiftTitle: document.getElementById('modal-shift-title'),
  modalShiftLog: document.getElementById('modal-shift-log'),
  modalPendingPayments: document.getElementById('modal-pending-payments'),
  shiftLogForm: document.getElementById('shift-log-form'),
  editShiftId: document.getElementById('edit-shift-id'),
  shiftProject: document.getElementById('shift-project'),
  shiftStatus: document.getElementById('shift-status'),
  shiftDate: document.getElementById('shift-date'),
  shiftRateSelect: document.getElementById('shift-rate-select'),
  shiftCallTime: document.getElementById('shift-call-time'),
  shiftWrapTime: document.getElementById('shift-wrap-time'),
  shiftIsHoliday: document.getElementById('shift-is-holiday'),
  shiftIsNight: document.getElementById('shift-is-night'),
  shiftGross: document.getElementById('shift-gross'),
  shiftComm: document.getElementById('shift-comm'),
  shiftVat: document.getElementById('shift-vat'),
  shiftExpenses: document.getElementById('shift-expenses'),
  shiftExpectedPayment: document.getElementById('shift-expected-payment'),
  shiftAgency: document.getElementById('shift-agency'),
  shiftNotes: document.getElementById('shift-notes'),
  shiftNetDisplay: document.getElementById('shift-net-display'),
  btnDeleteShift: document.getElementById('btn-delete-shift'),
  pendingTableBody: document.getElementById('pending-table-body'),
  pendingCountLabel: document.getElementById('pending-count-label'),
  pendingSumLabel: document.getElementById('pending-sum-label'),
  agencyDatalist: document.getElementById('agency-datalist'),
};

// Update live time in header mockup
setInterval(() => {
  const now = new Date();
  DOM.livePhoneTime = document.getElementById('live-phone-time');
  if (DOM.livePhoneTime) {
    DOM.livePhoneTime.innerText = now.toTimeString().slice(0, 5);
  }
}, 1000);

// HTML Sanitization utility to prevent Cross-Site Scripting (XSS)
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// API Fetch helper
async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, { ...options, headers });
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'API Request failed');
  }
  return data;
}

// Check initial Auth
async function checkAuth() {
  if (!token) {
    showScreen('auth');
    return;
  }

  try {
    const data = await apiCall('/api/auth/me');
    currentUser = data.user;
    DOM.headerUserEmail.innerText = currentUser.email;
    
    // Default form configuration
    DOM.calcCommPct.value = currentUser.default_commission_rate;
    
    // Check role
    if (currentUser.role === 'admin') {
      DOM.adminEntryCard.classList.remove('hidden');
    } else {
      DOM.adminEntryCard.classList.add('hidden');
    }

    showScreen('app');
    await loadInitialData();
    resetInactivityTimer();
  } catch (err) {
    console.error('Session validation failed:', err);
    logout();
  }
}

// 5-Minute Inactivity Auto-Logout Controller
let inactivityTimer = null;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (token) {
    inactivityTimer = setTimeout(() => {
      console.log('Inactivity limit reached (5 mins). Auto-logging out...');
      alert('You have been logged out due to 5 minutes of inactivity.');
      logout();
    }, FIVE_MINUTES_MS);
  }
}

// Track mouse movement, typing, clicks, touches, and scrolling to reset timer
['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, resetInactivityTimer, { passive: true });
});

async function logout() {
  clearTimeout(inactivityTimer);
  try {
    if (token) {
      await apiCall('/api/auth/logout', { method: 'POST' });
    }
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    localStorage.removeItem('setsum_token');
    token = '';
    currentUser = null;
    showScreen('auth');
  }
}

function showScreen(screen) {
  DOM.screenAuth.classList.remove('active');
  DOM.screenApp.classList.remove('active');
  
  if (screen === 'auth') {
    DOM.screenAuth.classList.add('active');
  } else {
    DOM.screenApp.classList.add('active');
    switchView(currentView);
  }
}

// Flag to prevent scroll spy triggering link highlight jumps during programmatic scrolling
let isProgrammaticScrolling = false;
let scrollSpyTimeout = null;

function switchView(viewName) {
  currentView = viewName;
  
  // Highlight the active nav item
  DOM.navItems.forEach(n => n.classList.remove('active'));
  const activeNavEl = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (activeNavEl) {
    activeNavEl.classList.add('active');
  }

  // Handle Admin view bypass (Admin dashboard is treated as a separate full screen)
  const adminViewEl = document.getElementById('view-admin');
  const addShiftBtn = document.getElementById('btn-open-log-modal');
  
  if (viewName === 'admin') {
    if (adminViewEl) adminViewEl.style.display = 'flex';
    // Hide user views
    document.querySelectorAll('.app-view').forEach(v => {
      if (v.id !== 'view-admin') v.style.display = 'none';
    });
    if (addShiftBtn) addShiftBtn.style.display = 'none';
    return;
  }

  // Restore user views if exiting admin
  if (adminViewEl) adminViewEl.style.display = 'none';
  document.querySelectorAll('.app-view').forEach(v => {
    if (v.id !== 'view-admin') v.style.display = 'flex';
  });
  if (addShiftBtn) addShiftBtn.style.display = 'flex';

  // Scroll main panel to targeted section
  const targetEl = document.getElementById(`view-${viewName}`);
  const scrollContainer = document.querySelector('.app-main-workspace');
  if (targetEl && scrollContainer) {
    isProgrammaticScrolling = true;
    
    // Smooth scroll inside workspace
    const topPos = targetEl.offsetTop - 30; // offset spacing
    scrollContainer.scrollTo({
      top: topPos,
      behavior: 'smooth'
    });

    // Release programmatic block after scrolling completes
    clearTimeout(scrollSpyTimeout);
    scrollSpyTimeout = setTimeout(() => {
      isProgrammaticScrolling = false;
    }, 800);
  }
}

// Load Core Data from DB
async function loadInitialData() {
  try {
    cachedRates = await apiCall('/api/rates');
    await refreshDataCache();
    
    // Populate rate dropdowns
    populateRateDropdown(DOM.calcRateSelect);
    populateRateDropdown(DOM.shiftRateSelect);
    
    renderCalendar();
    renderCalendarShifts();
    populateAgencyDatalist();
    
    // Fetch and draw summary dashboard immediately so elements (charts) are loaded
    await loadDashboardSummary();
    
    // Attach scroll spy to sidebar nav highlights
    setupScrollSpy();
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

function setupScrollSpy() {
  const scrollContainer = document.querySelector('.app-main-workspace');
  if (!scrollContainer) return;

  scrollContainer.addEventListener('scroll', () => {
    // Skip updating highlights if we are programmatically scrolling to a section via sidebar click, or if in admin dashboard
    if (isProgrammaticScrolling || currentView === 'admin') return;

    const views = ['calendar', 'calculator', 'summary', 'profile'];
    let currentActive = 'calendar';

    // Check which view is currently at the top of the container scroll
    for (const view of views) {
      const el = document.getElementById(`view-${view}`);
      if (el) {
        // Element's offset relative to the scroll top of container
        const relativeTop = el.offsetTop - scrollContainer.scrollTop;
        if (relativeTop <= 180) {
          currentActive = view;
        }
      }
    }

    // Update active highlight class in sidebar menu
    DOM.navItems.forEach(n => n.classList.remove('active'));
    const activeNavEl = document.querySelector(`.nav-item[data-view="${currentActive}"]`);
    if (activeNavEl) {
      activeNavEl.classList.add('active');
    }
    currentView = currentActive;
  });
}

async function refreshDataCache() {
  cachedShifts = await apiCall('/api/shifts');
  cachedAgencies = await apiCall('/api/agencies');
}

function populateRateDropdown(selectEl) {
  // Clear options except custom
  selectEl.innerHTML = '<option value="custom">Flat Rate (Custom Calculations)</option>';
  
  // We only show one option per Rate name, and dynamically toggle Day/Night based on checkboxes
  const uniqueNames = [...new Set(cachedRates.map(r => r.name))];
  uniqueNames.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.innerText = name;
    selectEl.appendChild(opt);
  });
}

function populateAgencyDatalist() {
  DOM.agencyDatalist.innerHTML = '';
  cachedAgencies.forEach(agency => {
    const opt = document.createElement('option');
    opt.value = agency.name;
    DOM.agencyDatalist.appendChild(opt);
  });
}

// ==========================================================================
// CALCULATOR SECTION LOGIC
// ==========================================================================

function calculateDynamicShiftEarnings(baseAmt, callTime, wrapTime, rateObj, isHoliday) {
  let base = baseAmt;
  let otRate = 0;
  let holidayPay = 0;
  
  if (rateObj) {
    base = isHoliday ? rateObj.holiday_base_rate : rateObj.base_rate;
    otRate = isHoliday ? rateObj.holiday_overtime_rate : rateObj.overtime_rate;
    holidayPay = rateObj.holiday_pay;
  }

  let hours = 0;
  if (callTime && wrapTime) {
    const [callH, callM] = callTime.split(':').map(Number);
    const [wrapH, wrapM] = wrapTime.split(':').map(Number);
    let diffMin = (wrapH * 60 + wrapM) - (callH * 60 + callM);
    if (diffMin < 0) {
      diffMin += 24 * 60; // Next Day wrap
    }
    hours = diffMin / 60;
  }

  const otHours = Math.max(0, hours - 9); // standard 9 hour shift inclusive of break
  const otEarning = otHours * otRate;
  const gross = base + otEarning + holidayPay;

  return {
    gross: parseFloat(gross.toFixed(2)),
    base: parseFloat(base.toFixed(2)),
    ot: parseFloat(otEarning.toFixed(2)),
    holiday: parseFloat(holidayPay.toFixed(2)),
    hours: parseFloat(hours.toFixed(2)),
    otHours: parseFloat(otHours.toFixed(2))
  };
}

function runCalculatorCompute() {
  const rateName = DOM.calcRateSelect.value;
  const isNight = DOM.calcIsNight.checked;
  const isHoliday = DOM.calcIsHoliday.checked;
  const callTime = DOM.calcCallTime.value;
  const wrapTime = DOM.calcWrapTime.value;
  const flatAmt = parseFloat(DOM.calcBaseAmount.value) || 0;
  
  let rateObj = null;
  if (rateName !== 'custom') {
    const shiftType = isNight ? 'Night' : 'Day';
    rateObj = cachedRates.find(r => r.name === rateName && r.shift_type === shiftType);
  }

  const earnings = calculateDynamicShiftEarnings(flatAmt, callTime, wrapTime, rateObj, isHoliday);
  
  // Retrieve additions and commission
  const supp = parseFloat(DOM.calcSuppFees.value) || 0;
  const meal = parseFloat(DOM.calcMealAllow.value) || 0;
  const travel = parseFloat(DOM.calcTravelAllow.value) || 0;
  const addPay = parseFloat(DOM.calcAddPayment.value) || 0;
  const commPct = parseFloat(DOM.calcCommPct.value) || 0;
  
  const additionalHolidayPayInput = rateObj ? 0 : (parseFloat(DOM.calcHolidayPay.value) || 0);

  const finalGross = earnings.gross + supp + meal + travel + addPay + additionalHolidayPayInput;
  const commission = finalGross * (commPct / 100);
  // Net = Gross - Commission
  const finalNet = finalGross - commission;

  DOM.calcNetTotal.innerText = finalNet.toFixed(2);
  
  // Render breakdown drawer details
  DOM.breakdownBase.innerText = `£${earnings.base.toFixed(2)}`;
  DOM.breakdownOt.innerText = `£${earnings.ot.toFixed(2)} (${earnings.otHours} hrs)`;
  DOM.breakdownHoliday.innerText = `£${(rateObj ? earnings.holiday : additionalHolidayPayInput).toFixed(2)}`;
  DOM.breakdownAllowances.innerText = `£${(supp + meal + travel + addPay).toFixed(2)}`;
  DOM.breakdownGross.innerText = `£${finalGross.toFixed(2)}`;
  DOM.breakdownComm.innerText = `-£${commission.toFixed(2)}`;
}

// Watchers for Calculator rates
DOM.calcRateSelect.addEventListener('change', () => {
  const isCustom = DOM.calcRateSelect.value === 'custom';
  if (isCustom) {
    DOM.calcRateLabel.innerText = "Flat Rate Amount (£)";
    DOM.calcBaseAmount.disabled = false;
    DOM.calcHolidayPay.disabled = false;
  } else {
    DOM.calcRateLabel.innerText = "Predefined Union Base (£)";
    DOM.calcBaseAmount.disabled = true;
    DOM.calcHolidayPay.disabled = true;
    
    // Auto-update base rate display
    const rateObj = cachedRates.find(r => r.name === DOM.calcRateSelect.value && r.shift_type === (DOM.calcIsNight.checked ? 'Night' : 'Day'));
    if (rateObj) {
      DOM.calcBaseAmount.value = (DOM.calcIsHoliday.checked ? rateObj.holiday_base_rate : rateObj.base_rate).toFixed(2);
      DOM.calcHolidayPay.value = rateObj.holiday_pay.toFixed(2);
    }
  }
  runCalculatorCompute();
});

[DOM.calcIsNight, DOM.calcIsHoliday].forEach(el => {
  el.addEventListener('change', () => {
    if (DOM.calcRateSelect.value !== 'custom') {
      const rateObj = cachedRates.find(r => r.name === DOM.calcRateSelect.value && r.shift_type === (DOM.calcIsNight.checked ? 'Night' : 'Day'));
      if (rateObj) {
        DOM.calcBaseAmount.value = (DOM.calcIsHoliday.checked ? rateObj.holiday_base_rate : rateObj.base_rate).toFixed(2);
        DOM.calcHolidayPay.value = rateObj.holiday_pay.toFixed(2);
      }
    }
    runCalculatorCompute();
  });
});

[DOM.calcCallTime, DOM.calcWrapTime, DOM.calcBaseAmount, DOM.calcSuppFees, DOM.calcMealAllow, DOM.calcTravelAllow, DOM.calcHolidayPay, DOM.calcCommPct, DOM.calcAddPayment].forEach(el => {
  el.addEventListener('input', runCalculatorCompute);
});

// Toggle calculator breakdown drawer
if (DOM.calcToggleBreakdown) {
  DOM.calcToggleBreakdown.addEventListener('click', () => {
    const isHidden = DOM.calcBreakdownDrawer.style.display !== 'flex';
    DOM.calcBreakdownDrawer.style.display = isHidden ? 'flex' : 'none';
    const chevron = document.querySelector('.result-chevron');
    if (chevron) chevron.classList.toggle('rotated');
  });
}

// Reset Calculator
document.getElementById('btn-calc-reset').addEventListener('click', () => {
  DOM.calcRateSelect.value = 'custom';
  DOM.calcCallTime.value = '06:15';
  DOM.calcWrapTime.value = '18:02';
  DOM.calcBaseAmount.value = '100.00';
  DOM.calcRateLabel.innerText = "Flat Rate Amount (£)";
  DOM.calcBaseAmount.disabled = false;
  DOM.calcHolidayPay.disabled = false;
  DOM.calcSuppFees.value = '23.00';
  DOM.calcMealAllow.value = '23.38';
  DOM.calcTravelAllow.value = '22.54';
  DOM.calcHolidayPay.value = '13.42';
  DOM.calcCommPct.value = currentUser ? currentUser.default_commission_rate : '20';
  DOM.calcAddPayment.value = '0.00';
  DOM.calcIsHoliday.checked = false;
  DOM.calcIsNight.checked = false;
  runCalculatorCompute();
});


// ==========================================================================
// SHIFT LOG MODAL AND LIVE LOGIC
// ==========================================================================

function updateShiftModalNet() {
  const rateName = DOM.shiftRateSelect.value;
  const isNight = DOM.shiftIsNight.checked;
  const isHoliday = DOM.shiftIsHoliday.checked;
  const callTime = DOM.shiftCallTime.value;
  const wrapTime = DOM.shiftWrapTime.value;
  const manualGross = parseFloat(DOM.shiftGross.value) || 0;
  
  if (rateName !== 'custom') {
    const shiftType = isNight ? 'Night' : 'Day';
    const rateObj = cachedRates.find(r => r.name === rateName && r.shift_type === shiftType);
    
    if (rateObj) {
      // Base rate autofill values
      const calcResult = calculateDynamicShiftEarnings(0, callTime, wrapTime, rateObj, isHoliday);
      
      // Update form Gross field automatically
      DOM.shiftGross.value = calcResult.gross.toFixed(2);
      
      // Update Commission
      const userCommRate = currentUser ? currentUser.default_commission_rate : 20.00;
      DOM.shiftComm.value = (calcResult.gross * (userCommRate / 100)).toFixed(2);
    }
  }

  const gross = parseFloat(DOM.shiftGross.value) || 0.00;
  const commission = parseFloat(DOM.shiftComm.value) || 0.00;
  const vat = parseFloat(DOM.shiftVat.value) || 0.00;
  const expenses = parseFloat(DOM.shiftExpenses.value) || 0.00;

  // Net = Gross - Commission - VAT - Shift Expenses
  const net = gross - commission - vat - expenses;
  DOM.shiftNetDisplay.innerText = `£${net.toFixed(2)}`;
}

// Watchers for shifts modal calculations
DOM.shiftRateSelect.addEventListener('change', () => {
  const isCustom = DOM.shiftRateSelect.value === 'custom';
  DOM.shiftGross.disabled = !isCustom;
  DOM.shiftComm.disabled = !isCustom;
  updateShiftModalNet();
});

[DOM.shiftIsNight, DOM.shiftIsHoliday, DOM.shiftCallTime, DOM.shiftWrapTime, DOM.shiftGross, DOM.shiftComm, DOM.shiftVat, DOM.shiftExpenses].forEach(el => {
  el.addEventListener('input', updateShiftModalNet);
  el.addEventListener('change', updateShiftModalNet);
});

// Submit Log/Edit Form
DOM.shiftLogForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = DOM.editShiftId.value;
  const rateName = DOM.shiftRateSelect.value;
  let rate_id = null;
  
  if (rateName !== 'custom') {
    const rateObj = cachedRates.find(r => r.name === rateName && r.shift_type === (DOM.shiftIsNight.checked ? 'Night' : 'Day'));
    if (rateObj) rate_id = rateObj.id;
  }

  // Create or lookup agency
  let agency_id = null;
  const agencyName = DOM.shiftAgency.value.trim();
  if (agencyName) {
    try {
      const resAgency = await apiCall('/api/agencies', {
        method: 'POST',
        body: JSON.stringify({ name: agencyName })
      });
      agency_id = resAgency.id;
    } catch (err) {
      console.error('Agency setup failed:', err);
    }
  }

  const payload = {
    project_name: DOM.shiftProject.value,
    status: DOM.shiftStatus.value,
    shift_date: DOM.shiftDate.value,
    call_time: DOM.shiftCallTime.value || null,
    wrap_time: DOM.shiftWrapTime.value || null,
    is_public_holiday: DOM.shiftIsHoliday.checked ? 1 : 0,
    is_night_shift: DOM.shiftIsNight.checked ? 1 : 0,
    gross_earnings: parseFloat(DOM.shiftGross.value) || 0,
    agency_commission: parseFloat(DOM.shiftComm.value) || 0,
    vat: parseFloat(DOM.shiftVat.value) || 0,
    net_earnings: parseFloat(DOM.shiftNetDisplay.innerText.replace('£', '')) || 0,
    expected_payment_date: DOM.shiftExpectedPayment.value || null,
    notes: DOM.shiftNotes.value || null,
    agency_id,
    rate_id
  };

  try {
    if (id) {
      // EDIT MODE
      await apiCall(`/api/shifts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      // NEW MODE
      const newShift = await apiCall('/api/shifts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      // Automatically log dynamic expenses entered into shift logger under shifts table!
      const shiftExpensesAmt = parseFloat(DOM.shiftExpenses.value) || 0;
      if (shiftExpensesAmt > 0) {
        await apiCall('/api/expenses', {
          method: 'POST',
          body: JSON.stringify({
            category: 'Shift Expense',
            amount: shiftExpensesAmt,
            date_incurred: DOM.shiftDate.value,
            shift_id: newShift.id
          })
        });
      }
    }

    DOM.modalShiftLog.classList.remove('active');
    await refreshDataCache();
    renderCalendar();
    renderCalendarShifts();
    populateAgencyDatalist();
    
    if (currentView === 'summary') {
      loadDashboardSummary();
    }
  } catch (err) {
    alert(err.message);
  }
});

// Delete Shift
DOM.btnDeleteShift.addEventListener('click', async () => {
  const id = DOM.editShiftId.value;
  if (!id) return;
  
  if (confirm('Are you sure you want to delete this shift?')) {
    try {
      await apiCall(`/api/shifts/${id}`, { method: 'DELETE' });
      DOM.modalShiftLog.classList.remove('active');
      await refreshDataCache();
      renderCalendar();
      renderCalendarShifts();
      if (currentView === 'summary') {
        loadDashboardSummary();
      }
    } catch (err) {
      alert(err.message);
    }
  }
});


// ==========================================================================
// CALENDAR RENDERING LOGIC
// ==========================================================================

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function renderCalendar() {
  DOM.calendarMonthYear.innerText = `${MONTHS[activeCalendarMonth]} ${activeCalendarYear}`;
  DOM.calendarGrid.innerHTML = '';

  const firstDay = new Date(activeCalendarYear, activeCalendarMonth, 1).getDay(); // Day of week index
  // Normalize Sunday = 6, Monday = 0
  const normalizedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(activeCalendarYear, activeCalendarMonth + 1, 0).getDate();
  const prevDaysInMonth = new Date(activeCalendarYear, activeCalendarMonth, 0).getDate();

  // 1. Prev Month fillers
  for (let i = normalizedFirstDay; i > 0; i--) {
    const day = prevDaysInMonth - i + 1;
    const cell = document.createElement('div');
    cell.classList.add('cal-day', 'prev-next', 'empty');
    cell.innerText = day;
    DOM.calendarGrid.appendChild(cell);
  }

  // 2. Current Month days
  const todayStr = new Date().toISOString().split('T')[0];
  
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    cell.classList.add('cal-day');
    cell.innerText = day;

    const dateStr = `${activeCalendarYear}-${String(activeCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cell.setAttribute('data-date', dateStr);

    if (dateStr === todayStr) {
      cell.classList.add('today');
    }
    if (dateStr === selectedDate) {
      cell.classList.add('selected');
    }

    // Attach shift status indicators
    const dayShifts = cachedShifts.filter(s => s.shift_date === dateStr);
    if (dayShifts.length > 0) {
      // Find highest priority status or draw dot of first shift
      const firstStatus = dayShifts[0].status;
      const dot = document.createElement('span');
      dot.classList.add('cal-dot', firstStatus.toLowerCase());
      cell.appendChild(dot);
    }

    cell.addEventListener('click', () => {
      document.querySelectorAll('.cal-day').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      selectedDate = dateStr;
      renderCalendarShifts();
    });

    DOM.calendarGrid.appendChild(cell);
  }
}

function renderCalendarShifts() {
  DOM.calendarShiftList.innerHTML = '';
  
  // Filter shifts based on Selected Date AND Active Status Filter
  let filtered = cachedShifts.filter(s => s.shift_date === selectedDate);
  if (activeStatusFilter !== 'all') {
    filtered = filtered.filter(s => s.status === activeStatusFilter);
  }

  if (filtered.length === 0) {
    DOM.calendarShiftList.innerHTML = `
      <div class="empty-state">
        <i class="fa-regular fa-calendar-minus"></i>
        <p>No ${activeStatusFilter !== 'all' ? activeStatusFilter.toLowerCase() : ''} shifts logged for this date.</p>
      </div>`;
    return;
  }

  filtered.forEach(shift => {
    const card = document.createElement('div');
    card.classList.add('shift-context-card', shift.status.toLowerCase());
    
    let callWrapInfo = 'Flat Rate / Direct Gig';
    if (shift.call_time && shift.wrap_time) {
      callWrapInfo = `<i class="fa-regular fa-clock"></i> ${shift.call_time} - ${shift.wrap_time}`;
    }

    card.innerHTML = `
      <div class="shift-info-left">
        <h4>${escapeHTML(shift.project_name)}</h4>
        <div class="details">
          <span>${callWrapInfo}</span>
          <span>•</span>
          <span>${escapeHTML(shift.agency_name || 'Direct Client')}</span>
        </div>
      </div>
      <div class="shift-status-pill ${shift.status.toLowerCase()}">${escapeHTML(shift.status)}</div>
    `;

    card.addEventListener('click', () => openShiftModal(shift));
    DOM.calendarShiftList.appendChild(card);
  });
}

function openShiftModal(shift = null) {
  DOM.shiftLogForm.reset();
  
  if (shift) {
    // EDIT MODE
    DOM.modalShiftTitle.innerText = "Edit Shift Record";
    DOM.editShiftId.value = shift.id;
    DOM.shiftProject.value = shift.project_name;
    DOM.shiftStatus.value = shift.status;
    DOM.shiftDate.value = shift.shift_date;
    DOM.shiftCallTime.value = shift.call_time || '';
    DOM.shiftWrapTime.value = shift.wrap_time || '';
    DOM.shiftIsHoliday.checked = shift.is_public_holiday === 1;
    DOM.shiftIsNight.checked = shift.is_night_shift === 1;
    DOM.shiftGross.value = shift.gross_earnings.toFixed(2);
    DOM.shiftComm.value = shift.agency_commission.toFixed(2);
    DOM.shiftVat.value = shift.vat.toFixed(2);
    DOM.shiftExpenses.value = 0.00; // Shift expenses are logged to expenses table
    DOM.shiftExpectedPayment.value = shift.expected_payment_date || '';
    DOM.shiftAgency.value = shift.agency_name || '';
    DOM.shiftNotes.value = shift.notes || '';
    
    // Find rate select match
    if (shift.rate_id) {
      const rateObj = cachedRates.find(r => r.id === shift.rate_id);
      if (rateObj) {
        DOM.shiftRateSelect.value = rateObj.name;
        DOM.shiftGross.disabled = true;
        DOM.shiftComm.disabled = true;
      }
    } else {
      DOM.shiftRateSelect.value = 'custom';
      DOM.shiftGross.disabled = false;
      DOM.shiftComm.disabled = false;
    }
    
    DOM.btnDeleteShift.classList.remove('hidden');
  } else {
    // NEW MODE
    DOM.modalShiftTitle.innerText = "Log Shift Record";
    DOM.editShiftId.value = '';
    DOM.shiftDate.value = selectedDate;
    DOM.shiftRateSelect.value = 'custom';
    DOM.shiftGross.disabled = false;
    DOM.shiftComm.disabled = false;
    DOM.btnDeleteShift.classList.add('hidden');
    DOM.shiftGross.value = '0.00';
    DOM.shiftComm.value = '0.00';
    DOM.shiftVat.value = '0.00';
    DOM.shiftExpenses.value = '0.00';
  }

  updateShiftModalNet();
  DOM.modalShiftLog.classList.add('active');
}

// Calendar Month navigation
DOM.btnCalPrev.addEventListener('click', () => {
  activeCalendarMonth--;
  if (activeCalendarMonth < 0) {
    activeCalendarMonth = 11;
    activeCalendarYear--;
  }
  renderCalendar();
});

DOM.btnCalNext.addEventListener('click', () => {
  activeCalendarMonth++;
  if (activeCalendarMonth > 11) {
    activeCalendarMonth = 0;
    activeCalendarYear++;
  }
  renderCalendar();
});

// Status filter chips
DOM.filterChips.forEach(chip => {
  chip.addEventListener('click', () => {
    DOM.filterChips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeStatusFilter = chip.getAttribute('data-status');
    renderCalendarShifts();
  });
});


// ==========================================================================
// SUMMARY DASHBOARD SUMMARY & CUSTOM CANVAS CHART
// ==========================================================================

async function loadDashboardSummary() {
  try {
    const data = await apiCall(`/api/dashboard/summary?year=${activeChartYear}`);
    
    // Fill top totals cards
    DOM.dashNetTotal.innerText = `£${data.netEarningsTotal.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    DOM.dashPendingTotal.innerText = `£${data.pendingTotal.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    
    // Fill tax summary card
    DOM.taxYearLabel.innerText = data.taxYear.label;
    DOM.taxGrossVal.innerText = `£${data.taxYear.gross.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    DOM.taxExpVal.innerText = `£${data.taxYear.expenses.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    DOM.taxNetVal.innerText = `£${data.taxYear.net.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Cache pending shifts globally to display in the modal table
    DOM.pendingShiftsCache = data.pendingShifts;
    DOM.pendingShiftsSum = data.pendingTotal;

    // Render Canvas charts
    drawEarningsChart(data.chartData.months);
  } catch (err) {
    console.error('Failed to load dashboard summary:', err);
  }
}

function drawEarningsChart(monthlyData) {
  const canvas = document.getElementById('earningsChart');
  if (!canvas) return;

  // Wrap in a short timeout to let the desktop tab layout complete reflow
  setTimeout(() => {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height || 240;

    // Guard: If width is still 0 (browser reflow not done), retry on next paint frame
    if (w === 0) {
      requestAnimationFrame(() => drawEarningsChart(monthlyData));
      return;
    }

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, w, h);

  // Find max value for scaling
  const maxVal = Math.max(...monthlyData, 500); // minimum scale peak £500
  
  const barCount = 12;
  const padLeft = 24;
  const padRight = 10;
  const padTop = 15;
  const padBottom = 20;

  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const colWidth = chartW / barCount;
  const barWidth = colWidth * 0.55;

  // Draw Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const y = padTop + (chartH / yTicks) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    // Tick Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px Plus Jakarta Sans';
    ctx.textAlign = 'right';
    const tickVal = maxVal - (maxVal / yTicks) * i;
    
    let formattedVal = tickVal >= 1000 ? `${(tickVal/1000).toFixed(1)}k` : Math.round(tickVal);
    ctx.fillText(formattedVal, padLeft - 6, y + 3);
  }

  // Draw Bars
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  monthlyData.forEach((val, i) => {
    const x = padLeft + colWidth * i + (colWidth - barWidth) / 2;
    const pct = val / maxVal;
    const barH = chartH * pct;
    const y = padTop + chartH - barH;

    // Draw Bar
    if (barH > 0) {
      // Rounded bar top path
      ctx.beginPath();
      const radius = Math.min(barWidth / 2, barH);
      ctx.roundRect(x, y, barWidth, barH, [radius, radius, 0, 0]);

      // Create beautiful neon vertical gradient
      const grad = ctx.createLinearGradient(x, y, x, y + barH);
      // Alternate bar gradients (matching screenshots)
      if (i % 2 === 0) {
        grad.addColorStop(0, '#8b5cf6'); // Violet
        grad.addColorStop(1, 'rgba(139, 92, 246, 0.15)');
      } else {
        grad.addColorStop(0, '#06b6d4'); // Cyan
        grad.addColorStop(1, 'rgba(6, 182, 212, 0.15)');
      }

      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Draw Month text
    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText(monthLabels[i], padLeft + colWidth * i + colWidth/2, h - 6);
  });
}, 50);
}

DOM.chartSelectedYear.innerText = activeChartYear;
document.getElementById('btn-chart-prev').addEventListener('click', () => {
  activeChartYear--;
  DOM.chartSelectedYear.innerText = activeChartYear;
  loadDashboardSummary();
});

document.getElementById('btn-chart-next').addEventListener('click', () => {
  activeChartYear++;
  DOM.chartSelectedYear.innerText = activeChartYear;
  loadDashboardSummary();
});

// Open Awaiting Payments sheet modal
DOM.btnOpenPendingModal.addEventListener('click', () => {
  DOM.pendingTableBody.innerHTML = '';
  
  const list = DOM.pendingShiftsCache || [];
  if (list.length === 0) {
    DOM.pendingTableBody.innerHTML = `<tr><td colspan="3" class="empty-state">All shifts are fully paid!</td></tr>`;
  } else {
    list.forEach(shift => {
      const tr = document.createElement('tr');
      // Format Date Mon, Aug 4, 2025
      const date = new Date(shift.shift_date);
      const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      const formattedDate = date.toLocaleDateString('en-US', options);

      tr.innerHTML = `
        <td>${formattedDate}</td>
        <td>
          <div style="font-weight: 700;">${escapeHTML(shift.project_name)}</div>
          <div style="font-size: 10px; color: var(--text-gray);">${escapeHTML(shift.agency_name || 'Direct Client')}</div>
        </td>
        <td class="text-right" style="font-weight: 700;">£ ${shift.net_earnings.toFixed(2)}</td>
      `;
      DOM.pendingTableBody.appendChild(tr);
    });
  }

  DOM.pendingCountLabel.innerText = `${list.length} shifts awaiting payment`;
  DOM.pendingSumLabel.innerText = `£ ${(DOM.pendingShiftsSum || 0).toFixed(2)}`;
  DOM.modalPendingPayments.classList.add('active');
});


// ==========================================================================
// TAX EXPORTER & FEEDBACK TICKETS
// ==========================================================================

// Initialise tax exporter dates
const currYear = new Date().getFullYear();
DOM.exportStartDate.value = `${currYear}-01-01`;
DOM.exportEndDate.value = `${currYear}-12-31`;

document.getElementById('btn-run-export').addEventListener('click', async () => {
  const start = DOM.exportStartDate.value;
  const end = DOM.exportEndDate.value;

  if (!start || !end) {
    alert('Please choose a valid start and end date range');
    return;
  }

  DOM.exportSpinner.classList.remove('hidden');
  DOM.exportResultBox.classList.add('hidden');

  try {
    const data = await apiCall(`/api/dashboard/tax-summary?start_date=${start}&end_date=${end}`);
    
    // Populate Results
    DOM.expResGross.innerText = `£${data.gross.toFixed(2)}`;
    DOM.expResExp.innerText = `-£${data.expenses.toFixed(2)}`;
    DOM.expResComm.innerText = `-£${data.commission.toFixed(2)}`;
    DOM.expResVat.innerText = `-£${data.vat.toFixed(2)}`;
    DOM.expResNet.innerText = `£${data.netProfit.toFixed(2)}`;

    DOM.exportResultBox.classList.remove('hidden');
  } catch (err) {
    alert(err.message);
  } finally {
    DOM.exportSpinner.classList.add('hidden');
  }
});

// Trigger Export Panel transition from Dashboard Exporter Button
DOM.btnGoExport.addEventListener('click', () => {
  switchView('profile');
  // Scroll to Tax Exporter Card
  DOM.taxExporterSection = document.getElementById('tax-exporter-section');
  if (DOM.taxExporterSection) {
    DOM.taxExporterSection.scrollIntoView({ behavior: 'smooth' });
  }
});

// Submit User Feedback Ticket
DOM.btnSubmitFeedback.addEventListener('click', async () => {
  const subject = DOM.feedbackSubject.value.trim();
  const message = DOM.feedbackMessage.value.trim();

  if (!subject || !message) {
    alert('Please enter a subject and details for your ticket.');
    return;
  }

  try {
    const res = await apiCall('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ subject, message })
    });
    alert(res.message);
    DOM.feedbackSubject.value = '';
    DOM.feedbackMessage.value = '';
  } catch (err) {
    alert(err.message);
  }
});


// ==========================================================================
// ADMINISTRATOR PANEL PORTAL LOGIC
// ==========================================================================

document.getElementById('btn-enter-admin').addEventListener('click', async () => {
  switchView('admin');
  await loadAdminStats();
});

document.getElementById('btn-exit-admin').addEventListener('click', () => {
  switchView('profile');
});

async function loadAdminStats() {
  try {
    const statsData = await apiCall('/api/admin/stats');
    const feedbackData = await apiCall('/api/admin/feedback');

    // Populate counts
    DOM.adminStatTotalUsers.innerText = statsData.stats.totalUsers;
    DOM.adminStatNewUsers.innerText = statsData.stats.newUsersToday;
    DOM.adminStatDau.innerText = statsData.stats.dailyActiveUsers;

    // Render registered users table
    DOM.adminUsersTableBody.innerHTML = '';
    statsData.users.forEach(user => {
      const tr = document.createElement('tr');
      const dateStr = new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      tr.innerHTML = `
        <td style="font-weight: 700;">${escapeHTML(user.email)}</td>
        <td><span class="shift-status-pill ${user.role === 'admin' ? 'paid' : 'booked'}">${escapeHTML(user.role)}</span></td>
        <td>${dateStr}</td>
      `;
      DOM.adminUsersTableBody.appendChild(tr);
    });

    // Render Feedback Tickets list
    DOM.adminFeedbackList.innerHTML = '';
    if (feedbackData.length === 0) {
      DOM.adminFeedbackList.innerHTML = `
        <div class="empty-state">
          <i class="fa-regular fa-circle-check"></i>
          <p>No feedback or complaints submitted yet.</p>
        </div>`;
    } else {
      feedbackData.forEach(ticket => {
        const item = document.createElement('div');
        item.classList.add('feedback-ticket-item');
        const dateStr = new Date(ticket.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        
        item.innerHTML = `
          <div class="ticket-header">
            <span class="ticket-sender">${escapeHTML(ticket.email)}</span>
            <span class="ticket-date">${dateStr}</span>
          </div>
          <div class="ticket-subject">${escapeHTML(ticket.subject)}</div>
          <div class="ticket-body">${escapeHTML(ticket.message)}</div>
        `;
        DOM.adminFeedbackList.appendChild(item);
      });
    }

  } catch (err) {
    alert('Failed to load administrator statistics: ' + err.message);
    switchView('profile');
  }
}


// ==========================================================================
// MODALS ACTIONS & BINDINGS
// ==========================================================================

document.getElementById('btn-open-log-modal').addEventListener('click', () => openShiftModal());
DOM.btnCloseShiftModal.addEventListener('click', () => DOM.modalShiftLog.classList.remove('active'));
DOM.btnClosePendingModal.addEventListener('click', () => DOM.modalPendingPayments.classList.remove('active'));

// Close modal on click outside
window.addEventListener('click', (e) => {
  if (e.target === DOM.modalShiftLog) {
    DOM.modalShiftLog.classList.remove('active');
  }
  if (e.target === DOM.modalPendingPayments) {
    DOM.modalPendingPayments.classList.remove('active');
  }
});


// ==========================================================================
// AUTHENTICATION LOGIN AND SIGNUP DISPATCH
// ==========================================================================

DOM.toggleToSignup.addEventListener('click', () => {
  DOM.formSignin.classList.remove('active');
  DOM.formSignup.classList.add('active');
});

DOM.toggleToSignin.addEventListener('click', () => {
  DOM.formSignup.classList.remove('active');
  DOM.formSignin.classList.add('active');
});

// Sign In submission
document.getElementById('btn-signin').addEventListener('click', async () => {
  const email = DOM.signinEmail.value.trim();
  const password = DOM.signinPass.value;

  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }

  try {
    const data = await apiCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    token = data.token;
    localStorage.setItem('setsum_token', token);
    await checkAuth();
  } catch (err) {
    alert(err.message);
  }
});

// Sign Up submission
document.getElementById('btn-signup').addEventListener('click', async () => {
  const email = DOM.signupEmail.value.trim();
  const password = DOM.signupPass.value;
  const commRate = parseFloat(DOM.signupComm.value) || 20.00;
  const taxStart = DOM.signupTaxStart.value;

  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }

  try {
    const data = await apiCall('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        default_commission_rate: commRate,
        tax_year_start: taxStart
      })
    });

    token = data.token;
    localStorage.setItem('setsum_token', token);
    await checkAuth();
  } catch (err) {
    alert(err.message);
  }
});

DOM.btnLogout.addEventListener('click', logout);

// Bottom bar clicks
DOM.navItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetView = item.getAttribute('data-view');
    switchView(targetView);
  });
});

// Sidebar toggle collapse logic
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const appSidebar = document.querySelector('.app-sidebar');
const toggleIcon = document.getElementById('sidebar-toggle-icon');

if (btnToggleSidebar && appSidebar) {
  btnToggleSidebar.addEventListener('click', () => {
    appSidebar.classList.toggle('collapsed');
    if (appSidebar.classList.contains('collapsed')) {
      if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-right';
      localStorage.setItem('sidebar_collapsed', 'true');
    } else {
      if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-left';
      localStorage.setItem('sidebar_collapsed', 'false');
    }
  });

  // Restore collapsed state on load
  if (localStorage.getItem('sidebar_collapsed') === 'true') {
    appSidebar.classList.add('collapsed');
    if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-right';
  }
}

// Initial load check
checkAuth();

// ==========================================================================
// FLOATING AI ASSISTANT CHAT & VOICE CONTROLLER
// ==========================================================================

(function initAiAssistant() {
  const elements = {
    btnToggle: document.getElementById('btn-toggle-chat'),
    window: document.getElementById('chat-window'),
    btnClose: document.getElementById('btn-close-chat'),
    messages: document.getElementById('chat-messages'),
    typing: document.getElementById('chat-typing-indicator'),
    voiceStatus: document.getElementById('chat-voice-status'),
    voiceText: document.getElementById('voice-status-text'),
    btnMic: document.getElementById('btn-chat-mic'),
    input: document.getElementById('chat-input'),
    btnSend: document.getElementById('btn-chat-send')
  };

  if (!elements.btnToggle) return;

  let isRecording = false;
  let recognition = null;

  // Toggle Chat window
  elements.btnToggle.addEventListener('click', () => {
    const isHidden = elements.window.classList.toggle('hidden');
    if (!isHidden) {
      elements.input.focus();
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }
  });

  elements.btnClose.addEventListener('click', () => {
    elements.window.classList.add('hidden');
  });

  // Append a message to the chat container
  function appendMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', role);
    
    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble');
    bubble.innerText = text;
    
    msgDiv.appendChild(bubble);
    elements.messages.appendChild(msgDiv);
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  // Send message function
  async function sendMessage() {
    const text = elements.input.value.trim();
    if (!text) return;

    appendMessage('user', text);
    elements.input.value = '';

    elements.typing.classList.remove('hidden');
    elements.messages.scrollTop = elements.messages.scrollHeight;

    try {
      const data = await apiCall('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text })
      });

      elements.typing.classList.add('hidden');
      appendMessage('bot', data.reply);

      // Trigger automatic UI refresh if database contents were modified
      if (data.refreshRequired) {
        console.log('[AI Assistant] Database modified. Refreshing UI cache...');
        if (data.targetDate) {
          selectedDate = data.targetDate;
          const targetD = new Date(data.targetDate);
          if (!isNaN(targetD.getTime())) {
            activeCalendarMonth = targetD.getMonth();
            activeCalendarYear = targetD.getFullYear();
          }
        }
        await loadInitialData();
      }
    } catch (err) {
      elements.typing.classList.add('hidden');
      appendMessage('bot', `Sorry, I encountered an error: ${err.message}`);
    }
  }

  // Send bindings
  elements.btnSend.addEventListener('click', sendMessage);
  elements.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  // Web Speech API Voice Recognition setup
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-GB';

    recognition.onstart = () => {
      isRecording = true;
      elements.btnMic.classList.add('recording');
      elements.voiceStatus.classList.remove('hidden');
      elements.voiceText.innerText = "Listening...";
      elements.messages.scrollTop = elements.messages.scrollHeight;
    };

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      elements.input.value = transcript;
      // Auto-submit after voice input
      sendMessage();
    };

    recognition.onerror = (e) => {
      console.error('Speech recognition error:', e.error);
      elements.voiceText.innerText = `Error: ${e.error}`;
      setTimeout(() => {
        elements.voiceStatus.classList.add('hidden');
      }, 2000);
    };

    recognition.onend = () => {
      isRecording = false;
      elements.btnMic.classList.remove('recording');
      elements.voiceStatus.classList.add('hidden');
    };

    elements.btnMic.addEventListener('click', () => {
      if (isRecording) {
        recognition.stop();
      } else {
        recognition.start();
      }
    });
  } else {
    // Hide mic button if browser doesn't support Web Speech API
    elements.btnMic.style.display = 'none';
  }
})();
