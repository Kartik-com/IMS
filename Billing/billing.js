const { ipcRenderer } = require('electron');

let inventory = [];
let tabs = [
    {
        id: 'tab-1',
        billItems: [],
        discount: 0,
        amountPaid: 0,
        paymentMethod: 'Cash'
    }
];
let activeTabId = 'tab-1';
let selectedSuggestionIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
    loadInventory();
    initializeEventListeners();
    renderTabs();
    switchTab('tab-1');
});

async function loadInventory() {
    try {
        inventory = await ipcRenderer.invoke('inventory:getItems');
        const tab = tabs.find(t => t.id === activeTabId);
        updateItemsTable(tab.billItems);
    } catch (error) {
        console.error('Error loading inventory:', error);
        alert('Failed to load inventory.');
    }
}

function initializeEventListeners() {
    document.addEventListener('keydown', (event) => {
        switch (event.key) {
            case 'F1':
                event.preventDefault();
                createNewTab();
                break;
            case 'F2':
                event.preventDefault();
                navigateTo('billing_history.html');
                break;
            case 'F4':
                event.preventDefault();
                navigateTo('udhari.html');
                break;
            case 'F5':
                event.preventDefault();
                navigateTo('customers.html');
                break;
            case 'F6':
                event.preventDefault();
                navigateTo('returns.html');
                break;
            case 'F7':
                event.preventDefault();
                saveAndPrintBill();
                break;
            case 'F8':
                event.preventDefault();
                navigateTo('index.html');
                break;
        }
    });

    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keydown', handleSearchEnter);
    searchInput.addEventListener('input', showSuggestions);
    searchInput.addEventListener('keydown', handleSuggestionNavigation);
    searchInput.addEventListener('blur', () => {
        setTimeout(() => hideSuggestions(), 200); // Delay to allow click
    });
}

function navigateTo(page) {
    ipcRenderer.send('navigate-to', page);
}

function showSuggestions(event) {
    const query = event.target.value.trim().toLowerCase();
    const suggestionsContainer = document.getElementById('suggestions');
    suggestionsContainer.innerHTML = '';

    if (!query) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    const matches = inventory.filter(item =>
        item.barcode.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query)
    );

    if (matches.length === 0) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    matches.forEach((item, index) => {
        const suggestion = document.createElement('div');
        suggestion.className = 'suggestion-item';
        suggestion.textContent = `${item.name} (${item.barcode})`;
        suggestion.dataset.index = index;
        suggestion.dataset.id = item.id;
        suggestion.addEventListener('click', () => selectSuggestion(item));
        suggestionsContainer.appendChild(suggestion);
    });

    suggestionsContainer.style.display = 'block';
    selectedSuggestionIndex = -1;
}

function handleSuggestionNavigation(event) {
    const suggestionsContainer = document.getElementById('suggestions');
    const suggestionItems = suggestionsContainer.querySelectorAll('.suggestion-item');
    const searchInput = document.getElementById('searchInput');

    if (suggestionItems.length === 0) return;

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestionItems.length - 1);
        updateSuggestionHighlight(suggestionItems);
        const selectedItem = inventory.find(item => item.id == suggestionItems[selectedSuggestionIndex].dataset.id);
        searchInput.value = selectedItem.name; // Update input with selected item's name
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        updateSuggestionHighlight(suggestionItems);
        if (selectedSuggestionIndex >= 0) {
            const selectedItem = inventory.find(item => item.id == suggestionItems[selectedSuggestionIndex].dataset.id);
            searchInput.value = selectedItem.name; // Update input with selected item's name
        } else {
            searchInput.value = searchInput.value; // Retain current input if no suggestion is selected
        }
    } else if (event.key === 'Enter' && selectedSuggestionIndex >= 0) {
        event.preventDefault();
        const selectedItem = inventory.find(item => item.id == suggestionItems[selectedSuggestionIndex].dataset.id);
        selectSuggestion(selectedItem);
    }
}

function updateSuggestionHighlight(suggestionItems) {
    suggestionItems.forEach((item, index) => {
        item.classList.toggle('active', index === selectedSuggestionIndex);
        if (index === selectedSuggestionIndex) {
            item.scrollIntoView({ block: 'nearest' });
        }
    });
}

function selectSuggestion(item) {
    document.getElementById('searchInput').value = '';
    hideSuggestions();
    addOrUpdateItem(item);
}

function hideSuggestions() {
    const suggestionsContainer = document.getElementById('suggestions');
    suggestionsContainer.style.display = 'none';
    selectedSuggestionIndex = -1;
}

function createNewTab() {
    const newTabId = `tab-${Date.now()}`;
    tabs.push({
        id: newTabId,
        billItems: [],
        discount: 0,
        amountPaid: 0,
        paymentMethod: 'Cash'
    });
    renderTabs();
    switchTab(newTabId);
}

function switchTab(tabId) {
    activeTabId = tabId;
    renderTabs();
    const tab = tabs.find(t => t.id === tabId);
    updateUI(tab);
}

function closeTab(tabId) {
    if (tabs.length === 1) return; // Prevent closing the last tab
    tabs = tabs.filter(t => t.id !== tabId);
    if (activeTabId === tabId) {
        switchTab(tabs[0].id);
    } else {
        renderTabs();
    }
}

