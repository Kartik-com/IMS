const { ipcRenderer } = require('electron');

let inventory = [];
let billItems = [];
let displayValue = '0';
let history = [];
let isHistoryVisible = false;

// Load inventory and initialize calculator when the page loads
document.addEventListener('DOMContentLoaded', () => {
    loadInventory();
    document.getElementById('searchInput').addEventListener('keydown', handleSearchEnter);
    // Add keypress listener for F1 to open calculator modal
    document.addEventListener('keydown', (event) => {
        if (event.key === 'F1') {
            event.preventDefault(); // Prevent default F1 behavior (e.g., browser help)
            const calculatorModal = new bootstrap.Modal(document.getElementById('calculatorModal'), { backdrop: false });
            calculatorModal.show();
            updateDisplay();
        }
    });
    // Add numpad support for calculator when modal is open
    document.addEventListener('keydown', (event) => {
        const calculatorModal = document.getElementById('calculatorModal');
        if (calculatorModal.classList.contains('show')) {
            const key = event.key;
            if (/^[0-9]$/.test(key)) {
                appendToDisplay(key);
            } else if (key === 'Enter' || key === '=') {
                calculateResult();
            } else if (key === 'Backspace') {
                backspace();
            } else if (key === '.') {
                appendToDisplay('.');
            } else if (key === '+') {
                appendToDisplay('+');
            } else if (key === '-') {
                appendToDisplay('-');
            } else if (key === '*') {
                appendToDisplay('*');
            } else if (key === '/') {
                appendToDisplay('/');
            } else if (key === '%') {
                appendToDisplay('%');
            } else if (key === 'Escape') {
                clearDisplay();
            }
            event.preventDefault();
        }
    });
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
            stock: item.stock
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
            updateItemsTable();
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
        await ipcRenderer.invoke('billing:saveBill', bill);
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

// Calculator Functions
function updateDisplay() {
    document.getElementById('calcDisplay').value = displayValue;
}

function updateHistory() {
    const historyList = document.getElementById('calcHistory');
    historyList.innerHTML = '';
    history.slice(-5).reverse().forEach(entry => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.textContent = entry;
        historyList.appendChild(li);
    });
}

function toggleHistory() {
    isHistoryVisible = !isHistoryVisible;
    const historyBlock = document.getElementById('calcHistoryBlock');
    historyBlock.style.display = isHistoryVisible ? 'block' : 'none';
    if (isHistoryVisible) {
        updateHistory();
    }
}

function clearDisplay() {
    displayValue = '0';
    updateDisplay();
}

function backspace() {
    if (displayValue.length > 1) {
        displayValue = displayValue.slice(0, -1);
    } else {
        displayValue = '0';
    }
    updateDisplay();
}

function appendToDisplay(value) {
    const operators = ['+', '-', '*', '/'];
    // Check if the new value is an operator
    if (operators.includes(value)) {
        // If the last character is also an operator, replace it
        if (operators.includes(displayValue.slice(-1))) {
            displayValue = displayValue.slice(0, -1) + value;
        } else {
            displayValue += value;
        }
    } else {
        if (displayValue === '0' && value !== '.') {
            displayValue = value;
        } else {
            displayValue += value;
        }
    }
    updateDisplay();
}

function calculateResult() {
    try {
        let expression = displayValue;
        if (expression.includes('%')) {
            expression = expression.replace(/(\d+)%/g, (match, num) => `(${num}/100)`);
        }
        const result = eval(expression).toString();
        if (result === 'Infinity' || result === 'NaN') {
            displayValue = 'Error';
        } else {
            history.push(`${displayValue} = ${result}`);
            displayValue = result;
        }
    } catch (error) {
        displayValue = 'Error';
    }
    updateDisplay();
    if (isHistoryVisible) {
        updateHistory();
    }
}