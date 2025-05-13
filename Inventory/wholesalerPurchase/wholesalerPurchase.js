const { ipcRenderer } = require('electron');

let inventory = [];
let wholesalers = [];
let tabs = [
  {
    id: 'tab-1',
    purchaseItems: [],
    discount: 0,
    amountPaid: 0,
    paymentMethod: 'Cash',
    wholesaler: null,
    invoiceNumber: '',
  },
];
let activeTabId = 'tab-1';
let selectedWholesalerSuggestionIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM content loaded, initializing wholesaler purchase');
  loadInventory();
  loadWholesalers();
  initializeEventListeners();
  renderTabs();
  switchTab('tab-1');
});

async function loadInventory() {
  try {
    const tab = tabs.find(t => t.id === activeTabId);
    const wholesalerId = tab.wholesaler?.id || 0;
    inventory = await ipcRenderer.invoke('wholesalers:getWholesalerItems', wholesalerId);
    console.log('Loaded inventory:', inventory);
    updateItemsTable(tab.purchaseItems);
  } catch (error) {
    console.error('Error loading inventory:', error.message, error.stack);
    alert(`Failed to load inventory: ${error.message}`);
  }
}

async function loadWholesalers() {
  try {
    wholesalers = await ipcRenderer.invoke('wholesalers:getWholesalers');
    console.log('Loaded wholesalers:', wholesalers);
    updateWholesalerUI(tabs.find(t => t.id === activeTabId));
  } catch (error) {
    console.error('Error loading wholesalers:', error.message, error.stack);
    alert(`Failed to load wholesalers: ${error.message}`);
  }
}

function initializeEventListeners() {
  // Wholesaler search
  const wholesalerSearchInput = document.getElementById('wholesalerSearchInput');
  wholesalerSearchInput.addEventListener('input', handleWholesalerSearch);
  wholesalerSearchInput.addEventListener('keydown', handleWholesalerSearchKeydown);

  // Payment inputs
  document.getElementById('amountPaid').addEventListener('input', calculateTotals);
  document.getElementById('paymentMethod').addEventListener('change', handlePaymentMethodChange);

  // Item form submission
  document.getElementById('addItemForm').addEventListener('submit', handleAddItem);

  // Barcode auto-fill
  const barcodeInput = document.getElementById('itemBarcode');
  if (barcodeInput) {
    barcodeInput.addEventListener('blur', handleBarcodeBlur);
  } else {
    console.error('Barcode input element not found');
  }
}

function handleWholesalerSearch() {
  const query = document.getElementById('wholesalerSearchInput').value.toLowerCase();
  const suggestions = document.getElementById('wholesalerSuggestions');
  suggestions.innerHTML = '';
  selectedWholesalerSuggestionIndex = -1;

  if (query.length > 0) {
    const filteredWholesalers = wholesalers.filter(w =>
      w.name.toLowerCase().includes(query) || w.contact_number.includes(query)
    );
    console.log('Filtered wholesalers:', filteredWholesalers);
    filteredWholesalers.forEach((wholesaler, index) => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.innerText = `${wholesaler.name} (${wholesaler.contact_number})`;
      div.dataset.index = index;
      div.dataset.wholesaler = JSON.stringify(wholesaler);
      div.addEventListener('click', () => selectWholesaler(wholesaler));
      suggestions.appendChild(div);
    });
    suggestions.style.display = filteredWholesalers.length > 0 ? 'block' : 'none';
  } else {
    suggestions.style.display = 'none';
  }
}

function handleWholesalerSearchKeydown(event) {
  const suggestions = document.getElementById('wholesalerSuggestions').children;
  if (suggestions.length === 0) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectedWholesalerSuggestionIndex = Math.min(selectedWholesalerSuggestionIndex + 1, suggestions.length - 1);
    updateWholesalerSuggestionHighlight(suggestions, selectedWholesalerSuggestionIndex);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedWholesalerSuggestionIndex = Math.max(selectedWholesalerSuggestionIndex - 1, -1);
    updateWholesalerSuggestionHighlight(suggestions, selectedWholesalerSuggestionIndex);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (selectedWholesalerSuggestionIndex >= 0) {
      const wholesaler = JSON.parse(suggestions[selectedWholesalerSuggestionIndex].dataset.wholesaler);
      selectWholesaler(wholesaler);
    }
  }
}