function renderTabs() {
    const tabsContainer = document.getElementById('tabs');
    tabsContainer.innerHTML = '';
    tabs.forEach(tab => {
        const tabElement = document.createElement('div');
        tabElement.className = `tab ${tab.id === activeTabId ? 'active' : ''}`;
        tabElement.innerHTML = `
            Customer ${tabs.indexOf(tab) + 1}
            ${tabs.length > 1 ? `<i class="fas fa-times tab-close" onclick="closeTab('${tab.id}')"></i>` : ''}
        `;
        tabElement.onclick = () => switchTab(tab.id);
        tabsContainer.appendChild(tabElement);
    });
}

function updateUI(tab) {
    document.getElementById('searchInput').value = '';
    document.getElementById('discount').value = tab.discount;
    document.getElementById('amountPaid').value = tab.amountPaid;
    document.getElementById('paymentMethod').value = tab.paymentMethod;
    updateItemsTable(tab.billItems);
    calculateTotals();
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
        hideSuggestions();
    } else {
        showError('Product not found in inventory!');
        event.target.value = '';
        hideSuggestions();
    }
}

function addOrUpdateItem(item) {
    const tab = tabs.find(t => t.id === activeTabId);
    const existingItem = tab.billItems.find(billItem => billItem.productId === item.id);

    const existingQty = existingItem ? existingItem.quantity : 0;
    const newQty = existingQty + 1;

    if (newQty > item.stock) {
        showError(`${item.name} Stock: ${item.stock}`);
        return;
    }

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        tab.billItems.push({
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

    updateItemsTable(tab.billItems);
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

function updateItemsTable(billItems) {
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
    const tab = tabs.find(t => t.id === activeTabId);
    if (field === 'price') {
        tab.billItems[index].price = parseFloat(value) || 0;
    }

    if (field === 'quantity') {
        const newQuantity = parseInt(value) || 1;
        const maxStock = tab.billItems[index].stock;

        if (newQuantity > maxStock) {
            showError(`${tab.billItems[index].name} Stock limit is ${maxStock}`);
            updateItemsTable(tab.billItems);
            return;
        }

        tab.billItems[index].quantity = newQuantity;
    }

    if (field === 'measure') {
        tab.billItems[index].measure = value;
    }

    calculateTotals();
}

function removeItem(index) {
    const tab = tabs.find(t => t.id === activeTabId);
    tab.billItems.splice(index, 1);
    updateItemsTable(tab.billItems);
    calculateTotals();
}

function calculateTotals() {
    const tab = tabs.find(t => t.id === activeTabId);
    let cost = 0;
    let totalGST = 0;

    tab.billItems.forEach(item => {
        const itemCost = item.price * item.quantity;
        cost += itemCost;
        totalGST += itemCost * (item.gstPercentage / 100);
    });

    const discount = parseFloat(document.getElementById('discount').value) || 0;
    tab.discount = discount;
    const totalCost = ((cost - (cost * (discount / 100))) + totalGST);

    document.getElementById('cost').textContent = `₹${cost.toFixed(2)}`;
    document.getElementById('gst').textContent = `₹${totalGST.toFixed(2)}`;
    document.getElementById('totalCost').textContent = `₹${totalCost.toFixed(2)}`;

    calculateChange();
}

function calculateChange() {
    const tab = tabs.find(t => t.id === activeTabId);
    const totalCost = parseFloat(document.getElementById('totalCost').textContent.replace('₹', '')) || 0;
    const amountPaid = parseFloat(document.getElementById('amountPaid').value) || 0;
    tab.amountPaid = amountPaid;
    const change = amountPaid - totalCost;
    document.getElementById('change').textContent = `₹${change.toFixed(2)}`;
}

async function saveAndPrintBill() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab.billItems.length === 0) {
        alert('Please add at least one item to the bill.');
        return;
    }

    const totalCost = parseFloat(document.getElementById('totalCost').textContent.replace('₹', '')) || 0;
    const amountPaid = parseFloat(document.getElementById('amountPaid').value) || 0;
    if (amountPaid < totalCost) {
        alert('Amount paid cannot be less than total cost.');
        return;
    }

    const bill = {
        totalItems: tab.billItems.map(item => ({
            barcode: item.barcode,
            quantity: item.quantity,
            price: item.price,
            measure: item.measure,
        })),
        paymentMethod: document.getElementById('paymentMethod').value,
        discount: tab.discount,
        amountPaid: amountPaid,
        change: parseFloat(document.getElementById('change').textContent.replace('₹', ''))
    };

    try {
        await ipcRenderer.invoke('billing:saveBill', bill);
        resetBill();
        if (tabs.length > 1) {
            closeTab(activeTabId);
        }
        alert('Bill saved successfully!');
    } catch (error) {
        console.error('Error saving bill:', error);
        alert('Failed to save bill: ' + error.message);
    }
}

function resetBill() {
    const tab = tabs.find(t => t.id === activeTabId);
    tab.billItems = [];
    tab.discount = 0;
    tab.amountPaid = 0;
    tab.paymentMethod = 'Cash';
    updateUI(tab);
}