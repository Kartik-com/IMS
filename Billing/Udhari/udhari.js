const { ipcRenderer } = require("electron");

let entries = [];
let deletedEntry = null;
let deletedEntryTimeout = null;

document.addEventListener("DOMContentLoaded", () => {
  loadTheme();
  loadUdhariEntries();
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
});

// Load Udhari entries from the database
async function loadUdhariEntries() {
  try {
    // Reset entries to ensure no stale data
    entries = [];
    console.log("Fetching Udhari entries from backend...");
    const fetchedEntries = await ipcRenderer.invoke("udhari:getEntries");
    console.log("Fetched entries:", fetchedEntries);

    // Ensure fetchedEntries is an array
    entries = Array.isArray(fetchedEntries) ? fetchedEntries : [];
    if (entries.length === 0) {
      console.log(
        "No Udhari entries found in backend. Setting summary to zero."
      );
    }

    updateSummary();
    applyFilters();
  } catch (error) {
    console.error("Error loading Udhari entries:", error);
    // Ensure entries is empty on error to avoid stale data
    entries = [];
    updateSummary(); // Update summary even on error to reflect empty state
    applyFilters();
    showToast(`Error loading Udhari entries: ${error.message}`, "error");
  }
}

// Update summary section
function updateSummary() {
  console.log("Updating summary with entries:", entries);
  const totalDues = entries.reduce((sum, entry) => sum + entry.total_amount, 0);
  const totalPaid = entries.reduce((sum, entry) => sum + entry.paid_amount, 0);
  const pendingAmount = entries.reduce(
    (sum, entry) => sum + entry.remaining_amount,
    0
  );

  console.log(
    `Calculated - Total Dues: ₹${totalDues.toFixed(
      2
    )}, Total Paid: ₹${totalPaid.toFixed(
      2
    )}, Pending Amount: ₹${pendingAmount.toFixed(2)}`
  );

  document.getElementById("totalDues").textContent = `₹${totalDues.toFixed(2)}`;
  document.getElementById("totalPaid").textContent = `₹${totalPaid.toFixed(2)}`;
  document.getElementById(
    "pendingAmount"
  ).textContent = `₹${pendingAmount.toFixed(2)}`;
}

// Apply filters and render the table
function applyFilters() {
  const searchTerm = document.getElementById("searchInput").value.toLowerCase();
  const dateFilter = document.getElementById("dateFilter").value;
  const statusFilter = document.getElementById("statusFilter").value;

  let filteredEntries = entries.filter((entry) => {
    const matchesSearch = entry.customer_name
      .toLowerCase()
      .includes(searchTerm);
    const matchesDate = dateFilter ? entry.date === dateFilter : true;
    const matchesStatus =
      statusFilter === "all" ||
      entry.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesDate && matchesStatus;
  });

  applySort(filteredEntries);
}

// Apply sorting and render the table
function applySort(filteredEntries = entries) {
  const sortOption = document.getElementById("sortOption").value;
  let sortedEntries = [...filteredEntries];

  switch (sortOption) {
    case "totalAsc":
      sortedEntries.sort((a, b) => a.total_amount - b.total_amount);
      break;
    case "totalDesc":
      sortedEntries.sort((a, b) => b.total_amount - a.total_amount);
      break;
    case "remainingAsc":
      sortedEntries.sort((a, b) => a.remaining_amount - b.remaining_amount);
      break;
    case "remainingDesc":
      sortedEntries.sort((a, b) => b.remaining_amount - a.remaining_amount);
      break;
    case "dateAsc":
      sortedEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
      break;
    case "dateDesc":
      sortedEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
    case "nameAsc":
      sortedEntries.sort((a, b) =>
        a.customer_name.localeCompare(b.customer_name)
      );
      break;
    case "nameDesc":
      sortedEntries.sort((a, b) =>
        b.customer_name.localeCompare(a.customer_name)
      );
      break;
    case "statusAsc":
      sortedEntries.sort((a, b) => a.status.localeCompare(b.status));
      break;
    case "statusDesc":
      sortedEntries.sort((a, b) => b.status.localeCompare(a.status));
      break;
  }

  renderTable(sortedEntries);
}

