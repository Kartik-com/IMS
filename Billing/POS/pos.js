const { ipcRenderer } = require('electron');

let inventory = [];
let customers = [];
let tabs = [
  {
    id: 'tab-1',
    billItems: [],
    discount: 0,
    amountPaid: 0,
    paymentMethod: 'Cash',
    customer: null,
  },
];
let activeTabId = 'tab-1';
let selectedSuggestionIndex = -1;
let selectedCustomerSuggestionIndex = -1;
let displayValue = '0';
let history = [];
let isHistoryVisible = false;

document.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.on('main-process-ready', () => {
    console.log('Received main-process-ready signal');
    loadInventory();
    loadCustomers();
    initializeEventListeners();
    renderTabs();
    switchTab('tab-1');
  });
});

async function loadInventory() {
  try {
    inventory = await ipcRenderer.invoke('inventory:getItems');
    const tab = tabs.find(t => t.id === activeTabId);
    updateItemsTable(tab.billItems);
  } catch (error) {
    console.error('Error loading inventory:', error.message, error.stack);
    alert(`Failed to load inventory: ${error.message}`);
  }
}

async function loadCustomers() {
  try {
    customers = await ipcRenderer.invoke('customers:getCustomers');
    updateCustomerUI(tabs.find(t => t.id === activeTabId));
  } catch (error) {
    console.error('Error loading customers:', error.message, error.stack);
    alert(`Failed to load customers: ${error.message}`);
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
        navigateTo('/Billing/BillingHistory/billingHistory.html');
        break;
      case 'F3':
        event.preventDefault();
        const calculatorModal = new bootstrap.Modal(document.getElementById('calculatorModal'), { backdrop: false });
        calculatorModal.show();
        updateDisplay();
        break;
      case 'F4':
        event.preventDefault();
        navigateTo('/Billing/Udhari/udhari.html');
        break;
      case 'F5':
        event.preventDefault();
        navigateTo('/Billing/Customers/customers.html');
        break;
      case 'F6':
        event.preventDefault();
        navigateTo('/Billing/Returns/returns.html');
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
    setTimeout(() => hideSuggestions(), 200);
  });

  const customerSearchInput = document.getElementById('customerSearchInput');
  customerSearchInput.addEventListener('keydown', handleCustomerSearchEnter);
  customerSearchInput.addEventListener('input', showCustomerSuggestions);
  customerSearchInput.addEventListener('keydown', handleCustomerSuggestionNavigation);
  customerSearchInput.addEventListener('blur', () => {
    setTimeout(() => hideCustomerSuggestions(), 200);
  });

  const amountPaidInput = document.getElementById('amountPaid');
  amountPaidInput.addEventListener('input', calculateChange);

  const paymentMethodSelect = document.getElementById('paymentMethod');
  paymentMethodSelect.addEventListener('change', handlePaymentMethodChange);
}

function handlePaymentMethodChange() {
  const paymentMethod = document.getElementById('paymentMethod').value;
  const amountPaidInput = document.getElementById('amountPaid');
  const changeSpan = document.getElementById('change');
  const tab = tabs.find(t => t.id === activeTabId);

  if (paymentMethod === 'Udhari') {
    amountPaidInput.value = 0;
    amountPaidInput.disabled = true;
    changeSpan.textContent = '₹0.00';
    tab.amountPaid = 0;
    tab.paymentMethod = 'Udhari';
  } else {
    amountPaidInput.disabled = false;
    tab.paymentMethod = paymentMethod;
    calculateChange();
  }
}

function openCalculator() {
  const calculatorModal = new bootstrap.Modal(document.getElementById('calculatorModal'), { backdrop: false });
  calculatorModal.show();
  updateDisplay();
}

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

function showCustomerSuggestions(event) {
  const query = event.target.value.trim().toLowerCase();
  const suggestionsContainer = document.getElementById('customerSuggestions');
  suggestionsContainer.innerHTML = '';

  if (!query) {
    suggestionsContainer.style.display = 'none';
    return;
  }

  const matches = customers.filter(customer =>
    customer.name.toLowerCase().includes(query) ||
    customer.mobile_number.includes(query) ||
    customer.id.toString().includes(query)
  );

  if (matches.length === 0) {
    suggestionsContainer.style.display = 'none';
    return;
  }

  matches.forEach((customer, index) => {
    const suggestion = document.createElement('div');
    suggestion.className = 'suggestion-item';
    suggestion.textContent = `${customer.name} (${customer.mobile_number})`;
    suggestion.dataset.index = index;
    suggestion.dataset.id = customer.id;
    suggestion.addEventListener('click', () => selectCustomerSuggestion(customer));
    suggestionsContainer.appendChild(suggestion);
  });

  suggestionsContainer.style.display = 'block';
  selectedCustomerSuggestionIndex = -1;
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
    searchInput.value = selectedItem.name;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
    updateSuggestionHighlight(suggestionItems);
    if (selectedSuggestionIndex >= 0) {
      const selectedItem = inventory.find(item => item.id == suggestionItems[selectedSuggestionIndex].dataset.id);
      searchInput.value = selectedItem.name;
    } else {
      searchInput.value = searchInput.value;
    }
  } else if (event.key === 'Enter' && selectedSuggestionIndex >= 0) {
    event.preventDefault();
    const selectedItem = inventory.find(item => item.id == suggestionItems[selectedSuggestionIndex].dataset.id);
    selectSuggestion(selectedItem);
  }
}

