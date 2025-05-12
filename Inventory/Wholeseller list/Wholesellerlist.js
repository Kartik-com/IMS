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
            const wholesalersWithDetails = await Promise.all(
                wholesalers.map(async (wholesaler) => {
                    // Fetch items sold by this wholesaler
                    const items = await ipcRenderer.invoke("wholesalers:getWholesalerItems", wholesaler.id);
                    console.log(`Items for wholesaler ${wholesaler.name}:`, items);

                    // Fetch purchases for this wholesaler to get item details
                    const purchases = await ipcRenderer.invoke("wholesalerPurchases:getPurchases");
                    const wholesalerPurchases = purchases.filter(p => p.wholesaler_name === wholesaler.name);
                    console.log(`Purchases for wholesaler ${wholesaler.name}:`, wholesalerPurchases);

                    const purchaseItems = wholesalerPurchases.flatMap(purchase => {
                        try {
                            const purchaseData = JSON.parse(purchase.data);
                            console.log(`Parsed purchase data for purchase ID ${purchase.id}:`, purchaseData);
                            return (purchaseData.totalItems || []).map(item => {
                                console.log(`Raw purchase item:`, item);
                                return {
                                    name: item.name || item.item_name || "Unknown Item",
                                    barcode: item.barcode || "N/A",
                                    buying_cost: parseFloat(item.buying_cost) || 0,
                                    mrp: parseFloat(item.mrp || item.MRP || item.retail_price) || 0,
                                    gst: parseFloat(item.gst_percentage || item.gst_rate || item.tax_rate) || 0,
                                    quantity: parseInt(item.quantity) || 0,
                                    unit: item.unit || "N/A"
                                };
                            });
                        } catch (error) {
                            console.error(`Failed to parse purchase data for purchase ID ${purchase.id}:`, error);
                            return [];
                        }
                    });
                    console.log(`Purchase items for wholesaler ${wholesaler.name}:`, purchaseItems);

                    // Map items to include purchase details using barcode for matching
                    const detailedItems = items.map(item => {
                        const purchaseItem = purchaseItems.find(pi => pi.barcode === item.barcode) || {};
                        console.log(`Matching item ${item.name} (barcode: ${item.barcode}) with purchase item:`, purchaseItem);
                        return {
                            name: item.name,
                            barcode: item.barcode || "N/A",
                            buying_cost: purchaseItem.buying_cost || 0,
                            mrp: purchaseItem.mrp || 0,
                            gst: purchaseItem.gst || 0,
                            quantity: purchaseItem.quantity || 0,
                            unit: purchaseItem.unit || "N/A"
                        };
                    });
                    return { ...wholesaler, items: detailedItems };
                })
            );
            displayWholesalers(wholesalersWithDetails);
            return wholesalersWithDetails;
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

        // Format the date to DD-MM-YYYY
        const formatDate = (dateStr) => {
            if (!dateStr) {
                console.log("Date string is empty or null:", dateStr);
                return "N/A";
            }
            try {
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) {
                    console.log("Invalid date format:", dateStr);
                    return "N/A";
                }
                const formatted = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
                console.log(`Formatted date for ${dateStr}:`, formatted);
                return formatted;
            } catch (error) {
                console.error("Error formatting date:", dateStr, error);
                return "N/A";
            }
        };

        // Log the raw createdAt value
        console.log(`Raw createdAt for wholesaler ${wholesaler.name}:`, wholesaler.createdAt);

        // Create and show new details row
        const detailsRow = document.createElement("tr");
        detailsRow.className = "details-row";
        detailsRow.innerHTML = `
            <td colspan="7">
                <div class="wholesaler-details">
                    <table class="summary-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Contact Number</th>
                                <th>Email</th>
                                <th>Tax ID/GSTIN</th>
                                <th>MOQ</th>
                                <th>Total Amount (₹)</th>
                                <th>Udhari (₹)</th>
                                <th>Specialty Product</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${wholesaler.id}</td>
                                <td>${wholesaler.name}</td>
                                <td>${wholesaler.contact_number}</td>
                                <td>${wholesaler.email || "N/A"}</td>
                                <td>${wholesaler.tax_id || "N/A"}</td>
                                <td>${wholesaler.moq || "N/A"}</td>
                                <td>₹${wholesaler.total_amount.toFixed(2)}</td>
                                <td>₹${wholesaler.udhari.toFixed(2)}</td>
                                <td>${wholesaler.specialty_product || "N/A"}</td>
                            </tr>
                            <tr>
                                <th>Address</th>
                                <td colspan="4">${wholesaler.address || "N/A"}</td>
                                <th>Date of Creation</th>
                                <td colspan="3">${formatDate(wholesaler.createdAt)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <h3>Items Sold</h3>
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th>Barcode</th>
                                <th>Item Name</th>
                                <th>Buy Cost (₹)</th>
                                <th>MRP (₹)</th>
                                <th>GST %</th>
                                <th>Quantity</th>
                                <th>Unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${wholesaler.items.length > 0 ? wholesaler.items.map(item => `
                                <tr>
                                    <td>${item.barcode || "N/A"}</td>
                                    <td>${item.name || "Unknown Item"}</td>
                                    <td>₹${item.buying_cost.toFixed(2)}</td>
                                    <td>₹${item.mrp > 0 ? item.mrp.toFixed(2) : "N/A"}</td>
                                    <td>${item.gst > 0 ? item.gst.toFixed(1) : "N/A"}</td>
                                    <td>${item.quantity}</td>
                                    <td>${item.unit || "N/A"}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="7">No items</td></tr>'}
                        </tbody>
                    </table>
                </div>
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