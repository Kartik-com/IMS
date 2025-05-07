// Initialize udhari data from localStorage
let udhariList = JSON.parse(localStorage.getItem("udhariList")) || [];
let currentUdhariId = null;
let lastDeletedEntry = null;

// Pre-populate with sample data if empty (simulating billing page input)
if (udhariList.length === 0) {
  udhariList = [
    {
      id: Date.now() - 1000,
      customerName: "Amit Sharma",
      totalAmount: 5000,
      paidAmount: 2000,
      remainingAmount: 3000,
      date: "2025-05-01",
      status: "Partial",
      transactions: [
        {
          amount: 2000,
          date: "2025-05-02",
          time: "14:30:00",
          note: "Paid via cash",
        },
      ],
    },
    {
      id: Date.now() - 2000,
      customerName: "Priya Singh",
      totalAmount: 3000,
      paidAmount: 0,
      remainingAmount: 3000,
      date: "2025-04-28",
      status: "Pending",
      transactions: [],
    },
    {
      id: Date.now() - 3000,
      customerName: "Rahul Verma",
      totalAmount: 10000,
      paidAmount: 10000,
      remainingAmount: 0,
      date: "2025-04-25",
      status: "Paid",
      transactions: [
        {
          amount: 5000,
          date: "2025-04-26",
          time: "10:15:00",
          note: "Paid via UPI",
        },
        {
          amount: 5000,
          date: "2025-04-27",
          time: "11:00:00",
          note: "Final payment",
        },
      ],
    },
  ];
  localStorage.setItem("udhariList", JSON.stringify(udhariList));
}

// Migrate old data to new format
udhariList = udhariList.map((item) => {
  if (!item.hasOwnProperty("totalAmount")) {
    return {
      id: item.id || Date.now(),
      customerName: item.customerName || "Unknown",
      totalAmount: item.amount || 0,
      paidAmount: 0,
      remainingAmount: item.amount || 0,
      date: item.date || new Date().toISOString().split("T")[0],
      status: item.status || "Pending",
      transactions: [],
    };
  }
  if (!item.hasOwnProperty("transactions")) {
    return { ...item, transactions: [] };
  }
  return item;
});

// Save migrated data back to localStorage
localStorage.setItem("udhariList", JSON.stringify(udhariList));

// Set today's date as default in the date filter
document.getElementById("dateFilter").value = new Date()
  .toISOString()
  .split("T")[0];

// Load theme from localStorage
const savedTheme = localStorage.getItem("theme") || "light";
if (savedTheme === "dark") {
  document.body.classList.add("dark-mode");
  document.getElementById("themeToggle").innerHTML =
    '<i class="fas fa-sun"></i> Toggle Theme';
}

// Function to toggle dark mode
function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  const theme = document.body.classList.contains("dark-mode")
    ? "dark"
    : "light";
  localStorage.setItem("theme", theme);
  const themeToggle = document.getElementById("themeToggle");
  themeToggle.innerHTML =
    theme === "dark"
      ? '<i class="fas fa-sun"></i> Toggle Theme'
      : '<i class="fas fa-moon"></i> Toggle Theme';
}

// Function to show toast notification
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  const undoButton = document.getElementById("undoButton");

  toastMessage.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = "flex";
  if (type !== "success" || !undoButton.onclick) {
    undoButton.style.display = "none";
  } else {
    undoButton.style.display = "inline-block";
  }
  setTimeout(() => {
    toast.style.display = "none";
    if (type === "success") {
      lastDeletedEntry = null;
    }
  }, 5000);
}

// Function to update summary stats
function updateSummary() {
  const totalDues = udhariList.reduce((sum, item) => sum + item.totalAmount, 0);
  const totalPaid = udhariList.reduce((sum, item) => sum + item.paidAmount, 0);
  const pendingAmount = udhariList.reduce(
    (sum, item) => sum + item.remainingAmount,
    0
  );

  document.getElementById("totalDues").textContent = `₹${totalDues.toFixed(2)}`;
  document.getElementById("totalPaid").textContent = `₹${totalPaid.toFixed(2)}`;
  document.getElementById(
    "pendingAmount"
  ).textContent = `₹${pendingAmount.toFixed(2)}`;
}

// Function to save udhari data to localStorage
function saveUdhari() {
  localStorage.setItem("udhariList", JSON.stringify(udhariList));
  applyFilters();
  updateSummary();
}

