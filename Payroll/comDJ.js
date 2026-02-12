/* com.js (Bayshore Standard aligned) */

/* Global flag for dynamic credit fee addition */
let addCreditFee = false;

/* Global variables to store question answers */
let paymentReceived = "";      // "Yes" | "No" | "BAYSHORE ACCOUNT"
let paymentMethod = "";        // "Debit Card" | "Cash" | "Online" | "Credit Card" | "Check"
let creditCardFeeAnswer = "";  // "Not Added (automatic fee applied)" | "Yes (fee already added)"

/* Assisted sale flag */
let managerialAssistanceUsed = false;

/* Base OE storage (user-editable base) */
let baseOtherExpense = null;

/* ---------- Helpers (Bayshore Standard) ---------- */

function beginEditHours(el) {
  // show raw numeric text while editing
  const n = parseHours(el.value);
  el.value = (Number.isFinite(n) ? n : 0).toString();
}

function beginEditMoney(el) {
  const n = parseMoney(el.value);
  el.value = (Number.isFinite(n) ? n : 0).toString();
}

function show(el) { el.classList.remove("is-hidden"); }
function hide(el) { el.classList.add("is-hidden"); }

function setSelectedAnswer(qNum, answer) {
  document.querySelectorAll(`.qa-btn[data-q="${qNum}"]`).forEach(b => {
    b.classList.toggle("is-selected", b.getAttribute("data-a") === answer);
  });
}

function clearSelectedFrom(qNum) {
  // clears selections for qNum and downstream (safe for up to 4 questions)
  [qNum, qNum + 1, qNum + 2, qNum + 3].forEach(q => {
    document.querySelectorAll(`.qa-btn[data-q="${q}"]`).forEach(b => b.classList.remove("is-selected"));
  });
}

function selectAllOnFocus(el) {
  const selectNow = () => {
    try {
      const len = (el.value || "").length;
      // setSelectionRange is more reliable on iOS than select()
      el.setSelectionRange(0, len);
    } catch (_) {
      try { el.select(); } catch (_) {}
    }
  };

  const selectSoon = () => {
    try {
      // iOS needs a tick AFTER focus is established
      requestAnimationFrame(() => {
        try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch(_){} }
        selectNow();
        // and sometimes one more tick
        setTimeout(selectNow, 0);
      });
    } catch (_) {}
  };

  // Use pointer events first (best for iPad + desktop)
  el.addEventListener("pointerdown", selectSoon);
  el.addEventListener("pointerup", selectSoon);

  // Fallbacks
  el.addEventListener("touchstart", selectSoon, { passive: true });
  el.addEventListener("click", selectSoon);
  el.addEventListener("focus", selectSoon);
}

function setInlineHint(el, msg) {
  const id = `${el.id}-hint`;
  let hint = document.getElementById(id);
  if (!hint) {
    hint = document.createElement("div");
    hint.id = id;
    hint.className = "field-hint";
    el.insertAdjacentElement("afterend", hint);
  }
  hint.textContent = msg || "";
  hint.classList.toggle("is-visible", !!msg);
}