function handleCustomerSuggestionNavigation(event) {
  const suggestionsContainer = document.getElementById('customerSuggestions');
  const suggestionItems = suggestionsContainer.querySelectorAll('.suggestion-item');
  const searchInput = document.getElementById('customerSearchInput');

  if (suggestionItems.length === 0) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectedCustomerSuggestionIndex = Math.min(selectedCustomerSuggestionIndex + 1, suggestionItems.length - 1);
    updateCustomerSuggestionHighlight(suggestionItems);
    const selectedCustomer = customers.find(customer => customer.id == suggestionItems[selectedCustomerSuggestionIndex].dataset.id);
    searchInput.value = selectedCustomer.name;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedCustomerSuggestionIndex = Math.max(selectedCustomerSuggestionIndex - 1, -1);
    updateCustomerSuggestionHighlight(suggestionItems);
    if (selectedCustomerSuggestionIndex >= 0) {
      const selectedCustomer = customers.find(customer => customer.id == suggestionItems[selectedCustomerSuggestionIndex].dataset.id);
      searchInput.value = selectedCustomer.name;
    } else {
      searchInput.value = searchInput.value;
    }
  } else if (event.key === 'Enter' && selectedCustomerSuggestionIndex >= 0) {
    event.preventDefault();
    const selectedCustomer = customers.find(customer => customer.id == suggestionItems[selectedCustomerSuggestionIndex].dataset.id);
    selectCustomerSuggestion(selectedCustomer);
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

function updateCustomerSuggestionHighlight(suggestionItems) {
  suggestionItems.forEach((item, index) => {
    item.classList.toggle('active', index === selectedCustomerSuggestionIndex);
    if (index === selectedCustomerSuggestionIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

function selectSuggestion(item) {
  document.getElementById('searchInput').value = '';
  hideSuggestions();
  addOrUpdateItem(item);
}

function selectCustomerSuggestion(customer) {
  const tab = tabs.find(t => t.id === activeTabId);
  tab.customer = customer;
  document.getElementById('customerSearchInput').value = '';
  hideCustomerSuggestions();
  updateCustomerUI(tab);
}

function hideSuggestions() {
  const suggestionsContainer = document.getElementById('suggestions');
  suggestionsContainer.style.display = 'none';
  selectedSuggestionIndex = -1;
}

function hideCustomerSuggestions() {
  const suggestionsContainer = document.getElementById('customerSuggestions');
  suggestionsContainer.style.display = 'none';
  selectedCustomerSuggestionIndex = -1;
}

function createNewTab() {
  const newTabId = `tab-${Date.now()}`;
  tabs.push({
    id: newTabId,
    billItems: [],
    discount: 0,
    amountPaid: 0,
    paymentMethod: 'Cash',
    customer: null,
  });
  renderTabs();
  switchTab(newTabId);
  document.getElementById('searchInput').focus();
}

function switchTab(tabId) {
  activeTabId = tabId;
  renderTabs();
  const tab = tabs.find(t => t.id === tabId);
  updateUI(tab);
  document.getElementById('searchInput').focus();
}

function closeTab(tabId) {
  if (tabs.length === 1) return;
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
    const customerName = tab.customer ? tab.customer.name : 'Customer';
    tabElement.className = `tab ${tab.id === activeTabId ? 'active' : ''}`;
    tabElement.innerHTML = `
      ${customerName} ${tabs.indexOf(tab) + 1}
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
  updateCustomerUI(tab);
  calculateTotals();
}

function updateCustomerUI(tab) {
  const customerName = document.getElementById('customerName');
  const customerMobile = document.getElementById('customerMobile');
  const customerUdhari = document.getElementById('customerUdhari');

  if (tab.customer) {
    customerName.textContent = tab.customer.name;
    customerMobile.textContent = tab.customer.mobile_number;
    customerUdhari.textContent = `₹${tab.customer.udhari.toFixed(2)}`;
  } else {
    customerName.textContent = 'Unknown';
    customerMobile.textContent = '-';
    customerUdhari.textContent = '₹0.00';
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
    hideSuggestions();
  } else {
    showError('Product not found in inventory!');
    event.target.value = '';
    hideSuggestions();
  }
}

function handleCustomerSearchEnter(event) {
  if (event.key !== 'Enter') return;
  const searchTerm = event.target.value.trim().toLowerCase();
  if (!searchTerm) return;
  const matchedCustomer = customers.find(customer =>
    customer.name.toLowerCase() === searchTerm ||
    customer.mobile_number === searchTerm ||
    customer.id.toString() === searchTerm
  );
  if (matchedCustomer) {
    const tab = tabs.find(t => t.id === activeTabId);
    tab.customer = matchedCustomer;
    event.target.value = '';
    hideCustomerSuggestions();
    updateCustomerUI(tab);
    renderTabs();
  } else {
    showError('Customer not found!');
    event.target.value = '';
    hideCustomerSuggestions();
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
      stock: item.stock,
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
  
    const discountInput = parseFloat(document.getElementById('discount').value) || 0;
    const isPercentage = document.getElementById('discountType').checked;
  
    // Apply discount
    let discount = 0;
    if (isPercentage) {
      discount = (cost * discountInput) / 100; // Percentage discount
    } else {
      discount = discountInput; // Amount discount
    }
  
    // Ensure discount doesn't exceed subtotal
    discount = Math.min(discount, cost);
    tab.discount = discount;
  
    // Calculate total
    const taxableAmount = cost - discount;
    const totalCost = taxableAmount + totalGST;
  
    // Update UI
    document.getElementById('cost').textContent = `₹${cost.toFixed(2)}`;
    document.getElementById('gst').textContent = `₹${totalGST.toFixed(2)}`;
    document.getElementById('totalCost').textContent = `₹${totalCost.toFixed(2)}`;
  
    calculateChange();
}

function calculateChange() {
  const tab = tabs.find(t => t.id === activeTabId);
  const paymentMethod = document.getElementById('paymentMethod').value;

  if (paymentMethod === 'Udhari') {
    document.getElementById('change').textContent = '₹0.00';
    tab.amountPaid = 0;
    return;
  }

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
  const paymentMethod = document.getElementById('paymentMethod').value;

  const bill = {
    customer_id: tab.customer ? tab.customer.id : null,
    totalItems: tab.billItems.map(item => ({
      id: item.productId,
      barcode: item.barcode,
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity,
      measure: item.measure,
    })),
    paymentMethod: paymentMethod,
    discount: tab.discount,
    totalCost: totalCost,
    amountPaid: amountPaid,
    change: amountPaid >= totalCost ? amountPaid - totalCost : 0,
    isDebt: amountPaid < totalCost,
  };

  if (amountPaid < totalCost) {
    if (!tab.customer) {
      alert('A customer must be selected to save a bill on credit (udhari).');
      return;
    }
    try {
      const confirmUdhari = await confirmUdhariPrompt(totalCost - amountPaid);
      if (!confirmUdhari) {
        console.log('Udhari confirmation cancelled');
        return;
      }
    } catch (error) {
      console.error('Error in udhari confirmation:', error.message, error.stack);
      alert('Failed to confirm udhari. Please try again.');
      return;
    }
  }

  try {
    console.log('Saving bill:', bill);
    const result = await ipcRenderer.invoke('billing:saveBill', bill);
    if (result.success) {
      // Only print for non-udhari payments
      if (paymentMethod !== 'Udhari') {
        console.log('Sending print-bill event');
        ipcRenderer.send('print-bill', {
          items: tab.billItems,
          cost: parseFloat(document.getElementById('cost').textContent.replace('₹', '')),
          discount: tab.discount,
          gst: parseFloat(document.getElementById('gst').textContent.replace('₹', '')),
          totalCost: totalCost,
          paymentMethod: paymentMethod,
          amountPaid: amountPaid,
          change: bill.change,
        });
      }
      resetBill();
      if (tabs.length > 1) {
        closeTab(activeTabId);
      }
      alert('Bill saved successfully!');
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error saving bill:', error.message, error.stack);
    alert(`Failed to save bill: ${error.message}`);
  }
}

function confirmUdhariPrompt(debtAmount) {
  return new Promise((resolve, reject) => {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Confirm Udhari</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p>The customer will owe ₹${debtAmount.toFixed(2)} as udhari. Do you want to proceed?</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" id="confirmUdhari">Confirm</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal, { backdrop: 'static' });
    bsModal.show();

    const confirmButton = modal.querySelector('#confirmUdhari');
    const cancelButton = modal.querySelector('.btn-secondary');
    const closeButton = modal.querySelector('.btn-close');

    confirmButton.addEventListener('click', () => {
      bsModal.hide();
      resolve(true);
    });

    cancelButton.addEventListener('click', () => {
      bsModal.hide();
      resolve(false);
    });

    closeButton.addEventListener('click', () => {
      bsModal.hide();
      resolve(false);
    });

    modal.addEventListener('hidden.bs.modal', () => {
      modal.remove();
      // Ensure the Promise resolves if modal is closed without action
      if (!modal.dataset.resolved) {
        resolve(false);
      }
    });

    // Timeout to prevent hanging
    setTimeout(() => {
      if (modal.isConnected) {
        bsModal.hide();
        reject(new Error('Udhari confirmation timed out'));
      }
    }, 30000); // 30 seconds timeout
  });
}

function resetBill() {
  const tab = tabs.find(t => t.id === activeTabId);
  tab.billItems = [];
  tab.discount = 0;
  tab.amountPaid = 0;
  tab.paymentMethod = 'Cash';
  tab.customer = null;
  updateUI(tab);
}

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
  if (operators.includes(value)) {
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
  if (displayValue === 'Error') {
    setTimeout(() => {
      displayValue = '0';
      updateDisplay();
    }, 2000);
  }
}