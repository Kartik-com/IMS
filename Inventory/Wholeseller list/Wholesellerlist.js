const { ipcRenderer } = require("electron");

document.addEventListener("DOMContentLoaded", () => {
  const wholesalerTableBody = document.getElementById("wholesalerTableBody");
  const searchInput = document.getElementById("searchInput");
  const searchByNameContact = document.getElementById("searchByNameContact");
  const createWholesalerBtn = document.getElementById("createWholesalerBtn");
  const wholesalerModal = document.getElementById("wholesalerModal");
  const closeModal = document.getElementById("closeModal");
  const wholesalerForm = document.getElementById("wholesalerForm");
  const modalTitle = document.getElementById("modalTitle");
  const wholesalerIdInput = document.getElementById("wholesalerId");
  const wholesalerNameInput = document.getElementById("wholesalerName");
  const contactNumberInput = document.getElementById("contactNumber");
  const wholesalerEmailInput = document.getElementById("wholesalerEmail");
  const wholesalerAddressInput = document.getElementById("wholesalerAddress");
  const wholesalerTaxIdInput = document.getElementById("wholesalerTaxId");
  const wholesalerMOQInput = document.getElementById("wholesalerMOQ");
  const creditBalanceInput = document.getElementById("creditBalance");

  // Fetch and display wholesalers
  async function loadWholesalers() {
    try {
      const wholesalers = await ipcRenderer.invoke(
        "wholesalers:getWholesalers"
      );
      displayWholesalers(wholesalers);
      return wholesalers;
    } catch (error) {
      console.error("Error loading wholesalers:", error);
      return [];
    }
  }

  // Display wholesalers in the table
  function displayWholesalers(wholesalers) {
    wholesalerTableBody.innerHTML = "";
    wholesalers.forEach((wholesaler) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${wholesaler.id}</td>
        <td>${wholesaler.name}</td>
        <td>${wholesaler.contact_number}</td>
        <td>${wholesaler.email || "N/A"}</td>
        <td>${wholesaler.address || "N/A"}</td>
        <td>${wholesaler.tax_id || "N/A"}</td>
        <td>${wholesaler.moq || "N/A"}</td>
        <td>₹${wholesaler.credit_balance.toFixed(2)}</td>
        <td>
          <button class="action-btn edit-btn" onclick="editWholesaler(${
            wholesaler.id
          }, '${wholesaler.name}', '${wholesaler.contact_number}', '${
        wholesaler.email || ""
      }', '${wholesaler.address || ""}', '${wholesaler.tax_id || ""}', ${
        wholesaler.moq || null
      }, ${wholesaler.credit_balance})">Edit</button>
          <button class="action-btn delete-btn" onclick="deleteWholesaler(${
            wholesaler.id
          })">Delete</button>
        </td>
      `;
      wholesalerTableBody.appendChild(row);
    });
  }

  // Combined search functionality
  async function applyFilters() {
    const searchIdTerm = searchInput.value.trim().toLowerCase();
    const searchNameContactTerm = searchByNameContact.value
      .trim()
      .toLowerCase();

    try {
      const wholesalers = await ipcRenderer.invoke(
        "wholesalers:getWholesalers"
      );
      let filteredWholesalers = wholesalers;

      // Filter by ID
      if (searchIdTerm) {
        filteredWholesalers = filteredWholesalers.filter((w) =>
          w.id.toString().includes(searchIdTerm)
        );
      }

      // Filter by Name, Contact, Email, or Address
      if (searchNameContactTerm) {
        filteredWholesalers = filteredWholesalers.filter(
          (w) =>
            (w.name && w.name.toLowerCase().includes(searchNameContactTerm)) ||
            (w.contact_number &&
              w.contact_number.toLowerCase().includes(searchNameContactTerm)) ||
            (w.email &&
              w.email.toLowerCase().includes(searchNameContactTerm)) ||
            (w.address &&
              w.address.toLowerCase().includes(searchNameContactTerm))
        );
      }

      displayWholesalers(filteredWholesalers);
    } catch (error) {
      console.error("Error applying filters:", error);
    }
  }

  // Open modal for creating a new wholesaler
  createWholesalerBtn.addEventListener("click", () => {
    modalTitle.textContent = "Create Wholesaler";
    wholesalerForm.reset();
    wholesalerIdInput.value = "";
    creditBalanceInput.value = "0.0";
    wholesalerModal.style.display = "block";
  });

  // Close modal
  closeModal.addEventListener("click", () => {
    wholesalerModal.style.display = "none";
  });

  // Close modal when clicking outside
  window.addEventListener("click", (event) => {
    if (event.target === wholesalerModal) {
      wholesalerModal.style.display = "none";
    }
  });

  // Edit wholesaler
  window.editWholesaler = function (
    id,
    name,
    contact_number,
    email,
    address,
    tax_id,
    moq,
    credit_balance
  ) {
    modalTitle.textContent = "Edit Wholesaler";
    wholesalerIdInput.value = id;
    wholesalerNameInput.value = name;
    contactNumberInput.value = contact_number;
    wholesalerEmailInput.value = email || "";
    wholesalerAddressInput.value = address || "";
    wholesalerTaxIdInput.value = tax_id || "";
    wholesalerMOQInput.value = moq || "";
    creditBalanceInput.value = credit_balance.toFixed(2);
    wholesalerModal.style.display = "block";
  };

  // Delete wholesaler
  window.deleteWholesaler = async function (id) {
    if (confirm("Are you sure you want to delete this wholesaler?")) {
      try {
        await ipcRenderer.invoke("wholesalers:deleteWholesaler", id);
        loadWholesalers();
      } catch (error) {
        console.error("Error deleting wholesaler:", error);
        alert("Failed to delete wholesaler: " + error.message);
      }
    }
  };

  // Handle form submission
  wholesalerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const wholesaler = {
      id: wholesalerIdInput.value
        ? parseInt(wholesalerIdInput.value)
        : undefined,
      name: wholesalerNameInput.value.trim(),
      contact_number: contactNumberInput.value.trim(),
      email: wholesalerEmailInput.value.trim() || null,
      address: wholesalerAddressInput.value.trim() || null,
      tax_id: wholesalerTaxIdInput.value.trim() || null,
      moq: wholesalerMOQInput.value ? parseInt(wholesalerMOQInput.value) : null,
      credit_balance: parseFloat(creditBalanceInput.value) || 0.0,
    };

    try {
      // Check if contact number already exists (skip for same wholesaler on update)
      if (!wholesaler.id) {
        const exists = await ipcRenderer.invoke(
          "wholesalers:checkContactNumber",
          wholesaler.contact_number
        );
        if (exists) {
          alert("Contact number already exists.");
          return;
        }
      }

      if (wholesaler.id) {
        await ipcRenderer.invoke("wholesalers:updateWholesaler", wholesaler);
      } else {
        await ipcRenderer.invoke("wholesalers:addWholesaler", wholesaler);
      }

      wholesalerModal.style.display = "none";
      loadWholesalers();
    } catch (error) {
      console.error("Error saving wholesaler:", error);
      alert("Failed to save wholesaler: " + error.message);
    }
  });

  // Search input listeners
  searchInput.addEventListener("input", applyFilters);
  searchByNameContact.addEventListener("input", applyFilters);

  // Initial load
  loadWholesalers();
});