// Function to sort the udhari list
function sortUdhariList(list, sortOption) {
  const sortedList = [...list];
  switch (sortOption) {
    case "totalAsc":
      sortedList.sort((a, b) => a.totalAmount - b.totalAmount);
      break;
    case "totalDesc":
      sortedList.sort((a, b) => b.totalAmount - a.totalAmount);
      break;
    case "remainingAsc":
      sortedList.sort((a, b) => a.remainingAmount - b.remainingAmount);
      break;
    case "remainingDesc":
      sortedList.sort((a, b) => b.remainingAmount - a.remainingAmount);
      break;
    case "dateAsc":
      sortedList.sort((a, b) => new Date(a.date) - new Date(b.date));
      break;
    case "dateDesc":
      sortedList.sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
    case "nameAsc":
      sortedList.sort((a, b) => a.customerName.localeCompare(b.customerName));
      break;
    case "nameDesc":
      sortedList.sort((a, b) => b.customerName.localeCompare(a.customerName));
      break;
    case "statusAsc":
      sortedList.sort((a, b) => a.status.localeCompare(b.status));
      break;
    case "statusDesc":
      sortedList.sort((a, b) => b.status.localeCompare(a.status));
      break;
    default:
      break;
  }
  return sortedList;
}

// Function to apply sorting
function applySort() {
  applyFilters(); // Re-apply filters and sort
}

// Function to open the payment modal
function openPaymentModal(id) {
  currentUdhariId = id;
  const modal = document.getElementById("paymentModal");
  const paymentInput = document.getElementById("paymentAmount");
  paymentInput.value = "";
  document.getElementById("paymentNote").value = "";
  modal.style.display = "flex";
  paymentInput.focus();
}

// Function to close a modal
function closeModal(modalId) {
  document.getElementById(modalId).style.display = "none";
  if (modalId === "paymentModal") {
    currentUdhariId = null;
  }
}

// Function to submit a partial payment
function submitPayment() {
  const paymentAmount = parseFloat(
    document.getElementById("paymentAmount").value
  );
  const paymentNote = document.getElementById("paymentNote").value.trim();
  const udhari = udhariList.find((item) => item.id === currentUdhariId);

  if (!paymentAmount || paymentAmount <= 0) {
    showToast("Please enter a valid payment amount.", "error");
    return;
  }

  if (paymentAmount > udhari.remainingAmount) {
    showToast("Payment amount cannot exceed the remaining balance.", "error");
    return;
  }

  // Add transaction to history
  udhari.transactions.push({
    amount: paymentAmount,
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString("en-IN"),
    note: paymentNote || "No note",
  });

  udhari.paidAmount += paymentAmount;
  udhari.remainingAmount = udhari.totalAmount - udhari.paidAmount;
  udhari.status = udhari.remainingAmount === 0 ? "Paid" : "Partial";

  saveUdhari();
  closeModal("paymentModal");
  showToast(
    `Payment of ₹${paymentAmount.toFixed(2)} recorded for ${
      udhari.customerName
    }.`,
    "success"
  );
}

// Function to mark an entry as settled
function markAsSettled(id) {
  const udhari = udhariList.find((item) => item.id === id);
  if (
    confirm(
      `Mark the entry for ${udhari.customerName} as settled? It will be visually struck out but retained in the records.`
    )
  ) {
    if (udhari) {
      udhari.status = "Settled";
      saveUdhari();
      showToast(
        `Entry for ${udhari.customerName} marked as settled.`,
        "success"
      );
    }
  }
}

// Function to delete udhari entry with undo option
function deleteUdhari(id) {
  const udhari = udhariList.find((item) => item.id === id);
  if (!udhari) {
    console.error("Entry not found for deletion:", id);
    showToast("Entry not found.", "error");
    return;
  }

  const confirmationMessage = `Are you sure you want to delete the entry for ${
    udhari.customerName
  } (₹${udhari.totalAmount.toFixed(2)})? You can undo this action.`;
  if (confirm(confirmationMessage)) {
    const index = udhariList.findIndex((item) => item.id === id);
    if (index !== -1) {
      lastDeletedEntry = { entry: { ...udhariList[index] }, index };
      udhariList.splice(index, 1);
      saveUdhari();

      // Show toast notification
      showToast(`Entry for ${udhari.customerName} deleted.`, "success");
      console.log(`Deleted entry for ${udhari.customerName} with id ${id}`);
    } else {
      console.error("Failed to find entry for deletion:", id);
      showToast("Failed to delete entry.", "error");
    }
  }
}

// Function to undo the last deletion
function undoDelete() {
  if (lastDeletedEntry) {
    udhariList.splice(lastDeletedEntry.index, 0, lastDeletedEntry.entry);
    saveUdhari();
    document.getElementById("toast").style.display = "none";
    lastDeletedEntry = null;
    showToast("Entry restored.", "success");
  }
}