function updateWholesalerSuggestionHighlight(suggestions, index) {
  Array.from(suggestions).forEach((s, i) => {
    s.classList.toggle('active', i === index);
  });
}

function selectWholesaler(wholesaler) {
  const tab = tabs.find(t => t.id === activeTabId);
  tab.wholesaler = wholesaler;
  updateWholesalerUI(tab);
  document.getElementById('wholesalerSearchInput').value = '';
  document.getElementById('wholesalerSuggestions').style.display = 'none';
  loadInventory();
}

function updateWholesalerUI(tab) {
  const wholesalerName = document.getElementById('wholesalerName');
  const wholesalerContact = document.getElementById('wholesalerContact');
  const wholesalerUdhari = document.getElementById('wholesalerUdhari');
  if (tab.wholesaler) {
    wholesalerName.innerText = tab.wholesaler.name;
    wholesalerContact.innerText = tab.wholesaler.contact_number;
    wholesalerUdhari.innerText = `₹${(tab.wholesaler.udhari || 0).toFixed(2)}`;
  } else {
    wholesalerName.innerText = 'Unknown';
    wholesalerContact.innerText = '-';
    wholesalerUdhari.innerText = '₹0.00';
  }
}

async function handleBarcodeBlur(event) {
  const barcode = event.target.value.trim();
  if (!barcode) {
    console.log('No barcode entered, skipping auto-fill');
    return;
  }

  console.log('Barcode entered:', barcode);
  try {
    const item = await ipcRenderer.invoke('inventory:getItemByBarcode', barcode);
    console.log('Item fetched from database:', item);

    // Verify DOM elements exist
    const fields = {
      itemName: document.getElementById('itemName'),
      itemBuyingCost: document.getElementById('itemBuyingCost'),
      itemSellingCost: document.getElementById('itemSellingCost'),
      itemMRP: document.getElementById('itemMRP'),
      itemGST: document.getElementById('itemGST'),
      itemUnit: document.getElementById('itemUnit'),
    };

    for (const [fieldName, element] of Object.entries(fields)) {
      if (!element) {
        console.error(`Field element not found: ${fieldName}`);
        return;
      }
    }

    if (item) {
      fields.itemName.value = item.name || '';
      fields.itemBuyingCost.value = typeof item.buyingCost === 'number' ? item.buyingCost.toFixed(2) : '';
      fields.itemSellingCost.value = typeof item.sellingCost === 'number' ? item.sellingCost.toFixed(2) : '';
      fields.itemMRP.value = typeof item.MRP === 'number' ? item.MRP.toFixed(2) : '';
      fields.itemGST.value = typeof item.gstPercentage === 'number' ? item.gstPercentage.toFixed(2) : '';
      fields.itemUnit.value = item.unit || 'unit';
    } else {
      console.log('No item found for barcode:', barcode);
      // Clear fields if no item is found
      fields.itemName.value = '';
      fields.itemBuyingCost.value = '';
      fields.itemSellingCost.value = '';
      fields.itemMRP.value = '';
      fields.itemGST.value = '';
      fields.itemUnit.value = 'unit';
    }
  } catch (error) {
    console.error('Error in handleBarcodeBlur:', {
      message: error.message,
      stack: error.stack,
      barcode: barcode,
    });
    alert(`Failed to fetch item for barcode ${barcode}: ${error.message}`);
  }
}

function handleAddItem(event) {
  event.preventDefault();
  const tab = tabs.find(t => t.id === activeTabId);
  const barcode = document.getElementById('itemBarcode').value.trim();
  const name = document.getElementById('itemName').value.trim();
  const buyingCost = parseFloat(document.getElementById('itemBuyingCost').value) || 0;
  const sellingCost = parseFloat(document.getElementById('itemSellingCost').value) || 0;
  const mrp = parseFloat(document.getElementById('itemMRP').value) || 0;
  const gstPercentage = parseFloat(document.getElementById('itemGST').value) || 0;
  const quantity = parseInt(document.getElementById('itemQuantity').value) || 1;
  const unit = document.getElementById('itemUnit').value.trim() || 'unit';

  if (!barcode || !name || quantity <= 0) {
    alert('Please fill in all required fields (Barcode, Name, Quantity).');
    return;
  }

  const existingItem = tab.purchaseItems.find(i => i.barcode === barcode);
  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.total = existingItem.quantity * existingItem.buying_cost;
  } else {
    tab.purchaseItems.push({
      id: null,
      barcode,
      name,
      buying_cost: buyingCost,
      selling_cost: sellingCost,
      mrp,
      gst_percentage: gstPercentage,
      quantity,
      unit,
      total: quantity * buyingCost,
    });
  }

  updateItemsTable(tab.purchaseItems);
  document.getElementById('addItemForm').reset();
  calculateTotals();
}