function parseMoney(str) {
  if (str == null) return 0;
  const cleaned = String(str).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function formatMoneyUSD(n) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function parseMoneyField(el) {
  return parseMoney(el.value);
}
function formatMoneyField(el) {
  const n = parseMoneyField(el);
  if (n < 0) {
    el.value = "";
    setInlineHint(el, "No negatives");
    return 0;
  }
  setInlineHint(el, "");
  el.value = formatMoneyUSD(n);
  return n;
}

function parseHours(str) {
  if (str == null) return 0;
  const cleaned = String(str).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function snapHalfHour(n) {
  // nearest 0.5
  return Math.round(n * 2) / 2;
}
function formatHoursDisplay(n) {
  const v = Number.isFinite(n) ? n : 0;
  // show only 0.5 increments; display as "8 hrs" or "8.5 hrs"
  const snapped = snapHalfHour(v);
  const isInt = Math.abs(snapped - Math.round(snapped)) < 1e-9;
  return `${isInt ? Math.round(snapped) : snapped} hrs`;
}
function formatHours(n) {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toFixed(2)} hrs`;
}
function parseHoursField(el) {
  return parseHours(el.value);
}
function formatHoursField(el, { min = null } = {}) {
  let n = parseHours(el.value);

  if (n < 0) {
    el.value = "";
    setInlineHint(el, "No negatives");
    return 0;
  }

  n = snapHalfHour(n);

  if (min != null && n < min) {
    n = min;
    setInlineHint(el, "Min 1 hr");
  } else {
    setInlineHint(el, "");
  }

  el.value = formatHoursDisplay(n);
  return n;
}

function titleCase(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, s => s.toUpperCase());
}

function formatDateLong(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}
function parseFlexibleDate(value) {
  const v = String(value || "").trim();
  if (!v) return null;

  // Try Date constructor first
  const d1 = new Date(v);
  if (!isNaN(d1.getTime())) return d1;

  // Try MM/DD/YYYY
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const mm = parseInt(m[1], 10) - 1;
    const dd = parseInt(m[2], 10);
    let yy = parseInt(m[3], 10);
    if (yy < 100) yy += 2000;
    const d2 = new Date(yy, mm, dd);
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

/* ---------- Dynamic Questions ---------- */

function clearDependentFromQuestion(qNum) {
  // If Q1 changes, clear Q2+Q3 and followups
  if (qNum <= 1) {
    paymentMethod = "";
    creditCardFeeAnswer = "";
    addCreditFee = false;
    const checkEl = document.getElementById("checkNumber");
    if (checkEl) checkEl.value = "";
    const cashEl = document.getElementById("cashAmount");
    if (cashEl) cashEl.value = "$0.00";
    clearSelectedFrom(2);
  }

    // If Q2 changes, clear Q3 + clear followup inputs and hide them
  if (qNum <= 2) {
    creditCardFeeAnswer = "";
    addCreditFee = false;

    const checkEl = document.getElementById("checkNumber");
    if (checkEl) checkEl.value = "";

    const cashEl = document.getElementById("cashAmount");
    if (cashEl) cashEl.value = "$0.00";

    clearSelectedFrom(3);

    // Force-hide followups immediately (prevents “sticky” check/cash UI)
    const qc = document.getElementById("questionCheck");
    const qcash = document.getElementById("questionCash");
    const q3 = document.getElementById("question3");
    if (qc) hide(qc);
    if (qcash) hide(qcash);
    if (q3) hide(q3);
  }
}  

function syncQuestionVisibility() {
  const q1 = document.getElementById("question1");
  const q2 = document.getElementById("question2");
  const q3 = document.getElementById("question3");
  const qc = document.getElementById("questionCheck");
  const qcash = document.getElementById("questionCash");

  // Q1 always visible
  show(q1);

  // If not received or account → hide downstream
  if (paymentReceived !== "Yes") {
    hide(q2); hide(q3);
    if (qc) hide(qc);
    if (qcash) hide(qcash);
    return;
  }

  // Payment received YES: Q2 stays visible always
  show(q2);

  // No method yet
  if (!paymentMethod) {
    hide(q3);
    if (qc) hide(qc);
    if (qcash) hide(qcash);
    return;
  }

  // Reset followups first
  if (qc) hide(qc);
  if (qcash) hide(qcash);

  if (paymentMethod === "Check") {
    if (qc) show(qc);
    hide(q3);
    return;
  }

  if (paymentMethod === "Cash") {
    if (qcash) show(qcash);
    hide(q3);
    return;
  }

  if (paymentMethod === "Credit Card") {
    show(q3);
    return;
  }

  hide(q3);
}

function handleAnswer(answer, questionNumber) {
  if (questionNumber === 1) {
    clearDependentFromQuestion(1);

    if (answer === "yes") {
      paymentReceived = "Yes";
    } else if (answer === "no") {
      paymentReceived = "No";
    } else {
      paymentReceived = "BAYSHORE ACCOUNT";
    }
  }

  if (questionNumber === 2) {
    clearDependentFromQuestion(2);

    if (answer === "creditCard") paymentMethod = "Credit Card";
    else if (answer === "debit") paymentMethod = "Debit Card";
    else if (answer === "cash") paymentMethod = "Cash";
    else if (answer === "online") paymentMethod = "Online";
    else if (answer === "check") paymentMethod = "Check";
  }

  if (questionNumber === 3) {
    if (answer === "no") {
      addCreditFee = true;
      creditCardFeeAnswer = "Not Added (automatic fee applied)";
    } else {
      addCreditFee = false;
      creditCardFeeAnswer = "Yes (fee already added)";
    }
  }

  setSelectedAnswer(questionNumber, answer);
  syncQuestionVisibility();
  calculateCommission();
}

/* ---------- Tips (tap-friendly) ---------- */

function applyTipBubbles() {
  // Create bubbles once
  document.querySelectorAll(".tip-btn").forEach(btn => {
    const text = btn.getAttribute("data-tip") || "";
    const bubble = document.createElement("div");
    bubble.className = "tip-bubble is-hidden";
    bubble.textContent = text;
    btn.dataset.tipId = `tip_${Math.random().toString(36).slice(2)}`;
    bubble.dataset.tipFor = btn.dataset.tipId;
    btn.parentElement.appendChild(bubble);
  });

  // Toggle on button click
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".tip-btn");
    const allBubbles = document.querySelectorAll(".tip-bubble");

    if (btn) {
      e.preventDefault();
      const id = btn.dataset.tipId;
      allBubbles.forEach(b => {
        const isMine = b.dataset.tipFor === id;
        b.classList.toggle("is-hidden", !isMine ? true : !b.classList.contains("is-hidden"));
      });
      return;
    }

    // Click outside => close all
    allBubbles.forEach(b => b.classList.add("is-hidden"));
  }, true);
}

/* ---------- Print state save/restore ---------- */

function saveFormState() {
  const ids = [
    "tn","in","tp","pd","material","ja","oe","date",
    "day1","day2","day3","day4","day5","ah","toh","notes",
    "checkNumber","cashAmount"
  ];
  const data = {};
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value;
  });

  data.__paymentReceived = paymentReceived;
  data.__paymentMethod = paymentMethod;
  data.__creditCardFeeAnswer = creditCardFeeAnswer;
  data.__addCreditFee = addCreditFee;
  data.__managerialAssistanceUsed = managerialAssistanceUsed;
  data.__baseOtherExpense = baseOtherExpense;

  sessionStorage.setItem("com_state_v1", JSON.stringify(data));
}

function restoreFormState() {
  const raw = sessionStorage.getItem("com_state_v1");
  if (!raw) return;

  try {
    const data = JSON.parse(raw);

    Object.keys(data).forEach(k => {
      if (k.startsWith("__")) return;
      const el = document.getElementById(k);
      if (el && typeof data[k] === "string") el.value = data[k];
    });

    paymentReceived = data.__paymentReceived || "";
    paymentMethod = data.__paymentMethod || "";
    creditCardFeeAnswer = data.__creditCardFeeAnswer || "";
    addCreditFee = !!data.__addCreditFee;
    managerialAssistanceUsed = !!data.__managerialAssistanceUsed;
    baseOtherExpense = (data.__baseOtherExpense == null) ? null : Number(data.__baseOtherExpense);

    // Repaint selections
    clearSelectedFrom(1);
    if (paymentReceived === "Yes") setSelectedAnswer(1, "yes");
    else if (paymentReceived === "No") setSelectedAnswer(1, "no");
    else if (paymentReceived === "BAYSHORE ACCOUNT") setSelectedAnswer(1, "account");

    if (paymentMethod === "Debit Card") setSelectedAnswer(2, "debit");
    if (paymentMethod === "Cash") setSelectedAnswer(2, "cash");
    if (paymentMethod === "Online") setSelectedAnswer(2, "online");
    if (paymentMethod === "Credit Card") setSelectedAnswer(2, "creditCard");
    if (paymentMethod === "Check") setSelectedAnswer(2, "check");

    if (paymentMethod === "Credit Card" && creditCardFeeAnswer) {
      setSelectedAnswer(3, addCreditFee ? "no" : "yes");
    }

    // Assisted toggle UI
    const managerialButton = document.getElementById("managerialAssistanceBtn");
    managerialButton.innerText = managerialAssistanceUsed ? "ASSISTED SALE" : "NON-ASSISTED SALE";
    managerialButton.classList.toggle("assisted", managerialAssistanceUsed);
    managerialButton.classList.toggle("non-assisted", !managerialAssistanceUsed);
    document.getElementById("salesCommissionLabel").classList.toggle("is-hidden", !managerialAssistanceUsed);

    syncQuestionVisibility();
    calculateCommission();
  } catch (_) {}
}

/* ---------- Main ---------- */

document.addEventListener("DOMContentLoaded", function () {
  applyTipBubbles();

  // Date standard (text input)
  const dateEl = document.getElementById("date");
  if (dateEl) {
    // Autofill today if empty
    if (!dateEl.value) {
      dateEl.value = formatDateLong(new Date());
    }

    selectAllOnFocus(dateEl);

    dateEl.addEventListener("blur", () => {
      const d = parseFlexibleDate(dateEl.value);
      if (!d) {
        setInlineHint(dateEl, "Invalid date");
        return;
      }
      setInlineHint(dateEl, "");
      dateEl.value = formatDateLong(d);
    });
  }

  // Title Case on blur
  const tnEl = document.getElementById("tn");
  const jaEl = document.getElementById("ja");
  if (tnEl) tnEl.addEventListener("blur", () => tnEl.value = titleCase(tnEl.value));
  if (jaEl) jaEl.addEventListener("blur", () => jaEl.value = titleCase(jaEl.value));
  if (tnEl) selectAllOnFocus(tnEl);
  if (jaEl) selectAllOnFocus(jaEl);

  // Auto-select all editable inputs + format rules
  ["tp","material","oe","cashAmount"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    selectAllOnFocus(el);

    el.addEventListener("focus", () => {
    el.dataset.editing = "true";

    if (id === "oe" && addCreditFee) {
        // edit BASE only
        el.value = String(Number.isFinite(baseOtherExpense) ? baseOtherExpense : 0);
    } else {
        beginEditMoney(el); // <--- strip $ and commas while editing
    }

    // reinforce selection after we changed the value
    try { el.setSelectionRange(0, (el.value || "").length); } catch (_) {}
    });

    el.addEventListener("blur", () => {
      el.dataset.editing = "false";
      const val = formatMoneyField(el);
      if (id === "oe") {
        // Commit BASE on blur (Standard: editing changes Base only)
        baseOtherExpense = val;
      }
      calculateCommission();
    });

    // Don’t reformat on every keystroke. Just recalc.
    el.addEventListener("input", () => calculateCommission());
  });

    // Hours fields (0.5 increments only; pd min 1 hr)
  ["pd","day1","day2","day3","day4","day5","ah","toh"].forEach(id => {
    const el = document.getElementById(id);
        if (!el) return;

        selectAllOnFocus(el);

        el.addEventListener("focus", () => {
            beginEditHours(el);     // <--- strip "hrs" while editing
            selectAllOnFocus(el);   // reinforce selection on iPad
        });

        el.addEventListener("blur", () => {
            if (id === "pd") formatHoursField(el, { min: 1 });
            else formatHoursField(el);
            calculateCommission();
        });

        el.addEventListener("input", () => calculateCommission());
    });

  // Q button system (no inline onclicks)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".qa-btn");
    if (!btn) return;

    const q = parseInt(btn.getAttribute("data-q"), 10);
    const a = btn.getAttribute("data-a");
    if (!q || !a) return;

    handleAnswer(a, q);
  });

  // Assisted / Non-assisted
  const managerialButton = document.getElementById("managerialAssistanceBtn");
  managerialButton.classList.add("non-assisted");
  managerialAssistanceUsed = false;

  managerialButton.addEventListener("click", function (event) {
    event.preventDefault();
    managerialAssistanceUsed = !managerialAssistanceUsed;
    this.innerText = managerialAssistanceUsed ? "ASSISTED SALE" : "NON-ASSISTED SALE";
    managerialButton.classList.toggle("assisted", managerialAssistanceUsed);
    managerialButton.classList.toggle("non-assisted", !managerialAssistanceUsed);
    document.getElementById("salesCommissionLabel").classList.toggle("is-hidden", !managerialAssistanceUsed);
    calculateCommission();
  });

  // Calculate button
  document.getElementById("calculateBtn").addEventListener("click", calculateCommission);

      // Print (same-tab; avoids popup blockers) — FIXED STRUCTURE
  const printButton = document.getElementById("printButton");
  const printSheet = document.getElementById("printSheet");

  let __isPrinting = false;
  let __printFallbackTimer = null;

  function clearPrintScaleClasses() {
    document.body.classList.remove(
      "print-scale-100",
      "print-scale-97",
      "print-scale-95",
      "print-scale-93",
      "print-scale-90",
      "print-scale-88",
      "print-scale-85"
    );
  }

  function restoreAfterPrint() {
    if (!__isPrinting) return;
    __isPrinting = false;

    try { clearTimeout(__printFallbackTimer); } catch (_) {}
    __printFallbackTimer = null;

    document.body.classList.remove("is-printing");
    clearPrintScaleClasses();

    // Restore the APP header after printing
    const appTopBar = document.querySelector("body > .top-bar");
    if (appTopBar) appTopBar.classList.remove("is-hidden");

    if (printSheet) {
      printSheet.classList.add("is-hidden");
      printSheet.setAttribute("aria-hidden", "true");

      // IMPORTANT (iPad Safari): do NOT clear innerHTML here
      // printSheet.innerHTML = "";
    }
  }

  function applyPrintScale() {
    clearPrintScaleClasses();

    const root = document.getElementById("printRoot");
    if (!root) {
      document.body.classList.add("print-scale-100");
      return;
    }

    // A4 printable height estimate (portrait)
    const maxHeightPx = 1026;

    const scales = [
      ["print-scale-100", 1.0],
      ["print-scale-97", 0.97],
      ["print-scale-95", 0.95],
      ["print-scale-93", 0.93],
      ["print-scale-90", 0.90],
      ["print-scale-88", 0.88],
      ["print-scale-85", 0.85],
    ];

    const rawHeight = Math.ceil(root.getBoundingClientRect().height);

    for (const [cls, scale] of scales) {
      if (Math.ceil(rawHeight * scale) <= maxHeightPx) {
        document.body.classList.add(cls);
        return;
      }
    }

    document.body.classList.add("print-scale-85");
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function buildPrintSheetHTML() {
    const technicianName = document.getElementById("tn").value;
    const jobAddress = document.getElementById("ja").value;
    const invoiceNumber = document.getElementById("in").value;
    const date = document.getElementById("date").value;

    const projectHours = document.getElementById("pd").value;
    const materialExpenses = document.getElementById("material").value;
    const oe = document.getElementById("oe").value;
    const totalPrice = document.getElementById("tp").value;
    const notes = document.getElementById("notes").value;

    const day1 = document.getElementById("day1").value;
    const day2 = document.getElementById("day2").value;
    const day3 = document.getElementById("day3").value;
    const day4 = document.getElementById("day4").value;
    const day5 = document.getElementById("day5").value;
    const additionalHours = document.getElementById("ah").value;
    const overtimeHours = document.getElementById("toh").value;
    const totalHours = document.getElementById("totalHours").value;

    const sw = document.getElementById("sw").value;
    const wh = document.getElementById("wh").value;
    const rd = document.getElementById("rd").value;
    const bpp = document.getElementById("bpp").value;

    const totalCommission = document.getElementById("totalCommission").textContent;

    const salesCommissionRow = managerialAssistanceUsed
      ? `<tr><th>Sales Commission:</th><td>${escapeHtml(document.getElementById("salesCommission").textContent)}</td></tr>`
      : "";

    let additionalRow = "";

    if (paymentReceived === "No" || paymentReceived === "BAYSHORE ACCOUNT") {
      additionalRow = `<tr><th>Payment Received:</th><td>${escapeHtml(paymentReceived)}</td></tr>`;
    } else if (paymentMethod === "Check") {
      const checkNumber = document.getElementById("checkNumber").value || "N/A";
      additionalRow =
        `<tr><th>Payment Received:</th><td>${escapeHtml(paymentReceived || "N/A")}</td></tr>
         <tr><th>Payment Method:</th><td>${escapeHtml(paymentMethod || "N/A")}</td></tr>
         <tr><th>Check Number:</th><td>${escapeHtml(checkNumber)}</td></tr>`;
    } else if (paymentMethod === "Cash") {
      const cashAmount = document.getElementById("cashAmount").value || "N/A";
      additionalRow =
        `<tr><th>Payment Received:</th><td>${escapeHtml(paymentReceived || "N/A")}</td></tr>
         <tr><th>Payment Method:</th><td>${escapeHtml(paymentMethod || "N/A")}</td></tr>
         <tr><th>Cash Amount:</th><td>${escapeHtml(cashAmount)}</td></tr>`;
    } else if (paymentMethod === "Credit Card") {
      additionalRow =
        `<tr><th>Payment Received:</th><td>${escapeHtml(paymentReceived || "N/A")}</td></tr>
         <tr><th>Payment Method:</th><td>${escapeHtml(paymentMethod || "N/A")}</td></tr>
         <tr><th>Credit Card Fee Added:</th><td>${escapeHtml(creditCardFeeAnswer || "N/A")}</td></tr>`;
    } else {
      additionalRow =
        `<tr><th>Payment Received:</th><td>${escapeHtml(paymentReceived || "N/A")}</td></tr>
         <tr><th>Payment Method:</th><td>${escapeHtml(paymentMethod || "N/A")}</td></tr>`;
    }

    return `
      <div id="printRoot">
        <div class="top-bar">
          <div class="logo-container">
            <img src="BP.png" alt="BP logo" class="logo">
          </div>
          <h1 class="header-title">TECHNICIAN COMMISSION DOCUMENT</h1>
        </div>

        <div class="container">
          <div class="no-break details-section">
            <h3>DETAILS:</h3>
            <table class="input-data">
              <tr><th>Technician's Name:</th><td>${escapeHtml(technicianName)}</td></tr>
              <tr><th>Job Address:</th><td>${escapeHtml(jobAddress)}</td></tr>
              <tr><th>Invoice Number:</th><td>${escapeHtml(invoiceNumber)}</td></tr>
              <tr><th>Date:</th><td>${escapeHtml(date)}</td></tr>
              <tr><th>Project Hours:</th><td>${escapeHtml(projectHours)}</td></tr>
              <tr><th>Material Expenses:</th><td>${escapeHtml(materialExpenses)}</td></tr>
              <tr><th>Other Expenses (Total):</th><td>${escapeHtml(oe)}</td></tr>
              <tr><th>Total Price:</th><td>${escapeHtml(totalPrice)}</td></tr>
              <tr><th>Job Description/Notes:</th><td>${escapeHtml(notes)}</td></tr>
            </table>
          </div>

          <div class="no-break">
            <h3>QUESTIONS &amp; ANSWERS:</h3>
            <table class="input-data">
              ${additionalRow}
            </table>
          </div>

          <div class="no-break">
            <h3>LABOR DETAILS:</h3>
            <table class="input-data">
              <tr><th>Day 1</th><th>Day 2</th><th>Day 3</th><th>Day 4</th></tr>
              <tr>
                <td>${escapeHtml(day1)}</td><td>${escapeHtml(day2)}</td><td>${escapeHtml(day3)}</td><td>${escapeHtml(day4)}</td>
              </tr>
            </table>

            <table class="input-data">
              <tr><th>Day 5</th><th>Additional Hours</th><th>Total Overtime Hours</th><th>Total Hours</th></tr>
              <tr>
                <td>${escapeHtml(day5)}</td><td>${escapeHtml(additionalHours)}</td><td>${escapeHtml(overtimeHours)}</td><td>${escapeHtml(totalHours)}</td>
              </tr>
            </table>
          </div>

          <div class="no-break">
            <h3>FOR OFFICE USE ONLY:</h3>
            <table class="input-data">
              <tr><th>SW21/RP21</th><th>WH32</th><th>RD15/UL15</th><th>BPP%</th></tr>
              <tr>
                <td>${escapeHtml(sw)}</td><td>${escapeHtml(wh)}</td><td>${escapeHtml(rd)}</td><td>${escapeHtml(bpp)}</td>
              </tr>
            </table>
          </div>

          <div class="no-break commission-details-section">
            <h3>COMMISSION DETAILS:</h3>
            <table class="input-data">
              <tr><th>Technician Commission:</th><td>${escapeHtml(totalCommission)}</td></tr>
              ${salesCommissionRow}
            </table>
          </div>
        </div>
      </div>
    `;
  }

    // Register print-exit listener ONCE
  window.addEventListener("afterprint", () => {
    setTimeout(restoreAfterPrint, 250);
  });

    printButton.addEventListener("click", function (event) {
    event.preventDefault();

    const msg =
      "I hereby confirm that all contents of this report are true and correct. I take full responsibility of the contents of this documents.";

    const ok = window.confirm(msg);
    if (!ok) return;

    saveFormState();

    printSheet.innerHTML = buildPrintSheetHTML();

    // Switch to print mode (same tab)
    document.body.classList.add("is-printing");

    // Hide the APP header (top bar) so we only print the printRoot header
    const appTopBar = document.querySelector("body > .top-bar");
    if (appTopBar) appTopBar.classList.add("is-hidden");

    printSheet.classList.remove("is-hidden");
    printSheet.setAttribute("aria-hidden", "false");

        __isPrinting = true;

    try {
      applyPrintScale();
      window.print();
    } catch (_) {
      restoreAfterPrint();
      return;
    }

    // Long fallback (does NOT kill preview during iOS re-render)
    __printFallbackTimer = setTimeout(() => {
      if (document.body.classList.contains("is-printing")) {
        restoreAfterPrint();
      }
    }, 120000); // 2 minutes
  });
});


/* ---------- Commission math (UNCHANGED logic, only input parsing/display fixes) ---------- */

function calculateCommission() {
  const tp = parseMoneyField(document.getElementById("tp"));
  const material = parseMoneyField(document.getElementById("material"));

  const oeEl = document.getElementById("oe");

  // OE Standard: show TOTAL, edit BASE only
  const oeIsEditing = oeEl.dataset.editing === "true";
  const oeTyped = parseMoneyField(oeEl);

  if (baseOtherExpense === null || !Number.isFinite(baseOtherExpense)) {
    baseOtherExpense = oeTyped;
  }

  const baseForCalc = oeIsEditing ? oeTyped : baseOtherExpense;

  const creditCardFee = addCreditFee ? (0.03 * tp) : 0;
  const totalOE = baseForCalc + creditCardFee;

  if (!oeIsEditing) {
    oeEl.value = formatMoneyUSD(addCreditFee ? totalOE : baseOtherExpense);
  }

  const day1 = parseHoursField(document.getElementById("day1"));
  const day2 = parseHoursField(document.getElementById("day2"));
  const day3 = parseHoursField(document.getElementById("day3"));
  const day4 = parseHoursField(document.getElementById("day4"));
  const day5 = parseHoursField(document.getElementById("day5"));
  const ah = parseHoursField(document.getElementById("ah"));
  const toh = parseHoursField(document.getElementById("toh"));
  const pdEl = document.getElementById("pd");
        let pd = snapHalfHour(parseHoursField(pdEl));
        if (pd < 1) pd = 1;

        // keep display consistent even if user never blurred
        if (pdEl && document.activeElement !== pdEl) {
        pdEl.value = formatHoursDisplay(pd);
    }

    // Total hours must respect 0.5 increments (even after overtime multiplier)
  const totalHoursRaw = day1 + day2 + day3 + day4 + day5 + ah + (1.5 * toh);
  const totalHours = snapHalfHour(totalHoursRaw);

  document.getElementById("totalHours").value = formatHoursDisplay(totalHours);

  const grossAmount = tp - (material * 1.2) - (totalHours * 95) - totalOE;
  const overheads = pd * 290;

  let profitPercentage = 0;
  if (tp !== 0) {
    profitPercentage = ((grossAmount - overheads) / tp) * 100;
  }

  let baseCommission = 0;

  /*
    REQUIREMENTS ORDER (STRICT):
    1) If profitPercentage <= 10 → commission = 60 * pd  (OVERRIDES ALL OTHER RULES)
    2) Else if tp <= 539 → commission = 60 (flat, irrespective of pd)
    3) Else if pd = 1:
       tempProfitPercentage = ((grossAmount - overheads - 60) / tp) * 100
       If tempProfitPercentage > 40 → commission = 96 * pd
       Else → commission = 60 * pd
    4) Else if pd > 1:
       Tier rules by profitPercentage, and ALWAYS apply max(percentCommission, pdCommission)
  */
  if (profitPercentage <= 10) {
    baseCommission = 60 * pd;

  } else if (tp <= 539) {
    baseCommission = 60;

  } else if (pd === 1) {
    const tempProfitPercentage = (tp !== 0)
      ? ((grossAmount - overheads - 60) / tp) * 100
      : 0;

    baseCommission = (tempProfitPercentage > 40) ? (96 * pd) : (60 * pd);

  } else if (pd > 1) {
    baseCommission = computeBaseCommissionByProfit(profitPercentage, grossAmount, pd);
  }

  let technicianCommission;
  const salesCommission = managerialAssistanceUsed ? (0.02 * tp) : 0;

  if (managerialAssistanceUsed) {
    technicianCommission = baseCommission - salesCommission;
    document.getElementById("salesCommission").textContent = formatMoneyUSD(salesCommission);
  } else {
    technicianCommission = baseCommission;
    document.getElementById("salesCommission").textContent = "";
  }

  /* HARD FLOOR: commission can never be below $60 */
  if (technicianCommission < 60) technicianCommission = 0;

  document.getElementById("totalCommission").textContent = formatMoneyUSD(technicianCommission);

  // BPP%: net after commission
  const finalProfit = grossAmount - overheads - baseCommission;
  const finalProfitPercentage = tp !== 0 ? (finalProfit / tp) * 100 : 0;

  let bppValue = "";
  if (finalProfitPercentage < 10) bppValue = "👎: JOB BUST. PLEASE SEE GM";
  else if (finalProfitPercentage <= 19.99) bppValue = "😬: MARGINAL PROFIT";
  else if (finalProfitPercentage <= 29.99) bppValue = "👍: GOOD WORK";
  else if (finalProfitPercentage <= 39.99) bppValue = "😀: NICE WORK";
  else if (finalProfitPercentage <= 59.99) bppValue = "⭐: GREAT WORK";
  else bppValue = "🌟: EXCELLENT WORK";

  document.getElementById("bpp").value = bppValue;

  const sw = ((material * 1.2) / tp) * 100 || 0;
  document.getElementById("sw").value = sw.toFixed(2);
  document.getElementById("wh").value = sw.toFixed(2);
  document.getElementById("rd").value = sw.toFixed(2);
}

function computeBaseCommissionByProfit(profitPercentage, grossAmount, pd) {
  const pdCommission = 60 * pd;

  let percentCommission = 0;

  if (profitPercentage >= 25) percentCommission = 0.2119 * grossAmount;
  else if (profitPercentage >= 20) percentCommission = 0.20 * grossAmount;
  else if (profitPercentage >= 15) percentCommission = 0.175 * grossAmount;
  else if (profitPercentage > 10) percentCommission = 0.15 * grossAmount;
  else percentCommission = 0;

  return Math.max(percentCommission, pdCommission);
}