// Function to open transaction history modal
function openHistoryModal(id) {
  const udhari = udhariList.find((item) => item.id === id);
  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";

  if (!udhari.transactions || udhari.transactions.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No transactions recorded.";
    historyList.appendChild(li);
  } else {
    udhari.transactions.forEach((tx) => {
      const li = document.createElement("li");
      li.textContent = `Paid ₹${tx.amount.toFixed(2)} on ${tx.date} at ${
        tx.time
      } (${tx.note})`;
      historyList.appendChild(li);
    });
  }

  document.getElementById("historyModal").style.display = "flex";
}

// Function to export udhari list to CSV
function exportToCSV() {
  if (udhariList.length === 0) {
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
    "Transactions",
  ];
  const rows = udhariList.map((item) => [
    `"${item.customerName}"`,
    item.totalAmount.toFixed(2),
    item.paidAmount.toFixed(2),
    item.remainingAmount.toFixed(2),
    item.date,
    item.status,
    item.transactions.length,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "udhari_list.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Exported to CSV successfully.", "success");
}

// Function to clear all data
function clearAllData() {
  if (
    confirm(
      "Are you sure you want to clear all udhari data? This action cannot be undone."
    )
  ) {
    udhariList = [];
    saveUdhari();
    showToast("All data cleared.", "success");
  }
}

// Function to apply all filters and sorting
function applyFilters() {
  const searchTerm = document.getElementById("searchInput").value.toLowerCase();
  const dateFilter = document.getElementById("dateFilter").value;
  const statusFilter = document.getElementById("statusFilter").value;
  const sortOption = document.getElementById("sortOption").value;

  let filteredList = [...udhariList];

  // Apply filters
  if (searchTerm) {
    filteredList = filteredList.filter((item) =>
      item.customerName.toLowerCase().includes(searchTerm)
    );
  }

  if (dateFilter) {
    filteredList = filteredList.filter((item) => item.date === dateFilter);
  }

  if (statusFilter !== "all") {
    filteredList = filteredList.filter((item) => item.status === statusFilter);
  }

  // Apply sorting
  if (sortOption) {
    filteredList = sortUdhariList(filteredList, sortOption);
  }

  renderUdhariTable(filteredList);
}

// Function to render the udhari table
function renderUdhariTable(list = udhariList) {
  const tbody = document.getElementById("udhariTableBody");
  tbody.innerHTML = "";

  list.forEach((item) => {
    const totalAmount =
      typeof item.totalAmount === "number" ? item.totalAmount : 0;
    const paidAmount =
      typeof item.paidAmount === "number" ? item.paidAmount : 0;
    const remainingAmount =
      typeof item.remainingAmount === "number"
        ? item.remainingAmount
        : totalAmount;
    const transactionCount = item.transactions ? item.transactions.length : 0;

    const row = document.createElement("tr");
    if (item.status === "Settled") {
      row.classList.add("settled-row");
    }
    row.innerHTML = `
            <td>${item.customerName || "Unknown"}</td>
            <td>₹${totalAmount.toFixed(2)}</td>
            <td>₹${paidAmount.toFixed(2)}</td>
            <td>₹${remainingAmount.toFixed(2)}</td>
            <td>${new Date(item.date).toLocaleDateString("en-IN")}</td>
            <td>${transactionCount}</td>
            <td class="status-${item.status.toLowerCase()}">${item.status}</td>
            <td class="actions-cell">
                ${
                  item.status !== "Paid" && item.status !== "Settled"
                    ? `<button class="action-btn success" onclick="openPaymentModal(${item.id})">
                        <i class="fas fa-money-bill"></i> Pay
                        <span class="tooltip">Record a payment</span>
                    </button>`
                    : ""
                }
                ${
                  item.status !== "Settled"
                    ? `<button class="action-btn secondary" onclick="markAsSettled(${item.id})">
                        <i class="fas fa-check-circle"></i> Settle
                        <span class="tooltip">Mark as settled</span>
                    </button>`
                    : ""
                }
                <button class="action-btn warning" onclick="openHistoryModal(${
                  item.id
                })">
                    <i class="fas fa-history"></i> History
                    <span class="tooltip">View transaction history</span>
                </button>
                <button class="action-btn danger" onclick="deleteUdhari(${
                  item.id
                })">
                    <i class="fas fa-trash"></i> Delete
                    <span class="tooltip">Delete this entry</span>
                </button>
            </td>
        `;
    tbody.appendChild(row);
  });
}

// Close modal when clicking outside
window.onclick = function (event) {
  const paymentModal = document.getElementById("paymentModal");
  const historyModal = document.getElementById("historyModal");
  if (event.target === paymentModal) {
    closeModal("paymentModal");
  }
  if (event.target === historyModal) {
    closeModal("historyModal");
  }
};

// Initial render and summary update
applyFilters();
updateSummary();
