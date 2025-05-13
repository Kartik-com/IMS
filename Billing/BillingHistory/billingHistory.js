const { ipcRenderer } = require('electron');

let currentlyOpenBillId = null;
let bills = [];
let displayValue = '0';
let history = [];
let isHistoryVisible = false;

document.addEventListener('DOMContentLoaded', () => {
  loadBills();
  initializeEventListeners();
  // Search functionality
  document.getElementById('searchInput').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#billsTableBody tr:not(.details-row)');
    rows.forEach(row => {
      const billId = row.cells[0].textContent.toLowerCase();
      const detailsRow = row.nextElementSibling?.classList.contains('details-row') ? row.nextElementSibling : null;
      const shouldDisplay = billId.includes(searchTerm);
      row.style.display = shouldDisplay ? '' : 'none';
      if (detailsRow) detailsRow.style.display = shouldDisplay ? '' : 'none';
    });
  });

  // Listen for new bills
  ipcRenderer.on('billing:newBill', (event, newBill) => {
    bills.push(newBill);
    renderBillRow(newBill);
  });
});

function initializeEventListeners() {
  document.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'F1':
        event.preventDefault();
        navigateTo('/Billing/POS/pos.html');
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
        navigateTo('/Billing/POS/pos.html');
        break;
      case 'F8':
        event.preventDefault();
        navigateTo('index.html');
        break;
    }
  });
}

function navigateTo(page) {
  ipcRenderer.send('navigate-to', page);
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

async function loadBills() {
  try {
    bills = await ipcRenderer.invoke('billing:getBills');
    // Filter out bills with invalid data
    bills = bills.filter(bill => {
      try {
        const billData = JSON.parse(bill.data);
        return billData && typeof billData.totalCost === 'number' && typeof billData.discount === 'number' &&
               typeof billData.amountPaid === 'number' && typeof billData.change === 'number';
      } catch (error) {
        console.error(`Invalid bill data for bill ID ${bill.id}:`, bill.data, error);
        return false;
      }
    });
    const tableBody = document.getElementById('billsTableBody');
    tableBody.innerHTML = '';
    bills.forEach(bill => renderBillRow(bill));
  } catch (error) {
    console.error('Error loading bills:', error);
  }
}

function renderBillRow(bill) {
  let billData;
  try {
    billData = JSON.parse(bill.data);
  } catch (error) {
    console.error(`Failed to parse bill data for bill ID ${bill.id}:`, bill.data, error);
    return; // Skip rendering this bill
  }

  // Ensure numerical values with fallbacks
  const totalCost = typeof billData.totalCost === 'number' ? billData.totalCost.toFixed(2) : '0.00';
  const discount = typeof billData.discount === 'number' ? billData.discount.toFixed(2) : '0.00';
  const amountPaid = typeof billData.amountPaid === 'number' ? billData.amountPaid.toFixed(2) : '0.00';
  const change = typeof billData.change === 'number' ? billData.change.toFixed(2) : '0.00';

  const tableBody = document.getElementById('billsTableBody');
  const row = document.createElement('tr');
  row.dataset.billId = bill.id;
  row.innerHTML = `
    <td>${bill.id}</td>
    <td>${bill.createdAt}</td>
    <td>${bill.customer_name || 'N/A'}</td>
    <td>${bill.customer_mobile || 'N/A'}</td>
    <td>${billData.totalItems?.length || 0}</td>
    <td>${billData.paymentMethod || 'N/A'}</td>
    <td>₹${discount}</td>
    <td>₹${totalCost}</td>
    <td>₹${amountPaid}</td>
    <td>₹${change}</td>
  `;
  row.addEventListener('click', () => toggleBillDetails(row, bill.id, bill));
  tableBody.appendChild(row);
}

async function toggleBillDetails(row, billId, bill) {
  // Check if there's already a details row for this bill
  let detailsRow = row.nextElementSibling;
  if (detailsRow && detailsRow.classList.contains('details-row')) {
    detailsRow.remove();
    currentlyOpenBillId = null;
    return;
  }

  // If another bill's details are open, close them
  if (currentlyOpenBillId !== null) {
    const openRow = document.querySelector(`tr[data-bill-id="${currentlyOpenBillId}"]`);
    if (openRow && openRow.nextElementSibling?.classList.contains('details-row')) {
      openRow.nextElementSibling.remove();
    }
  }

  // Update the currently open bill ID
  currentlyOpenBillId = billId;

  // Parse bill data
  let billData;
  try {
    billData = JSON.parse(bill.data);
  } catch (error) {
    console.error(`Failed to parse bill data for bill ID ${bill.id}:`, bill.data, error);
    return;
  }

  // Ensure numerical values with fallbacks
  const totalCost = typeof billData.totalCost === 'number' ? billData.totalCost.toFixed(2) : '0.00';
  const discount = typeof billData.discount === 'number' ? billData.discount.toFixed(2) : '0.00';
  const amountPaid = typeof billData.amountPaid === 'number' ? billData.amountPaid.toFixed(2) : '0.00';
  const change = typeof billData.change === 'number' ? billData.change.toFixed(2) : '0.00';

  // Fetch item names for the barcodes in totalItems
  const barcodes = billData.totalItems?.map(item => item.barcode) || [];
  let itemNames = {};
  try {
    const names = await ipcRenderer.invoke('inventory:getItemNames', barcodes);
    names.forEach(item => {
      itemNames[item.barcode] = item.name || 'Unknown Item';
    });
  } catch (error) {
    console.error('Error fetching item names:', error);
    barcodes.forEach(barcode => {
      itemNames[barcode] = 'Unknown Item';
    });
  }

  detailsRow = document.createElement('tr');
  detailsRow.classList.add('details-row');
  const detailsCell = document.createElement('td');
  detailsCell.colSpan = 10;
  detailsCell.innerHTML = `
    <div class="bill-details">
      <table class="summary-table">
        <thead>
          <tr>
            <th>Bill ID</th>
            <th>Date</th>
            <th>Customer Name</th>
            <th>Customer Mobile</th>
            <th>Payment Method</th>
            <th>Discount</th>
            <th>Total Cost</th>
            <th>Amount Paid</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${bill.id}</td>
            <td>${bill.createdAt}</td>
            <td>${bill.customer_name || 'N/A'}</td>
            <td>${bill.customer_mobile || 'N/A'}</td>
            <td>${billData.paymentMethod || 'N/A'}</td>
            <td>₹${discount}</td>
            <td>₹${totalCost}</td>
            <td>₹${amountPaid}</td>
            <td>₹${change}</td>
          </tr>
        </tbody>
      </table>
      <h3>Items</h3>
      <table class="items-table">
        <thead>
          <tr>
            <th>Barcode</th>
            <th>Item Name</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Measure</th>
          </tr>
        </thead>
        <tbody>
          ${billData.totalItems?.map(item => `
            <tr>
              <td>${item.barcode || 'N/A'}</td>
              <td>${itemNames[item.barcode] || 'Unknown Item'}</td>
              <td>${item.quantity || 0}</td>
              <td>₹${typeof item.price === 'number' ? item.price.toFixed(2) : '0.00'}</td>
              <td>${item.measure || 'N/A'}</td>
            </tr>
          `).join('') || '<tr><td colspan="5">No items</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  detailsRow.appendChild(detailsCell);
  row.insertAdjacentElement('afterend', detailsRow);
}