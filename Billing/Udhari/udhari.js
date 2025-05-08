const { ipcRenderer } = require("electron");

let customers = [];
let transactions = [];
let deletedEntry = null;
let deletedEntryTimeout = null;
let currentEntry = null;

document.addEventListener("DOMContentLoaded", () => {
  loadTheme();
  loadData();
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
});

// Load customers and transactions
async function loadData() {
  try {
    customers = await ipcRenderer.invoke("udhari:getCustomerSummaries");
    transactions = await ipcRenderer.invoke("udhari:getEntries");
    customers = Array.isArray(customers) ? customers : [];
    transactions = Array.isArray(transactions) ? transactions : [];
    updateSummary();
    applyFilters();
  } catch (error) {
    console.error("Error loading data:", error);
    customers = [];
    transactions = [];
    updateSummary();
    applyFilters();
    showToast(`Error loading data: ${error.message}`, "error");
  }
}

// Update summary section
function updateSummary() {
  const totalDues = transactions
    .filter((t) => t.type === "debt")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalPaid = transactions
    .filter((t) => t.type === "repayment")
    .reduce((sum, t) => sum + t.amount, 0);
  const pendingAmount = customers.reduce((sum, c) => sum + c.total_udhari, 0);

  document.getElementById("totalDues").textContent = `₹${totalDues.toFixed(2)}`;
  document.getElementById("totalPaid").textContent = `₹${totalPaid.toFixed(2)}`;
  document.getElementById("pendingAmount").textContent = `₹${pendingAmount.toFixed(2)}`;
}

// Apply filters and render the customer table
function applyFilters() {
  const searchTerm = document.getElementById("searchInput").value.toLowerCase();
  const dateFilter = document.getElementById("dateFilter").value;
  const statusFilter = document.getElementById("statusFilter").value;

  let filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name.toLowerCase().includes(searchTerm) ||
      customer.mobile_number.includes(searchTerm);
    const hasTransactions = transactions.some(
      (t) => t.customer_id === customer.id
    );
    const matchesDate =
      dateFilter && hasTransactions
        ? transactions.some(
            (t) =>
              t.customer_id === customer.id &&
              t.createdAt.startsWith(dateFilter)
          )
        : true;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "debt" && customer.total_udhari < 0) ||
      (statusFilter === "noDebt" && customer.total_udhari >= 0);
    return matchesSearch && matchesDate && matchesStatus;
  });

  applySort(filteredCustomers);
}

// Apply sorting and render the table
function applySort(filteredCustomers = customers) {
  const sortOption = document.getElementById("sortOption").value;
  let sortedCustomers = [...filteredCustomers];

  switch (sortOption) {
    case "nameAsc":
      sortedCustomers.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "nameDesc":
      sortedCustomers.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "udhariAsc":
      sortedCustomers.sort((a, b) => a.total_udhari - b.total_udhari);
      break;
    case "udhariDesc":
      sortedCustomers.sort((a, b) => b.total_udhari - a.total_udhari);
      break;
  }

  renderTable(sortedCustomers);
}

// Render the customer table
function renderTable(customersToRender) {
  const tbody = document.getElementById("udhariTableBody");
  tbody.innerHTML = "";

  customersToRender.forEach((customer) => {
    const customerRow = document.createElement("tr");
    customerRow.className = "customer-row";
    customerRow.setAttribute("data-bs-toggle", "collapse");
    customerRow.setAttribute("data-bs-target", `#transactions-${customer.id}`);
    customerRow.innerHTML = `
      <td>${customer.name}</td>
      <td>${customer.mobile_number}</td>
      <td>₹${Math.abs(customer.total_udhari).toFixed(2)}</td>
      <td class="actions-cell">
        <button class="action-btn success" onclick='openPaymentModal(${JSON.stringify(customer)})'>
          <i class="fas fa-money-bill-wave"></i> Pay
          <span class="tooltip">Record Payment</span>
        </button>
      </td>
    `;
    tbody.appendChild(customerRow);

    // Transaction sub-table
    const transactionRow = document.createElement("tr");
    transactionRow.className = "collapse";
    transactionRow.id = `transactions-${customer.id}`;
    transactionRow.innerHTML = `
      <td colspan="4">
        <table class="transaction-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Amount (₹)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${transactions
              .filter((t) => t.customer_id === customer.id)
              .map(
                (t) => `
                <tr>
                  <td>${t.createdAt}</td>
                  <td>${
                    t.type === "debt" && t.bill_id
                      ? `<a href="#" onclick='showBillDetails(${t.bill_id})'>Debt</a>`
                      : t.type.charAt(0).toUpperCase() + t.type.slice(1)
                  }</td>
                  <td>₹${Math.abs(t.amount).toFixed(2)}</td>
                  <td class="actions-cell">
                    <button class="action-btn danger" onclick='deleteEntry(${JSON.stringify(t)})'>
                      <i class="fas fa-trash-alt"></i> Delete
                      <span class="tooltip">Delete Entry</span>
                    </button>
                  </td>
                </tr>
              `
              )
              .join("")}
          </tbody>
        </table>
      </td>
    `;
    tbody.appendChild(transactionRow);
  });
}

