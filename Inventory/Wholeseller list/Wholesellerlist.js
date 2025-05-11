const { ipcRenderer } = require("electron");

document.addEventListener("DOMContentLoaded", () => {
    const wholesalerTableBody = document.getElementById("wholesalerTableBody");
    const searchInput = document.getElementById("searchInput");
    const searchByNameContact = document.getElementById("searchByNameContact");
    const wholesalerForm = document.getElementById("wholesalerForm");
    const editWholesalerForm = document.getElementById("editWholesalerForm");
    const wholesalerModal = document.getElementById("wholesalerModal");
    const closeModal = document.getElementById("closeModal");
    const modalTitle = document.getElementById("modalTitle");

    // Auto-fill creation date
    const createdAtInput = wholesalerForm.querySelector("#createdAt");
    const today = new Date().toISOString().split("T")[0];
    createdAtInput.value = today;

    let expandedRow = null;

    // Fetch and display wholesalers
    async function loadWholesalers() {
        try {
            const wholesalers = await ipcRenderer.invoke("wholesalers:getWholesalers");
            const wholesalersWithItems = await Promise.all(
                wholesalers.map(async (wholesaler) => {
                    const items = await ipcRenderer.invoke("wholesalers:getWholesalerItems", wholesaler.id);
                    return { ...wholesaler, items };
                })
            );
            displayWholesalers(wholesalersWithItems);
            return wholesalersWithItems;
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
                <td>${wholesaler.tax_id || "N/A"}</td>
                <td>${wholesaler.createdAt || "N/A"}</td>
                <td>₹${wholesaler.udhari.toFixed(2)}</td>
                <td class="actions-cell">
                    <button class="action-btn edit-btn" onclick="editWholesaler(${wholesaler.id}, '${wholesaler.name}', '${wholesaler.specialty_product || ""}', '${wholesaler.contact_number}', '${wholesaler.email || ""}', '${wholesaler.address || ""}', '${wholesaler.tax_id || ""}', ${wholesaler.moq || null}, ${wholesaler.total_amount}, ${wholesaler.udhari}, '${wholesaler.createdAt || ""}')">Edit</button>
                    <button class="action-btn delete-btn" onclick="deleteWholesaler(${wholesaler.id})">Delete</button>
                </td>
            `;
            row.addEventListener("click", (event) => {
                if (!event.target.classList.contains("action-btn")) {
                    toggleDetailsRow(row, wholesaler);
                }
            });
            wholesalerTableBody.appendChild(row);
        });
    }

    // Toggle details row
    function toggleDetailsRow(row, wholesaler) {
        if (expandedRow && expandedRow.row === row) {
            // Collapse the current expanded row
            expandedRow.detailsRow.remove();
            expandedRow = null;
            return;
        }

        // Close any existing expanded row
        if (expandedRow) {
            expandedRow.detailsRow.remove();
            expandedRow = null;
        }

        // Create and show new details row
        const detailsRow = document.createElement("tr");
        detailsRow.className = "details-row";
        const itemNames = wholesaler.items.map((item) => item.name).join(", ") || "None";
        detailsRow.innerHTML = `
            <td colspan="7">
                <table class="summary-table">
                    <tbody>
                        <tr>
                            <th>ID</th><td>${wholesaler.id}</td>
                            <th>Name</th><td>${wholesaler.name}</td>
                            <th>Contact Number</th><td>${wholesaler.contact_number}</td>
                            <th>Email</th><td>${wholesaler.email || "N/A"}</td>
                            <th>Address</th><td>${wholesaler.address || "N/A"}</td>
                            <th>Tax ID/GSTIN</th><td>${wholesaler.tax_id || "N/A"}</td>
                        </tr>
                        <tr>
                            <th>MOQ</th><td>${wholesaler.moq || "N/A"}</td>
                            <th>Total Amount (₹)</th><td>₹${wholesaler.total_amount.toFixed(2)}</td>
                            <th>Udhari (₹)</th><td>₹${wholesaler.udhari.toFixed(2)}</td>
                            <th>Specialty Product</th><td>${wholesaler.specialty_product || "N/A"}</td>
                            <th>Items Sold</th><td>${itemNames}</td>
                            <th>Date of Creation</th><td>${wholesaler.createdAt || "N/A"}</td>
                        </tr>
                    </tbody>
                </table>
            </td>
        `;
        row.insertAdjacentElement("afterend", detailsRow);
        expandedRow = { row, detailsRow };
    }

    // Combined search functionality
    async function applyFilters() {
        const searchIdTerm = searchInput.value.trim().toLowerCase();
        const searchNameContactTerm = searchByNameContact.value.trim().toLowerCase();
        try {
            const wholesalers = await loadWholesalers();
            let filteredWholesalers = wholesalers;
            if (searchIdTerm) {
                filteredWholesalers = filteredWholesalers.filter((w) =>
                    w.id.toString().includes(searchIdTerm)
                );
            }
            if (searchNameContactTerm) {
                filteredWholesalers = filteredWholesalers.filter(
                    (w) =>
                        (w.name && w.name.toLowerCase().includes(searchNameContactTerm)) ||
                        (w.contact_number && w.contact_number.toLowerCase().includes(searchNameContactTerm)) ||
                        (w.email && w.email.toLowerCase().includes(searchNameContactTerm)) ||
                        (w.address && w.address.toLowerCase().includes(searchNameContactTerm))
                );
            }
            displayWholesalers(filteredWholesalers);
        } catch (error) {
            console.error("Error applying filters:", error);
        }
    }

    // Edit wholesaler
    window.editWholesaler = function (id, name, specialty_product, contact_number, email, address, tax_id, moq, total_amount, udhari, createdAt) {
        modalTitle.textContent = "Edit Wholesaler";
        const form = editWholesalerForm;
        form.querySelector("#wholesalerId").value = id;
        form.querySelector("#wholesalerName").value = name;
        form.querySelector("#specialtyProduct").value = specialty_product || "";
        form.querySelector("#contactNumber").value = contact_number;
        form.querySelector("#wholesalerEmail").value = email || "";
        form.querySelector("#wholesalerAddress").value = address || "";
        form.querySelector("#wholesalerTaxId").value = tax_id || "";
        form.querySelector("#wholesalerMOQ").value = moq || "";
        form.querySelector("#totalAmount").value = total_amount.toFixed(2);
        form.querySelector("#udhari").value = udhari.toFixed(2);
        form.querySelector("#createdAt").value = createdAt || "";
        wholesalerModal.style.display = "block";
    };

    // Delete wholesaler
    window.deleteWholesaler = async function (id) {
        if (confirm("Are you sure you want to delete this wholesaler?")) {
            try {
                await ipcRenderer.invoke("wholesalers:deleteWholesaler", id);
                if (expandedRow) {
                    expandedRow.detailsRow.remove();
                    expandedRow = null;
                }
                loadWholesalers();
            } catch (error) {
                console.error("Error deleting wholesaler:", error);
                alert("Failed to delete wholesaler: " + error.message);
            }
        }
    };

    // Handle form submission (create and edit)
    function handleFormSubmission(form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const wholesaler = {
                id: form.querySelector("#wholesalerId").value ? parseInt(form.querySelector("#wholesalerId").value) : undefined,
                name: form.querySelector("#wholesalerName").value.trim(),
                contact_number: form.querySelector("#contactNumber").value.trim(),
                email: form.querySelector("#wholesalerEmail").value.trim() || null,
                address: form.querySelector("#wholesalerAddress").value.trim() || null,
                tax_id: form.querySelector("#wholesalerTaxId").value.trim() || null,
                moq: form.querySelector("#wholesalerMOQ").value ? parseInt(form.querySelector("#wholesalerMOQ").value) : null,
                total_amount: parseFloat(form.querySelector("#totalAmount").value) || 0.0,
                udhari: parseFloat(form.querySelector("#udhari").value) || 0.0,
                specialty_product: form.querySelector("#specialtyProduct").value.trim() || null,
                createdAt: form.querySelector("#createdAt").value || null,
            };
            try {
                if (!wholesaler.id) {
                    const exists = await ipcRenderer.invoke("wholesalers:checkContactNumber", wholesaler.contact_number);
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
                form.reset();
                form.querySelector("#createdAt").value = new Date().toISOString().split("T")[0];
                loadWholesalers();
            } catch (error) {
                console.error("Error saving wholesaler:", error);
                alert("Failed to save wholesaler: " + error.message);
            }
        });
    }

    // Apply form submission handlers
    handleFormSubmission(wholesalerForm);
    handleFormSubmission(editWholesalerForm);

    // Close modal
    closeModal.addEventListener("click", () => {
        wholesalerModal.style.display = "none";
    });
    window.addEventListener("click", (event) => {
        if (event.target === wholesalerModal) {
            wholesalerModal.style.display = "none";
        }
    });

    // Search input listeners
    searchInput.addEventListener("input", applyFilters);
    searchByNameContact.addEventListener("input", applyFilters);

    // Initial load
    loadWholesalers();
});