// Render the Udhari table
function renderTable(entriesToRender) {
  const tbody = document.getElementById("udhariTableBody");
  tbody.innerHTML = "";

  entriesToRender.forEach((entry) => {
    const row = document.createElement("tr");
    if (entry.status.toLowerCase() === "settled") {
      row.classList.add("settled-row");
    }
    row.innerHTML = `
      <td>${entry.customer_name}</td>
      <td>₹${entry.total_amount.toFixed(2)}</td>
      <td>₹${entry.paid_amount.toFixed(2)}</td>
      <td>₹${entry.remaining_amount.toFixed(2)}</td>
      <td>${entry.date}</td>
      <td>
        <button class="action-btn secondary" onclick='viewHistory(${JSON.stringify(
          entry
        )})'>
          <i class="fas fa-history"></i> View
          <span class="tooltip">View Transaction History</span>
        </button>
      </td>
      <td class="status-${entry.status.toLowerCase()}">${entry.status}</td>
      <td class="actions-cell">
        <button class="action-btn success" onclick='openPaymentModal(${JSON.stringify(
          entry
        )})'>
          <i class="fas fa-money-bill-wave"></i> Pay
          <span class="tooltip">Record Payment</span>
        </button>
        <button class="action-btn warning" onclick='settleEntry(${JSON.stringify(
          entry
        )})'>
          <i class="fas fa-check-circle"></i> Settle
          <span class="tooltip">Mark as Settled</span>
        </button>
        <button class="action-btn danger" onclick='deleteEntry(${JSON.stringify(
          entry
        )})'>
          <i class="fas fa-trash-alt"></i> Delete
          <span class="tooltip">Delete Entry</span>
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Open payment modal for partial payment
function openPaymentModal(entry) {
  currentEntry = entry;
  document.getElementById("paymentAmount").value = "";
  document.getElementById("paymentNote").value = "";
  document.getElementById("paymentModal").style.display = "flex";
}

// Submit a partial payment
function submitPayment() {
  const amount =
    parseFloat(document.getElementById("paymentAmount").value) || 0;
  const note = document.getElementById("paymentNote").value.trim();
  const entry = currentEntry;

  if (amount <= 0) {
    showToast("Please enter a valid payment amount.", "error");
    return;
  }

  if (amount > entry.remaining_amount) {
    showToast("Payment amount cannot exceed remaining amount.", "error");
    return;
  }

  const transaction = {
    date: new Date().toISOString().split("T")[0],
    amount: amount,
    note: note || "No note",
  };

  entry.transactions.push(transaction);
  entry.paid_amount += amount;
  entry.remaining_amount = entry.total_amount - entry.paid_amount;
  entry.status =
    entry.remaining_amount <= 0
      ? "Paid"
      : entry.paid_amount > 0
      ? "Partial"
      : "Pending";

  updateEntry(entry);
  closeModal("paymentModal");
  showToast("Payment recorded successfully!", "success");
}

// View transaction history
function viewHistory(entry) {
  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";
  entry.transactions.forEach((tx) => {
    const li = document.createElement("li");
    li.textContent = `${tx.date}: ₹${tx.amount.toFixed(2)} (${tx.note})`;
    historyList.appendChild(li);
  });
  document.getElementById("historyModal").style.display = "flex";
}

// Mark entry as settled
function settleEntry(entry) {
  if (
    confirm(
      `Are you sure you want to mark ${entry.customer_name}'s entry as settled?`
    )
  ) {
    entry.status = "Settled";
    updateEntry(entry);
    showToast("Entry marked as settled!", "success");
  }
}

// Delete an entry with undo option
function deleteEntry(entry) {
  deletedEntry = { ...entry };
  entries = entries.filter((e) => e.id !== entry.id);

  ipcRenderer
    .invoke("udhari:deleteEntry", entry.id)
    .then((result) => {
      if (result.success) {
        updateSummary();
        applyFilters();
        showToast("Entry deleted successfully!", "success", true);
        deletedEntryTimeout = setTimeout(() => {
          deletedEntry = null;
        }, 5000);
      } else {
        showToast("Error deleting entry: " + result.error, "error");
        loadUdhariEntries();
      }
    })
    .catch((error) => {
      showToast("Error deleting entry: " + error.message, "error");
      loadUdhariEntries();
    });
}

// Undo delete action
function undoDelete() {
  if (!deletedEntry) return;

  clearTimeout(deletedEntryTimeout);
  entries.push(deletedEntry);

  const entryToRestore = { ...deletedEntry };
  delete entryToRestore.id; // Remove ID to create a new entry
  ipcRenderer
    .invoke("udhari:addEntry", entryToRestore)
    .then((result) => {
      if (result.success) {
        loadUdhariEntries();
        showToast("Entry restored successfully!", "success");
      } else {
        showToast("Error restoring entry: " + result.error, "error");
        loadUdhariEntries();
      }
    })
    .catch((error) => {
      showToast("Error restoring entry: " + error.message, "error");
      loadUdhariEntries();
    });

  deletedEntry = null;
  document.getElementById("toast").style.display = "none";
}

// Update an entry in the database
function updateEntry(entry) {
  ipcRenderer
    .invoke("udhari:updateEntry", entry)
    .then((result) => {
      if (result.success) {
        loadUdhariEntries();
      } else {
        showToast("Error updating entry: " + result.error, "error");
        loadUdhariEntries();
      }
    })
    .catch((error) => {
      showToast("Error updating entry: " + error.message, "error");
      loadUdhariEntries();
    });
}

// Export table to CSV
function exportToCSV() {
  if (entries.length === 0) {
    showToast("No data to export.", "error");
    return;
  }

  const headers = [
    "Customer Name",
    "Total Amount",
    "Paid Amount",
    "Remaining Amount",
    "Date",
    "Status",
  ];
  const rows = entries.map((entry) => [
    entry.customer_name,
    entry.total_amount.toFixed(2),
    entry.paid_amount.toFixed(2),
    entry.remaining_amount.toFixed(2),
    entry.date,
    entry.status,
  ]);

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += headers.join(",") + "\n";
  rows.forEach((row) => {
    csvContent += row.join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "udhari_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Clear all data
function clearAllData() {
  if (
    !confirm(
      "Are you sure you want to clear all Udhari data? This action cannot be undone."
    )
  )
    return;

  ipcRenderer
    .invoke("udhari:clearAll")
    .then((result) => {
      if (result.success) {
        entries = [];
        updateSummary();
        applyFilters();
        showToast("All data cleared successfully!", "success");
      } else {
        showToast("Error clearing data: " + result.error, "error");
        loadUdhariEntries();
      }
    })
    .catch((error) => {
      showToast("Error clearing data: " + error.message, "error");
      loadUdhariEntries();
    });
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
