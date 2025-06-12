const { ipcRenderer } = require('electron');

let currentlyOpenBillId = null;
let bills = [];

document.addEventListener('DOMContentLoaded', () => {
  console.log('Billing History page loaded');
  loadBills();

  // Combined search functionality
  const applyFilters = () => {
    const searchIdTerm = document.getElementById('searchInput').value.toLowerCase();
    const searchNameMobileTerm = document.getElementById('searchByNameMobile').value.toLowerCase();
    const rows = document.querySelectorAll('#billsTableBody tr:not(.details-row)');

    rows.forEach(row => {
      const billId = row.cells[0].textContent.toLowerCase();
      const customerName = row.cells[2].textContent.toLowerCase();
      const customerMobile = row.cells[3].textContent.toLowerCase();
      const detailsRow = row.nextElementSibling?.classList.contains('details-row') ? row.nextElementSibling : null;

      const matchesId = searchIdTerm ? billId.includes(searchIdTerm) : true;
      const matchesNameMobile = searchNameMobileTerm
        ? (customerName.includes(searchNameMobileTerm) || customerMobile.includes(searchNameMobileTerm))
        : true;

      const shouldDisplay = matchesId && matchesNameMobile;
      row.style.display = shouldDisplay ? '' : 'none';
      if (detailsRow) detailsRow.style.display = shouldDisplay ? '' : 'none';
    });
  };

  // Search by ID
  document.getElementById('searchInput').addEventListener('input', applyFilters);

  // Search by Name or Mobile Number
  document.getElementById('searchByNameMobile').addEventListener('input', applyFilters);

  // Listen for new bills
  ipcRenderer.on('billing:newBill', (event, newBill) => {
    console.log('Received new bill via IPC:', newBill);
    bills.push(newBill);
    renderBillRow(newBill);
    applyFilters(); // Apply filters to new bill
  });
});

async function loadBills() {
  try {
    bills = await ipcRenderer.invoke('billing:getBills');
    console.log('Fetched bills:', bills);
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
    // Sort bills by createdAt in descending order (latest first)
    bills.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    console.log('Filtered and sorted bills:', bills);
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
    console.log(`Parsed bill data for bill ID ${bill.id}:`, billData);
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
  console.log(`Rendered row for bill ID ${bill.id}`);
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

// Note: To address the Electron Security Warning (Insecure Content-Security-Policy),
// add the following meta tag to your HTML file (e.g., billingHistory.html):
// <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';">