function updateItemsTable(items) {
  const tbody = document.getElementById('itemsBody');
  tbody.innerHTML = '';
  items.forEach((item, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.barcode}</td>
      <td>${item.name}</td>
      <td><input type="number" value="${item.buying_cost.toFixed(2)}" min="0" step="0.01" class="form-control form-control-sm" onchange="updateItem(${index}, 'buying_cost', this.value)"></td>
      <td><input type="number" value="${item.selling_cost.toFixed(2)}" min="0" step="0.01" class="form-control form-control-sm" onchange="updateItem(${index}, 'selling_cost', this.value)"></td>
      <td><input type="number" value="${item.mrp.toFixed(2)}" min="0" step="0.01" class="form-control form-control-sm" onchange="updateItem(${index}, 'mrp', this.value)"></td>
      <td><input type="number" value="${item.gst_percentage.toFixed(2)}" min="0" step="0.01" class="form-control form-control-sm" onchange="updateItem(${index}, 'gst_percentage', this.value)"></td>
      <td><input type="number" value="${item.quantity}" min="1" step="1" class="form-control form-control-sm" onchange="updateItem(${index}, 'quantity', this.value)"></td>
      <td><input type="text" value="${item.unit}" class="form-control form-control-sm" onchange="updateItem(${index}, 'unit', this.value)"></td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteItem(${index})"><i class="fas fa-trash"></i></button></td>
    `;
    tbody.appendChild(row);
  });
  calculateTotals();
}

function updateItem(index, field, value) {
  const tab = tabs.find(t => t.id === activeTabId);
  const item = tab.purchaseItems[index];
  item[field] = field === 'quantity' ? parseInt(value) : parseFloat(value) || 0;
  if (field === 'quantity' || field === 'buying_cost') {
    item.total = item.quantity * item.buying_cost;
  }
  updateItemsTable(tab.purchaseItems);
}

function deleteItem(index) {
  const tab = tabs.find(t => t.id === activeTabId);
  tab.purchaseItems.splice(index, 1);
  updateItemsTable(tab.purchaseItems);
}

function calculateTotals() {
  const tab = tabs.find(t => t.id === activeTabId);
  let cost = 0;
  let gst = 0;
  tab.purchaseItems.forEach(item => {
    cost += item.total;
    gst += (item.total * (item.gst_percentage / 100));
  });

  const discountInput = document.getElementById('discount').value || 0;
  const isPercentage = document.getElementById('discountType').checked;
  let discount = parseFloat(discountInput);
  if (isPercentage) {
    discount = (cost * discount) / 100;
  }
  tab.discount = discount;

  const totalCost = cost + gst - discount;
  tab.amountPaid = parseFloat(document.getElementById('amountPaid').value) || 0;
  const balance = totalCost - tab.amountPaid;

  document.getElementById('cost').innerText = `₹${cost.toFixed(2)}`;
  document.getElementById('gst').innerText = `₹${gst.toFixed(2)}`;
  document.getElementById('totalCost').innerText = `₹${totalCost.toFixed(2)}`;
  document.getElementById('balance').innerText = `₹${balance.toFixed(2)}`;
}

function handlePaymentMethodChange() {
  const paymentMethod = document.getElementById('paymentMethod').value;
  const amountPaidInput = document.getElementById('amountPaid');
  const tab = tabs.find(t => t.id === activeTabId);
  tab.paymentMethod = paymentMethod;
  if (paymentMethod === 'Udhari') {
    amountPaidInput.value = '0';
    amountPaidInput.disabled = true;
    tab.amountPaid = 0;
  } else {
    amountPaidInput.disabled = false;
  }
  calculateTotals();
}

async function savePurchase() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab.wholesaler) {
    alert('Please select a wholesaler');
    return;
  }
  if (tab.purchaseItems.length === 0) {
    alert('Please add at least one item');
    return;
  }

  // Check if amountPaid is 0 and paymentMethod is not Udhari
  if (tab.amountPaid === 0 && tab.paymentMethod !== 'Udhari') {
    const confirmUdhari = confirm('No payment has been made. Do you want to proceed with this purchase as Udhari?');
    if (confirmUdhari) {
      tab.paymentMethod = 'Udhari';
      document.getElementById('paymentMethod').value = 'Udhari';
      document.getElementById('amountPaid').value = '0';
      document.getElementById('amountPaid').disabled = true;
      tab.amountPaid = 0;
    } else {
      return; // Exit if user cancels
    }
  }

  const purchaseData = {
    wholesaler_id: tab.wholesaler.id,
    invoice_number: document.getElementById('invoiceNumber').value || null,
    totalItems: tab.purchaseItems,
    totalCost: parseFloat(document.getElementById('totalCost').innerText.replace('₹', '')),
    discount: tab.discount,
    amountPaid: tab.amountPaid,
    paymentMethod: tab.paymentMethod,
    isDebt: tab.paymentMethod === 'Udhari',
    purchase_date: new Date().toISOString(),
  };

  try {
    const result = await ipcRenderer.invoke('wholesalerPurchases:savePurchase', purchaseData);
    if (result.success) {
      alert('Purchase saved successfully!');
      resetTab();
      updateItemsTable([]);
      calculateTotals();
      loadWholesalers();
    } else {
      alert(`Failed to save purchase: ${result.error}`);
    }
  } catch (error) {
    console.error('Error saving purchase:', error.message, error.stack);
    alert(`Failed to save purchase: ${error.message}`);
  }
}

function resetTab() {
  const tab = tabs.find(t => t.id === activeTabId);
  tab.purchaseItems = [];
  tab.discount = 0;
  tab.amountPaid = 0;
  tab.paymentMethod = 'Cash';
  tab.wholesaler = null;
  tab.invoiceNumber = '';
  document.getElementById('wholesalerSearchInput').value = '';
  document.getElementById('discount').value = '';
  document.getElementById('amountPaid').value = '0';
  document.getElementById('paymentMethod').value = 'Cash';
  document.getElementById('invoiceNumber').value = '';
  updateWholesalerUI(tab);
}

function createNewTab() {
  const newTabId = `tab-${tabs.length + 1}`;
  tabs.push({
    id: newTabId,
    purchaseItems: [],
    discount: 0,
    amountPaid: 0,
    paymentMethod: 'Cash',
    wholesaler: null,
    invoiceNumber: '',
  });
  renderTabs();
  switchTab(newTabId);
}

function switchTab(tabId) {
  activeTabId = tabId;
  const tab = tabs.find(t => t.id === tabId);
  renderTabs();
  updateItemsTable(tab.purchaseItems);
  updateWholesalerUI(tab);
  document.getElementById('wholesalerSearchInput').value = '';
  document.getElementById('wholesalerSuggestions').style.display = 'none';
  document.getElementById('discount').value = tab.discount || '';
  document.getElementById('amountPaid').value = tab.amountPaid || '0';
  document.getElementById('paymentMethod').value = tab.paymentMethod;
  document.getElementById('invoiceNumber').value = tab.invoiceNumber;
  handlePaymentMethodChange();
  loadInventory();
}

function renderTabs() {
  const tabsContainer = document.getElementById('tabs');
  tabsContainer.innerHTML = '';
  tabs.forEach(tab => {
    const tabElement = document.createElement('div');
    tabElement.className = `tab ${tab.id === activeTabId ? 'active' : ''}`;
    tabElement.innerHTML = `
      Purchase ${tab.id.split('-')[1]}
      <span class="tab-close" onclick="closeTab('${tab.id}')">×</span>
    `;
    tabElement.addEventListener('click', () => switchTab(tab.id));
    tabsContainer.appendChild(tabElement);
  });
}

function closeTab(tabId) {
  if (tabs.length === 1) return;
  tabs = tabs.filter(t => t.id !== tabId);
  if (activeTabId === tabId) {
    activeTabId = tabs[0].id;
    switchTab(activeTabId);
  }
  renderTabs();
}