const { ipcRenderer } = require('electron');

let fullReturns = [];
let selectedBillId = null;
let billItems = [];
let editingRowId = null;

document.addEventListener('DOMContentLoaded', () => {
    loadReturns();
    setupSearchBars();
    setDefaultDate();
    document.getElementById('actionButton').addEventListener('click', handleAction);
});

function setDefaultDate() {
    const returnDateInput = document.getElementById('returnDate');
    if (returnDateInput) {
        returnDateInput.value = new Date().toISOString().split('T')[0];
    }
}

async function loadReturns() {
    try {
        console.log('Fetching returns from IPC...');
        const returns = await ipcRenderer.invoke('returns:getReturns');
        console.log('Received returns:', returns);
        fullReturns = returns || [];
        displayReturns(fullReturns);
    } catch (error) {
        console.error('Error loading returns:', error);
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.textContent = 'Failed to load returns.';
            errorMessage.style.display = 'block';
        }
    }
}

function displayReturns(returns) {
    const returnsBody = document.getElementById('returnsBody');
    if (!returnsBody) {
        console.error('Returns table body not found');
        return;
    }
    console.log('Rendering returns to table:', returns);
    returnsBody.innerHTML = '';
    (returns || []).forEach(returnItem => {
        const row = document.createElement('tr');
        row.dataset.returnId = returnItem.id;
        const isEditing = editingRowId === returnItem.id;
        row.innerHTML = `
            <td class="non-editable">${returnItem.customer_name || 'N/A'}</td>
            <td class="non-editable">${returnItem.customer_mobile || 'N/A'}</td>
            <td class="non-editable">${returnItem.bill_id}</td>
            <td>${isEditing ? `<input type="text" class="edit-item-name" value="${returnItem.item_name}" data-original="${returnItem.item_name}">` : returnItem.item_name}</td>
            <td class="non-editable">${returnItem.item_barcode}</td>
            <td>${isEditing ? `<input type="number" class="edit-quantity" value="${returnItem.quantity}" min="1" data-original="${returnItem.quantity}">` : returnItem.quantity}</td>
            <td>${isEditing ? `<input type="number" class="edit-refund-amount" value="${returnItem.refund_amount.toFixed(2)}" min="0" step="0.01" data-original="${returnItem.refund_amount}">` : `₹${returnItem.refund_amount.toFixed(2)}`}</td>
            <td class="non-editable">${returnItem.reason || 'N/A'}</td>
            <td class="non-editable">${new Date(returnItem.createdAt).toLocaleDateString()}</td>
            <td>
                ${isEditing ? `
                    <button class="btn btn-success btn-save" onclick="saveEdit(${returnItem.id})">Save</button>
                    <button class="btn btn-secondary btn-cancel" onclick="cancelEdit()">Cancel</button>
                ` : `
                    <button class="btn btn-edit" onclick="editReturn(${returnItem.id})">Edit</button>
                    <button class="btn btn-delete" onclick="deleteReturn(${returnItem.id})">Delete</button>
                `}
            </td>
        `;
        returnsBody.appendChild(row);
        if (isEditing) {
            setupItemNameSuggestions(row.querySelector('.edit-item-name'), returnItem.bill_id);
        }
    });

    document.querySelectorAll('.non-editable').forEach(cell => {
        cell.addEventListener('click', () => {
            const message = document.getElementById('non-editable-message');
            if (message) {
                message.textContent = 'This field is not editable. Kindly delete this refund and re-add it.';
                message.style.display = 'block';
                setTimeout(() => message.style.display = 'none', 3000);
            }
        });
    });
}