// Show bill details for a debt transaction
async function showBillDetails(billId) {
  try {
    const billItems = await ipcRenderer.invoke("billing:getBillItems", billId);
    const tbody = document.getElementById("billDetailsTableBody");
    tbody.innerHTML = "";

    if (billItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">No items found for this bill.</td></tr>';
    } else {
      billItems.forEach((item) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${item.name}</td>
          <td>${item.quantity}</td>
          <td>₹${item.price.toFixed(2)}</td>
          <td>₹${item.total.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
      });
    }

    document.getElementById("billDetailsModal").style.display = "flex";
  } catch (error) {
    showToast(`Error loading bill details: ${error.message}`, "error");
  }
}

// Open payment modal for repayment
function openPaymentModal(customer) {
  currentEntry = customer;
  document.getElementById("paymentAmount").value = "";
  document.getElementById("paymentNote").value = "";
  document.getElementById("paymentModal").style.display = "flex";
}

// Submit a repayment
async function submitPayment() {
  const amount = parseFloat(document.getElementById("paymentAmount").value) || 0;
  const note = document.getElementById("paymentNote").value.trim();
  const customer = currentEntry;

  if (amount <= 0) {
    showToast("Please enter a valid payment amount.", "error");
    return;
  }

  if (amount > Math.abs(customer.total_udhari) && customer.total_udhari < 0) {
    showToast("Payment amount cannot exceed remaining debt.", "error");
    return;
  }

  const repayment = {
    customer_id: customer.id,
    amount: amount,
    createdAt: new Date().toISOString(),
    note: note || "Repayment",
  };

  try {
    const result = await ipcRenderer.invoke("udhari:addRepayment", repayment);
    if (result.success) {
      closeModal("paymentModal");
      showToast("Payment recorded successfully!", "success");
      loadData();
    } else {
      showToast(`Error recording payment: ${result.error}`, "error");
    }
  } catch (error) {
    showToast(`Error recording payment: ${error.message}`, "error");
  }
}

// Delete an entry with undo option
async function deleteEntry(entry) {
  deletedEntry = { ...entry };
  transactions = transactions.filter((e) => e.id !== entry.id);

  try {
    const result = await ipcRenderer.invoke("udhari:deleteEntry", entry.id);
    if (result.success) {
      updateSummary();
      applyFilters();
      showToast("Entry deleted successfully!", "success", true);
      deletedEntryTimeout = setTimeout(() => {
        deletedEntry = null;
      }, 5000);
    } else {
      showToast(`Error deleting entry: ${result.error}`, "error");
      loadData();
    }
  } catch (error) {
    showToast(`Error deleting entry: ${error.message}`, "error");
    loadData();
  }
}

// Undo delete action
async function undoDelete() {
  if (!deletedEntry) return;

  clearTimeout(deletedEntryTimeout);
  const entryToRestore = {
    customer_id: deletedEntry.customer_id,
    bill_id: deletedEntry.bill_id,
    amount: deletedEntry.amount,
    type: deletedEntry.type,
    createdAt: deletedEntry.createdAt,
  };

  try {
    const result =
      deletedEntry.type === "repayment"
        ? await ipcRenderer.invoke("udhari:addRepayment", entryToRestore)
        : await ipcRenderer.invoke("udhari:restoreEntry", entryToRestore);
    if (result.success) {
      loadData();
      showToast("Entry restored successfully!", "success");
    } else {
      showToast(`Error restoring entry: ${result.error}`, "error");
      loadData();
    }
  } catch (error) {
    showToast(`Error restoring entry: ${error.message}`, "error");
    loadData();
  }

  deletedEntry = null;
  document.getElementById("toast").style.display = "none";
}

// Export table to CSV
function exportToCSV() {
  if (customers.length === 0) {
    showToast("No data to export.", "error");
    return;
  }

  const headers = ["Customer Name", "Mobile Number", "Total Udhari"];
  const rows = customers.map((customer) => [
    customer.name,
    customer.mobile_number,
    Math.abs(customer.total_udhari).toFixed(2),
  ]);

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += headers.join(",") + "\n";
  rows.forEach((row) => {
    csvContent += row.join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "udhari_customers_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Clear all data
async function clearAllData() {
  if (
    !confirm(
      "Are you sure you want to clear all Udhari data? This action cannot be undone."
    )
  )
    return;

  try {
    const result = await ipcRenderer.invoke("udhari:clearAll");
    if (result.success) {
      customers = [];
      transactions = [];
      updateSummary();
      applyFilters();
      showToast("All data cleared successfully!", "success");
    } else {
      showToast(`Error clearing data: ${result.error}`, "error");
      loadData();
    }
  } catch (error) {
    showToast(`Error clearing data: ${error.message}`, "error");
    loadData();
  }
}

// Close modal
function closeModal(modalId) {
  document.getElementById(modalId).style.display = "none";
}

// Show toast notification
function showToast(message, type, showUndo = false) {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  const undoButton = document.getElementById("undoButton");

  toast.className = `toast ${type}`;
  toastMessage.textContent = message;
  undoButton.style.display = showUndo ? "inline-flex" : "none";
  toast.style.display = "flex";

  setTimeout(() => {
    toast.style.display = "none";
  }, 5000);
}

// Theme toggle functionality
function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  const isDarkMode = document.body.classList.contains("dark-mode");
  localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  const themeIcon = document.getElementById("themeToggle").querySelector("i");
  themeIcon.className = isDarkMode ? "fas fa-sun" : "fas fa-moon";
}

// Load theme from localStorage
function loadTheme() {
  const theme = localStorage.getItem("theme");
  if (theme === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("themeToggle").querySelector("i").className =
      "fas fa-sun";
  }
}