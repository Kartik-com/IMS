const { ipcRenderer } = require("electron");

document.addEventListener("DOMContentLoaded", () => {
  // Set createdAt to current timestamp
  const createdAtInput = document.getElementById("createdAt");
  createdAtInput.value = new Date().toISOString();
  loadExpiredItems();

  // Autofill logic for add form
  const barcodeInput = document.getElementById("barcode");
  const itemNameInput = document.getElementById("item_name");
  const stockDisplay = document.getElementById("stock-display");

  async function autofillItem(query, sourceField, isEdit = false) {
    const barcodeInput = isEdit ? document.getElementById("edit-barcode") : document.getElementById("barcode");
    const itemNameInput = isEdit ? document.getElementById("edit-item_name") : document.getElementById("item_name");
    const stockDisplay = isEdit ? document.getElementById("edit-stock-display") : document.getElementById("stock-display");
    if (!query) {
      barcodeInput.value = "";
      itemNameInput.value = "";
      stockDisplay.textContent = "Available Stock: N/A";
      return;
    }
    try {
      const item = await ipcRenderer.invoke("items:getItemByNameOrBarcode", query);
      if (item) {
        if (sourceField === "barcode") {
          itemNameInput.value = item.name;
        } else if (sourceField === "item_name") {
          barcodeInput.value = item.barcode;
        }
        stockDisplay.textContent = `Available Stock: ${item.stock}`;
      } else {
        if (sourceField === "barcode") {
          itemNameInput.value = "";
        } else if (sourceField === "item_name") {
          barcodeInput.value = "";
        }
        stockDisplay.textContent = "Available Stock: N/A";
        alert("Item not found");
      }
    } catch (err) {
      console.error("Error fetching item for autofill:", err);
      alert("Failed to fetch item");
    }
  }

  barcodeInput.addEventListener("input", debounce((e) => {
    autofillItem(e.target.value.trim(), "barcode");
  }, 300));

  itemNameInput.addEventListener("input", debounce((e) => {
    autofillItem(e.target.value.trim(), "item_name");
  }, 300));

  // Debounce function to limit IPC calls
  function debounce(func, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  }

  // Add form submission
  const addForm = document.getElementById("add-expired-item-form");
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const expirationDateInput = document.getElementById("expiration_date");
      if (!expirationDateInput.value) {
        alert("Please select an expiration date");
        return;
      }
      const expiredItem = {
        barcode: barcodeInput.value.trim(),
        item_name: itemNameInput.value.trim(),
        quantity: parseInt(document.getElementById("quantity").value),
        expiration_date: expirationDateInput.value,
        reason: document.getElementById("reason").value.trim() || null,
        createdAt: createdAtInput.value
      };
      try {
        console.log("Sending expired item (add):", expiredItem); // Debug log
        const result = await ipcRenderer.invoke("expiredItems:addExpiredItem", expiredItem);
        if (result.success) {
          addForm.reset();
          createdAtInput.value = new Date().toISOString();
          stockDisplay.textContent = "Available Stock: N/A";
          loadExpiredItems();
          alert("Expired item added successfully");
        } else {
          alert(`Error: ${result.error}`);
        }
      } catch (err) {
        console.error("Failed to add expired item:", err);
        alert("Failed to add expired item");
      }
    });
  }

  // Edit modal setup
  const modal = document.getElementById("edit-modal");
  const closeBtn = document.querySelector(".close");
  const cancelBtn = document.querySelector(".cancel");
  const editForm = document.getElementById("edit-expired-item-form");
  const editBarcodeInput = document.getElementById("edit-barcode");
  const editItemNameInput = document.getElementById("edit-item_name");

  editBarcodeInput.addEventListener("input", debounce((e) => {
    autofillItem(e.target.value.trim(), "barcode", true);
  }, 300));

  editItemNameInput.addEventListener("input", debounce((e) => {
    autofillItem(e.target.value.trim(), "item_name", true);
  }, 300));

  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
    editForm.reset();
  });

  cancelBtn.addEventListener("click", () => {
    modal.style.display = "none";
    editForm.reset();
  });

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      editForm.reset();
    }
  });

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editExpirationDateInput = document.getElementById("edit-expiration_date");
    const editQuantityInput = document.getElementById("edit-quantity");
    if (!editExpirationDateInput.value) {
      alert("Please select an expiration date");
      return;
    }
    if (parseInt(editQuantityInput.value) <= 0) {
      alert("Quantity must be positive");
      return;
    }
    const updatedItem = {
      id: parseInt(document.getElementById("edit-id").value),
      barcode: editBarcodeInput.value.trim(),
      item_name: editItemNameInput.value.trim(),
      quantity: parseInt(editQuantityInput.value),
      expiration_date: editExpirationDateInput.value,
      reason: document.getElementById("edit-reason").value.trim() || null,
      createdAt: document.getElementById("edit-createdAt").value
    };
    try {
      console.log("Sending updated item:", updatedItem); // Debug log
      const result = await ipcRenderer.invoke("expiredItems:updateExpiredItem", updatedItem);
      if (result.success) {
        modal.style.display = "none";
        editForm.reset();
        loadExpiredItems();
        alert("Expired item updated successfully");
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error("Failed to update expired item:", err);
      alert(`Failed to update expired item: ${err.message}`);
    }
  });

  // Search functionality
  const searchInput = document.getElementById("search");
  if (searchInput) {
    searchInput.addEventListener("input", async () => {
      const searchTerm = searchInput.value.trim();
      try {
        const items = searchTerm
          ? await ipcRenderer.invoke("expiredItems:searchExpiredItems", searchTerm)
          : await ipcRenderer.invoke("expiredItems:getExpiredItems");
        renderTable(items);
      } catch (err) {
        console.error("Error searching expired items:", err);
        alert("Failed to search expired items");
      }
    });
  }

  // Listen for real-time updates
  ipcRenderer.on("expiredItems:newExpiredItem", () => loadExpiredItems());
  ipcRenderer.on("expiredItems:updatedExpiredItem", () => loadExpiredItems());
  ipcRenderer.on("expiredItems:deletedExpiredItem", () => loadExpiredItems());

  async function loadExpiredItems() {
    try {
      const items = await ipcRenderer.invoke("expiredItems:getExpiredItems");
      renderTable(items);
    } catch (err) {
      console.error("Error loading expired items:", err);
      alert("Failed to load expired items");
    }
  }

  function renderTable(items) {
    const tableBody = document.getElementById("expired-items-table-body");
    if (tableBody) {
      tableBody.innerHTML = "";
      items.forEach((item) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${item.item_name || "N/A"}</td>
          <td>${item.item_barcode || ""}</td>
          <td>${item.quantity || 0}</td>
          <td>${item.expiration_date || "N/A"}</td>
          <td>${item.reason || "N/A"}</td>
          <td>${item.createdAt ? new Date(item.createdAt).toLocaleString() : "N/A"}</td>
          <td>
            <button onclick="editExpiredItem(${item.id})">Edit</button>
            <button onclick="deleteExpiredItem(${item.id})">Delete</button>
          </td>
        `;
        tableBody.appendChild(row);
      });
    }
  }

  window.editExpiredItem = async function(id) {
    try {
      const items = await ipcRenderer.invoke("expiredItems:getExpiredItems");
      const item = items.find((i) => i.id === parseInt(id));
      if (!item) {
        alert("Item not found");
        return;
      }
      // Populate modal
      document.getElementById("edit-id").value = item.id;
      document.getElementById("edit-barcode").value = item.item_barcode || "";
      document.getElementById("edit-item_name").value = item.item_name || "";
      document.getElementById("edit-quantity").value = item.quantity || 1;
      document.getElementById("edit-expiration_date").value = item.expiration_date || "";
      document.getElementById("edit-reason").value = item.reason || "";
      document.getElementById("edit-createdAt").value = item.createdAt || new Date().toISOString();
      document.getElementById("edit-stock-display").textContent = `Available Stock: ${await getStock(item.item_barcode || "")}`;
      modal.style.display = "block";
    } catch (err) {
      console.error("Error opening edit modal:", err);
      alert("Failed to open edit modal");
    }
  };

  async function getStock(barcode) {
    try {
      const item = await ipcRenderer.invoke("items:getItemByNameOrBarcode", barcode);
      return item ? item.stock : "N/A";
    } catch (err) {
      console.error("Error fetching stock:", err);
      return "N/A";
    }
  }

  window.deleteExpiredItem = async function(id) {
    if (!confirm("Are you sure you want to delete this expired item?")) {
      return;
    }
    try {
      console.log("Deleting item with id:", id); // Debug log
      const result = await ipcRenderer.invoke("expiredItems:deleteExpiredItem", id);
      if (result.success) {
        loadExpiredItems();
        alert("Expired item deleted successfully");
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error("Failed to delete expired item:", err);
      alert(`Failed to delete expired item: ${err.message}`);
    }
  };
});