async function setupItemNameSuggestions(input, billId) {
    const suggestions = document.createElement('ul');
    suggestions.className = 'suggestions-list';
    input.parentElement.appendChild(suggestions);
    suggestions.style.display = 'none';

    input.addEventListener('focus', async () => {
        try {
            const items = await ipcRenderer.invoke('returns:getBillItemsForReturn', billId);
            suggestions.innerHTML = '';
            items.forEach(item => {
                const li = document.createElement('li');
                li.textContent = `${item.name} (Barcode: ${item.barcode})`;
                li.addEventListener('click', () => {
                    input.value = item.name;
                    suggestions.style.display = 'none';
                });
                suggestions.appendChild(li);
            });
            suggestions.style.display = items.length > 0 ? 'block' : 'none';
        } catch (error) {
            console.error('Error fetching item suggestions:', error);
        }
    });

    input.addEventListener('input', async () => {
        const searchTerm = input.value.trim();
        try {
            const items = await ipcRenderer.invoke('returns:getBillItemsForReturn', billId);
            suggestions.innerHTML = '';
            items
                .filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `${item.name} (Barcode: ${item.barcode})`;
                    li.addEventListener('click', () => {
                        input.value = item.name;
                        suggestions.style.display = 'none';
                    });
                    suggestions.appendChild(li);
                });
            suggestions.style.display = searchTerm.length > 0 ? 'block' : 'none';
        } catch (error) {
            console.error('Error fetching item suggestions:', error);
        }
    });

    document.addEventListener('click', (event) => {
        if (!input.contains(event.target) && !suggestions.contains(event.target)) {
            suggestions.style.display = 'none';
        }
    });
}

async function editReturn(id) {
    editingRowId = id;
    await loadReturns();
}

