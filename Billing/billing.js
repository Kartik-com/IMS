const { ipcRenderer } = require('electron');

let inventory = [];
let billItems = [];

// Load inventory when the page loads
document.addEventListener('DOMContentLoaded', () => {
    loadInventory();
    document.getElementById('searchInput').addEventListener('keydown', handleSearchEnter);
});

async function loadInventory() {
    try {
        inventory = await ipcRenderer.invoke('inventory:getItems');
        updateItemsTable();
    } catch (error) {
        console.error('Error loading inventory:', error);
        alert('Failed to load inventory.');
    }
}

function handleSearchEnter(event) {
    if (event.key !== 'Enter') return;

    const searchTerm = event.target.value.trim().toLowerCase();
    if (!searchTerm) return;

    const matchedItem = inventory.find(item =>
        item.barcode.toLowerCase() === searchTerm ||
        item.name.toLowerCase() === searchTerm
    );

    if (matchedItem) {
        addOrUpdateItem(matchedItem);
        event.target.value = '';
    } else {
        showError('Product not found in inventory!');
        event.target.value = '';
    }
}

function addOrUpdateItem(item) {
    console.log(item);
    const existingItem = billItems.find(billItem => billItem.productId === item.id);

    // Calculate total quantity already being billed
    const existingQty = existingItem ? existingItem.quantity : 0;
    const newQty = existingQty + 1;

    if (newQty > item.stock) {
        showError(`${item.name} Stock: ${item.stock}`);
        return;
    }

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        billItems.push({
            productId: item.id,
            barcode: item.barcode,
            name: item.name,
            price: item.sellingCost,
            quantity: 1,
            measure: item.unit || 'Unit',
            gstPercentage: item.gstPercentage,
            stock: item.stock // Optional for safety if needed later
        });
    }

    updateItemsTable();
    calculateTotals();
}


function showError(message) {
    const existingError = document.getElementById('search-error');
    if (existingError) existingError.remove();

    const errorDiv = document.createElement('div');
    errorDiv.id = 'search-error';
    errorDiv.textContent = message;
    errorDiv.style.color = '#e74c3c';
    errorDiv.style.fontSize = '14px';
    errorDiv.style.marginTop = '5px';
    document.querySelector('.search-container').appendChild(errorDiv);

    setTimeout(() => errorDiv.remove(), 3000);
}

function updateItemsTable() {
    const itemsBody = document.getElementById('itemsBody');
    itemsBody.innerHTML = '';

    billItems.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.barcode}</td>
            <td>${item.name}</td>
            <td><input type="number" value="${item.price.toFixed(2)}" min="0" step="0.01" onchange="updateItem(${index}, 'price', this.value)"></td>
            <td><input type="number" value="${item.quantity}" min="1" onchange="updateItem(${index}, 'quantity', this.value)"></td>
            <td>
                <select onchange="updateItem(${index}, 'measure', this.value)">
                    <option value="Unit" ${item.measure === 'Unit' ? 'selected' : ''}>Unit</option>
                    <option value="Kg" ${item.measure === 'Kg' ? 'selected' : ''}>Kg</option>
                    <option value="Liter" ${item.measure === 'Liter' ? 'selected' : ''}>Liter</option>
                </select>
            </td>
            <td><button class="btn btn-danger btn-sm" onclick="removeItem(${index})">Delete</button></td>
        `;
        itemsBody.appendChild(row);
    });
}

function updateItem(index, field, value) {
    if (field === 'price') {
        billItems[index].price = parseFloat(value) || 0;
    }

    if (field === 'quantity') {
        const newQuantity = parseInt(value) || 1;
        const maxStock = billItems[index].stock;

        if (newQuantity > maxStock) {
            showError(`${billItems[index].name} Stock limit is ${maxStock}`);
            // Reset to previous valid quantity
            updateItemsTable(); // Re-render the table to reset the incorrect input
            return;
        }

        billItems[index].quantity = newQuantity;
    }

    if (field === 'measure') {
        billItems[index].measure = value;
    }

    calculateTotals();
}


function removeItem(index) {
    billItems.splice(index, 1);
    updateItemsTable();
    calculateTotals();
}

function calculateTotals() {
    let cost = 0;
    let totalGST = 0;

    billItems.forEach(item => {
        const itemCost = item.price * item.quantity;
        cost += itemCost;
        totalGST += itemCost * (item.gstPercentage / 100);
    });

    const discount = parseFloat(document.getElementById('discount').value) || 0;
    const totalCost = ((cost - (cost * (discount / 100))) + totalGST);

    document.getElementById('cost').textContent = `$${cost.toFixed(2)}`;
    document.getElementById('gst').textContent = `$${totalGST.toFixed(2)}`;
    document.getElementById('totalCost').textContent = `$${totalCost.toFixed(2)}`;

    calculateChange();
}

function calculateChange() {
    const totalCost = parseFloat(document.getElementById('totalCost').textContent.replace('$', '')) || 0;
    const amountPaid = parseFloat(document.getElementById('amountPaid').value) || 0;
    const change = amountPaid - totalCost;
    document.getElementById('change').textContent = `$${change.toFixed(2)}`;
}

async function saveAndPrintBill() {
    if (billItems.length === 0) {
        alert('Please add at least one item to the bill.');
        return;
    }

    const totalCost = parseFloat(document.getElementById('totalCost').textContent.replace('$', '')) || 0;
    const amountPaid = parseFloat(document.getElementById('amountPaid').value) || 0;
    if (amountPaid < totalCost) {
        alert('Amount paid cannot be less than total cost.');
        return;
    }

    const bill = {
        totalItems: billItems.map(item => ({
            barcode: item.barcode,
            quantity: item.quantity,
            price: item.price,
            measure: item.measure,
        })),
        paymentMethod: document.getElementById('paymentMethod').value,
        discount: parseFloat(document.getElementById('discount').value) || 0,
        amountPaid: amountPaid,
        change: parseFloat(document.getElementById('change').textContent.replace('$', ''))
    };

    try {
        // Save bill to local DB
        await ipcRenderer.invoke('billing:saveBill', bill);

        // ipcRenderer.send('print-bill', {
        //     items: billItems,
        //     cost: parseFloat(document.getElementById('cost').textContent.replace('$', '')),
        //     discount: bill.discount,
        //     gst: parseFloat(document.getElementById('gst').textContent.replace('$', '')),
        //     totalCost: totalCost,
        //     paymentMethod: bill.paymentMethod,
        //     amountPaid: bill.amountPaid,
        //     change: bill.change
        // });

        resetBill();
        alert('Bill saved successfully!');
    } catch (error) {
        console.error('Error saving bill:', error);
        alert('Failed to save bill: ' + error.message);
    }
}

function resetBill() {
    billItems = [];
    document.getElementById('searchInput').value = '';
    document.getElementById('discount').value = '0';
    document.getElementById('amountPaid').value = '0';
    document.getElementById('paymentMethod').value = 'Cash';
    updateItemsTable();
    calculateTotals();
}