async function saveEdit(id) {
    const row = document.querySelector(`tr[data-return-id="${id}"]`);
    const itemName = row.querySelector('.edit-item-name').value.trim();
    const quantity = parseInt(row.querySelector('.edit-quantity').value);
    const refundAmount = parseFloat(row.querySelector('.edit-refund-amount').value);
    const errorMessage = document.getElementById('error-message');

    if (!itemName || !quantity || !refundAmount) {
        if (errorMessage) {
            errorMessage.textContent = 'Error: Please fill out all editable fields.';
            errorMessage.style.display = 'block';
        }
        return;
    }

    try {
        const returnData = {
            id,
            item_name: itemName,
            quantity,
            refund_amount: refundAmount
        };
        const result = await ipcRenderer.invoke('returns:editReturn', returnData);
        if (result.success) {
            editingRowId = null;
            await loadReturns();
            if (errorMessage) errorMessage.style.display = 'none';
        } else {
            if (errorMessage) {
                errorMessage.textContent = `Error: ${result.error}`;
                errorMessage.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error saving edit:', error);
        if (errorMessage) {
            errorMessage.textContent = 'Error: Failed to save edit.';
            errorMessage.style.display = 'block';
        }
    }
}

function cancelEdit() {
    editingRowId = null;
    loadReturns();
}

async function deleteReturn(id) {
    if (!confirm('Are you sure you want to delete this return?')) return;
    try {
        const result = await ipcRenderer.invoke('returns:deleteReturn', id);
        if (result.success) {
            await loadReturns();
            const errorMessage = document.getElementById('error-message');
            if (errorMessage) errorMessage.style.display = 'none';
        } else {
            const errorMessage = document.getElementById('error-message');
            if (errorMessage) {
                errorMessage.textContent = `Error: ${result.error}`;
                errorMessage.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error deleting return:', error);
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.textContent = 'Error: Failed to delete return.';
            errorMessage.style.display = 'block';
        }
    }
}

function setupSearchBars() {
    const billIdSearch = document.getElementById('billIdSearch');
    const customerSearch = document.getElementById('customerSearch');
    const returnsSearch = document.getElementById('returnsSearch');
    const billIdSuggestions = document.getElementById('billIdSuggestions');
    const customerSuggestions = document.getElementById('customerSuggestions');
    const returnsSuggestions = document.getElementById('returnsSuggestions');
    const itemNameInput = document.getElementById('itemName');
    const itemNameSuggestions = document.getElementById('itemNameSuggestions');
    const barcodeInput = document.getElementById('barcode');
    let isItemSelected = false;

    if (billIdSearch && billIdSuggestions) {
        billIdSearch.addEventListener('input', async () => {
            const searchTerm = billIdSearch.value.trim();
            if (searchTerm.length === 0) {
                billIdSuggestions.style.display = 'none';
                return;
            }
            try {
                const results = await ipcRenderer.invoke('returns:searchBillIds', searchTerm);
                billIdSuggestions.innerHTML = '';
                results.forEach(result => {
                    const li = document.createElement('li');
                    li.textContent = `Bill ID: ${result.id} (Customer: ${result.customer_name || 'N/A'}, Mobile: ${result.customer_mobile || 'N/A'})`;
                    li.addEventListener('click', () => {
                        selectBill(result);
                        billIdSuggestions.style.display = 'none';
                        billIdSearch.value = result.id;
                    });
                    billIdSuggestions.appendChild(li);
                });
                billIdSuggestions.style.display = results.length > 0 ? 'block' : 'none';
            } catch (error) {
                console.error('Error fetching bill ID suggestions:', error);
            }
        });
    }

    if (customerSearch && customerSuggestions) {
        customerSearch.addEventListener('input', async () => {
            const searchTerm = customerSearch.value.trim();
            if (searchTerm.length === 0) {
                customerSuggestions.style.display = 'none';
                return;
            }
            try {
                const results = await ipcRenderer.invoke('returns:searchCustomerBills', searchTerm);
                customerSuggestions.innerHTML = '';
                results.forEach(result => {
                    const li = document.createElement('li');
                    li.textContent = `Bill ID: ${result.id}, Customer: ${result.customer_name}, Mobile: ${result.customer_mobile}`;
                    li.addEventListener('click', () => {
                        selectBill(result);
                        customerSuggestions.style.display = 'none';
                        customerSearch.value = `${result.customer_name} (${result.customer_mobile})`;
                    });
                    customerSuggestions.appendChild(li);
                });
                customerSuggestions.style.display = results.length > 0 ? 'block' : 'none';
            } catch (error) {
                console.error('Error fetching customer suggestions:', error);
            }
        });
    }

    if (returnsSearch && returnsSuggestions) {
        returnsSearch.addEventListener('input', async () => {
            const searchTerm = returnsSearch.value.trim();
            if (searchTerm.length === 0) {
                returnsSuggestions.style.display = 'none';
                displayReturns(fullReturns);
                return;
            }
            try {
                const results = await ipcRenderer.invoke('returns:searchReturns', searchTerm);
                returnsSuggestions.innerHTML = '';
                results.forEach(result => {
                    const li = document.createElement('li');
                    li.textContent = `${result.customer_name} (${result.customer_mobile}), Bill ID: ${result.bill_id}, Item: ${result.item_name}`;
                    li.addEventListener('click', () => {
                        displayReturns([result]);
                        returnsSuggestions.style.display = 'none';
                        returnsSearch.value = `${result.customer_name} (${result.customer_mobile})`;
                    });
                    returnsSuggestions.appendChild(li);
                });
                displayReturns(results);
                returnsSuggestions.style.display = results.length > 0 ? 'block' : 'none';
            } catch (error) {
                console.error('Error fetching returns suggestions:', error);
            }
        });
    }

    if (itemNameInput && itemNameSuggestions) {
        itemNameInput.addEventListener('focus', async () => {
            if (!selectedBillId || isItemSelected) {
                itemNameSuggestions.style.display = 'none';
                return;
            }
            try {
                const items = await ipcRenderer.invoke('returns:getBillItemsForReturn', selectedBillId);
                billItems = items;
                itemNameSuggestions.innerHTML = '';
                items.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `${item.name} (Barcode: ${item.barcode})`;
                    li.addEventListener('click', () => {
                        itemNameInput.value = item.name;
                        barcodeInput.value = item.barcode;
                        itemNameSuggestions.style.display = 'none';
                        isItemSelected = true;
                        updateBarcodeSuggestions();
                    });
                    itemNameSuggestions.appendChild(li);
                });
                itemNameSuggestions.style.display = items.length > 0 ? 'block' : 'none';
            } catch (error) {
                console.error('Error fetching item name suggestions:', error);
                itemNameSuggestions.style.display = 'none';
            }
        });

        itemNameInput.addEventListener('input', async () => {
            const searchTerm = itemNameInput.value.trim();
            if (searchTerm.length === 0) {
                isItemSelected = false;
            }
            if (!selectedBillId) {
                itemNameSuggestions.style.display = 'none';
                return;
            }
            try {
                const items = await ipcRenderer.invoke('returns:getBillItemsForReturn', selectedBillId);
                billItems = items;
                itemNameSuggestions.innerHTML = '';
                items
                    .filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .forEach(item => {
                        const li = document.createElement('li');
                        li.textContent = `${item.name} (Barcode: ${item.barcode})`;
                        li.addEventListener('click', () => {
                            itemNameInput.value = item.name;
                            barcodeInput.value = item.barcode;
                            itemNameSuggestions.style.display = 'none';
                            isItemSelected = true;
                            updateBarcodeSuggestions();
                        });
                        itemNameSuggestions.appendChild(li);
                    });
                itemNameSuggestions.style.display = items.length > 0 && searchTerm.length > 0 ? 'block' : 'none';
            } catch (error) {
                console.error('Error fetching item name suggestions:', error);
                itemNameSuggestions.style.display = 'none';
            }
        });
    }

    document.addEventListener('click', (event) => {
        if (billIdSearch && billIdSuggestions && !billIdSearch.contains(event.target) && !billIdSuggestions.contains(event.target)) {
            billIdSuggestions.style.display = 'none';
        }
        if (customerSearch && customerSuggestions && !customerSearch.contains(event.target) && !customerSuggestions.contains(event.target)) {
            customerSuggestions.style.display = 'none';
        }
        if (itemNameInput && itemNameSuggestions && !itemNameInput.contains(event.target) && !itemNameSuggestions.contains(event.target)) {
            itemNameSuggestions.style.display = 'none';
        }
        if (returnsSearch && returnsSuggestions && !returnsSearch.contains(event.target) && !returnsSuggestions.contains(event.target)) {
            returnsSuggestions.style.display = 'none';
        }
    });

    if (barcodeInput) {
        barcodeInput.addEventListener('input', async () => {
            if (!selectedBillId) return;
            const searchTerm = barcodeInput.value.trim();
            try {
                const items = await ipcRenderer.invoke('returns:getBillItemsForReturn', selectedBillId);
                billItems = items;
                const barcodeSuggestions = document.getElementById('barcodeSuggestions');
                if (barcodeSuggestions) {
                    barcodeSuggestions.innerHTML = '';
                    items
                        .filter(item => item.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
                        .forEach(item => {
                            const option = document.createElement('option');
                            option.value = item.barcode;
                            option.textContent = `${item.barcode} (Name: ${item.name})`;
                            barcodeSuggestions.appendChild(option);
                        });
                }
            } catch (error) {
                console.error('Error fetching barcode suggestions:', error);
            }
        });

        barcodeInput.addEventListener('change', () => {
            const selectedBarcode = barcodeInput.value.trim();
            const selectedItem = billItems.find(item => item.barcode === selectedBarcode);
            if (selectedItem) {
                itemNameInput.value = selectedItem.name;
                isItemSelected = true;
            }
        });
    }
}

async function updateBarcodeSuggestions() {
    if (!selectedBillId) return;
    try {
        const items = await ipcRenderer.invoke('returns:getBillItemsForReturn', selectedBillId);
        const barcodeSuggestions = document.getElementById('barcodeSuggestions');
        if (barcodeSuggestions) {
            barcodeSuggestions.innerHTML = '';
            items.forEach(item => {
                const option = document.createElement('option');
                option.value = item.barcode;
                option.textContent = `${item.barcode} (Name: ${item.name})`;
                barcodeSuggestions.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error updating barcode suggestions:', error);
    }
}

function selectBill(bill) {
    selectedBillId = bill.id;
    const billIdInput = document.getElementById('billId');
    const customerNameInput = document.getElementById('customerName');
    const mobileNumberInput = document.getElementById('mobileNumber');
    const itemNameInput = document.getElementById('itemName');
    const barcodeInput = document.getElementById('barcode');
    const quantityInput = document.getElementById('quantity');
    const refundAmountInput = document.getElementById('refundAmount');
    const reasonInput = document.getElementById('reason');
    const errorMessage = document.getElementById('error-message');
    if (billIdInput) billIdInput.value = bill.id;
    if (customerNameInput) customerNameInput.value = bill.customer_name || '';
    if (mobileNumberInput) mobileNumberInput.value = bill.customer_mobile || '';
    if (itemNameInput) itemNameInput.value = '';
    if (barcodeInput) barcodeInput.value = '';
    if (quantityInput) quantityInput.value = '';
    if (refundAmountInput) refundAmountInput.value = '';
    if (reasonInput) reasonInput.value = '';
    if (errorMessage) errorMessage.style.display = 'none';
    const itemNameSuggestions = document.getElementById('itemNameSuggestions');
    const barcodeSuggestions = document.getElementById('barcodeSuggestions');
    if (itemNameSuggestions) {
        itemNameSuggestions.innerHTML = '';
        itemNameSuggestions.style.display = 'none';
    }
    if (barcodeSuggestions) barcodeSuggestions.innerHTML = '';
}

async function handleAction() {
    const customerName = document.getElementById('customerName')?.value.trim();
    const mobileNumber = document.getElementById('mobileNumber')?.value.trim();
    const itemName = document.getElementById('itemName')?.value.trim();
    const barcode = document.getElementById('barcode')?.value.trim();
    const billId = parseInt(document.getElementById('billId')?.value);
    const quantity = parseInt(document.getElementById('quantity')?.value);
    const refundAmount = parseFloat(document.getElementById('refundAmount')?.value);
    const returnDate = document.getElementById('returnDate')?.value;
    const reason = document.getElementById('reason')?.value.trim();
    const errorMessage = document.getElementById('error-message');

    if (!customerName || !mobileNumber || !itemName || !barcode || isNaN(billId) || isNaN(quantity) || isNaN(refundAmount) || !returnDate) {
        if (errorMessage) {
            errorMessage.textContent = 'Error: Please fill out all required fields correctly.';
            errorMessage.style.display = 'block';
        }
        return;
    }

    if (quantity <= 0 || refundAmount <= 0) {
        if (errorMessage) {
            errorMessage.textContent = 'Error: Quantity and refund amount must be positive.';
            errorMessage.style.display = 'block';
        }
        return;
    }

    const returnData = {
        customer_name: customerName,
        mobile_number: mobileNumber,
        item_name: itemName,
        barcode,
        bill_id: billId,
        quantity,
        refund_amount: refundAmount,
        reason: reason || null,
        createdAt: returnDate
    };

    console.log('Sending return data:', returnData);

    try {
        const result = await ipcRenderer.invoke('returns:addReturn', returnData);
        console.log('Add return result:', result);
        if (result.success) {
            try {
                resetForm();
                // Manually append the new return to fullReturns if IPC doesn't refresh
                fullReturns.push({
                    id: result.returnId,
                    customer_name: returnData.customer_name,
                    customer_mobile: returnData.mobile_number,
                    bill_id: returnData.bill_id,
                    item_name: returnData.item_name,
                    item_barcode: returnData.barcode,
                    quantity: returnData.quantity,
                    refund_amount: returnData.refund_amount,
                    reason: returnData.reason,
                    createdAt: returnData.createdAt
                });
                displayReturns(fullReturns);
            } catch (resetError) {
                console.error('Error in resetForm:', resetError);
            }
        } else {
            if (errorMessage) {
                errorMessage.textContent = `Error: ${result.error}`;
                errorMessage.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error processing return:', error);
        if (errorMessage) {
            errorMessage.textContent = `Error: Failed to process return - ${error.message}`;
            errorMessage.style.display = 'block';
        }
    } finally {
        try {
            await loadReturns();
        } catch (loadError) {
            console.error('Error in loadReturns after handleAction:', loadError);
            if (errorMessage) {
                errorMessage.textContent = 'Error: Failed to refresh returns table.';
                errorMessage.style.display = 'block';
            }
        }
    }
}

function resetForm() {
    const elements = {
        customerName: document.getElementById('customerName'),
        mobileNumber: document.getElementById('mobileNumber'),
        itemName: document.getElementById('itemName'),
        barcode: document.getElementById('barcode'),
        billId: document.getElementById('billId'),
        quantity: document.getElementById('quantity'),
        refundAmount: document.getElementById('refundAmount'),
        returnDate: document.getElementById('returnDate'),
        reason: document.getElementById('reason'),
        billIdSearch: document.getElementById('billIdSearch'),
        customerSearch: document.getElementById('customerSearch'),
        returnsSearch: document.getElementById('returnsSearch'),
        errorMessage: document.getElementById('error-message'),
        nonEditableMessage: document.getElementById('non-editable-message'),
        actionButton: document.getElementById('actionButton'),
        itemNameSuggestions: document.getElementById('itemNameSuggestions'),
        barcodeSuggestions: document.getElementById('barcodeSuggestions'),
        billIdSuggestions: document.getElementById('billIdSuggestions'),
        customerSuggestions: document.getElementById('customerSuggestions'),
        returnsSuggestions: document.getElementById('returnsSuggestions')
    };

    if (elements.customerName) elements.customerName.value = '';
    if (elements.mobileNumber) elements.mobileNumber.value = '';
    if (elements.itemName) elements.itemName.value = '';
    if (elements.barcode) elements.barcode.value = '';
    if (elements.billId) elements.billId.value = '';
    if (elements.quantity) elements.quantity.value = '';
    if (elements.refundAmount) elements.refundAmount.value = '';
    if (elements.returnDate) elements.returnDate.value = new Date().toISOString().split('T')[0];
    if (elements.reason) elements.reason.value = '';
    if (elements.billIdSearch) elements.billIdSearch.value = '';
    if (elements.customerSearch) elements.customerSearch.value = '';
    if (elements.returnsSearch) elements.returnsSearch.value = '';
    if (elements.errorMessage) elements.errorMessage.style.display = 'none';
    if (elements.nonEditableMessage) elements.nonEditableMessage.style.display = 'none';
    if (elements.actionButton) elements.actionButton.textContent = 'Process Return';
    if (elements.itemNameSuggestions) {
        elements.itemNameSuggestions.innerHTML = '';
        elements.itemNameSuggestions.style.display = 'none';
    }
    if (elements.barcodeSuggestions) elements.barcodeSuggestions.innerHTML = '';
    if (elements.billIdSuggestions) elements.billIdSuggestions.style.display = 'none';
    if (elements.customerSuggestions) elements.customerSuggestions.style.display = 'none';
    if (elements.returnsSuggestions) elements.returnsSuggestions.style.display = 'none';

    selectedBillId = null;
    billItems = [];
}

ipcRenderer.on('returns:newReturn', (event, newReturn) => {
    console.log('Received new return via IPC:', newReturn);
    loadReturns();
});