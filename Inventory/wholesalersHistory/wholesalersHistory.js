const { ipcRenderer } = require('electron');

let currentlyOpenPurchaseId = null;
let purchases = [];

document.addEventListener('DOMContentLoaded', () => {
  console.log('Wholesalers History page loaded');
  loadPurchases();

  // Combined search functionality
  const applyFilters = () => {
    const searchIdTerm = document.getElementById('searchInput').value.toLowerCase();
    const searchNameContactTerm = document.getElementById('searchByNameContact').value.toLowerCase();
    const rows = document.querySelectorAll('#purchasesTableBody tr:not(.details-row)');

    rows.forEach(row => {
      const purchaseId = row.cells[0].textContent.toLowerCase();
      const wholesalerName = row.cells[1].textContent.toLowerCase();
      const wholesalerContact = row.cells[2].textContent.toLowerCase();
      const detailsRow = row.nextElementSibling?.classList.contains('details-row') ? row.nextElementSibling : null;

      const matchesId = searchIdTerm ? purchaseId.includes(searchIdTerm) : true;
      const matchesNameContact = searchNameContactTerm
        ? (wholesalerName.includes(searchNameContactTerm) || wholesalerContact.includes(searchNameContactTerm))
        : true;
      const shouldDisplay = matchesId && matchesNameContact;

      row.style.display = shouldDisplay ? '' : 'none';
      if (detailsRow) detailsRow.style.display = shouldDisplay ? '' : 'none';
    });
  };

  // Search by ID
  document.getElementById('searchInput').addEventListener('input', applyFilters);

  // Search by Name or Contact Number
  document.getElementById('searchByNameContact').addEventListener('input', applyFilters);

  // Listen for new purchases
  ipcRenderer.on('wholesalerPurchases:newPurchase', (event, newPurchase) => {
    console.log('Received new purchase via IPC:', newPurchase);
    purchases.push(newPurchase);
    renderPurchaseRow(newPurchase);
    applyFilters(); // Apply filters to new purchase
  });
});

async function loadPurchases() {
  try {
    purchases = await ipcRenderer.invoke('wholesalerPurchases:getPurchases');
    console.log('Fetched purchases:', purchases);

    // Filter out purchases with invalid data
    purchases = purchases.filter(purchase => {
      try {
        const purchaseData = JSON.parse(purchase.data);
        return purchaseData && typeof purchaseData.totalCost === 'number' && typeof purchaseData.discount === 'number' &&
               typeof purchaseData.amountPaid === 'number';
      } catch (error) {
        console.error(`Invalid purchase data for purchase ID ${purchase.id}:`, purchase.data, error);
        return false;
      }
    });

    console.log('Filtered purchases:', purchases);
    const tableBody = document.getElementById('purchasesTableBody');
    tableBody.innerHTML = '';
    purchases.forEach(purchase => renderPurchaseRow(purchase));
  } catch (error) {
    console.error('Error loading purchases:', error);
  }
}

function renderPurchaseRow(purchase) {
  let purchaseData;
  try {
    purchaseData = JSON.parse(purchase.data);
    console.log(`Parsed purchase data for purchase ID ${purchase.id}:`, purchaseData);
  } catch (error) {
    console.error(`Failed to parse purchase data for purchase ID ${purchase.id}:`, purchase.data, error);
    return; // Skip rendering this purchase
  }

  // Ensure numerical values with fallbacks
  const totalCost = typeof purchaseData.totalCost === 'number' ? purchaseData.totalCost.toFixed(2) : '0.00';
  const discount = typeof purchaseData.discount === 'number' ? purchaseData.discount.toFixed(2) : '0.00';
  const amountPaid = typeof purchaseData.amountPaid === 'number' ? purchaseData.amountPaid.toFixed(2) : '0.00';

  // Format the date to DD-MM-YYYY HH:MM:SS
  const date = new Date(purchase.purchase_date);
  const formattedDate = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;

  const tableBody = document.getElementById('purchasesTableBody');
  const row = document.createElement('tr');
  row.dataset.purchaseId = purchase.id;
  row.innerHTML = `
    <td>${purchase.id}</td>
    <td>${purchase.wholesaler_name || 'N/A'}</td>
    <td>${purchase.wholesaler_contact || 'N/A'}</td>
    <td>${purchaseData.totalItems?.length || 0}</td>
    <td>${purchaseData.paymentMethod || 'N/A'}</td>
    <td>₹${discount}</td>
    <td>₹${totalCost}</td>
    <td>₹${amountPaid}</td>
    <td>${formattedDate}</td>
  `;

  row.addEventListener('click', () => togglePurchaseDetails(row, purchase.id, purchase));
  tableBody.appendChild(row);
  console.log(`Rendered row for purchase ID ${purchase.id}`);
}

async function togglePurchaseDetails(row, purchaseId, purchase) {
  // Check if there's already a details row for this purchase
  let detailsRow = row.nextElementSibling;
  if (detailsRow && detailsRow.classList.contains('details-row')) {
    detailsRow.remove();
    currentlyOpenPurchaseId = null;
    return;
  }

  // If another purchase's details are open, close them
  if (currentlyOpenPurchaseId !== null) {
    const openRow = document.querySelector(`tr[data-purchase-id="${currentlyOpenPurchaseId}"]`);
    if (openRow && openRow.nextElementSibling?.classList.contains('details-row')) {
      openRow.nextElementSibling.remove();
    }
  }

  // Update the currently open purchase ID
  currentlyOpenPurchaseId = purchaseId;

  // Parse purchase data
  let purchaseData;
  try {
    purchaseData = JSON.parse(purchase.data);
  } catch (error) {
    console.error(`Failed to parse purchase data for purchase ID ${purchase.id}:`, purchase.data, error);
    return;
  }

  // Ensure numerical values with fallbacks
  const totalCost = typeof purchaseData.totalCost === 'number' ? purchaseData.totalCost.toFixed(2) : '0.00';
  const discount = typeof purchaseData.discount === 'number' ? purchaseData.discount.toFixed(2) : '0.00';
  const amountPaid = typeof purchaseData.amountPaid === 'number' ? purchaseData.amountPaid.toFixed(2) : '0.00';

  // Format the date for the details section
  const date = new Date(purchase.purchase_date);
  const formattedDate = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;

  detailsRow = document.createElement('tr');
  detailsRow.classList.add('details-row');
  const detailsCell = document.createElement('td');
  detailsCell.colSpan = 9; // Adjusted colspan to match new column count
  detailsCell.innerHTML = `
    <div class="purchase-details">
      <table class="summary-table">
        <thead>
          <tr>
            <th>Purchase ID</th>
            <th>Date</th>
            <th>Wholesaler Name</th>
            <th>Wholesaler Contact</th>
            <th>Invoice Number</th>
            <th>Payment Method</th>
            <th>Discount</th>
            <th>Total Cost</th>
            <th>Amount Paid</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${purchase.id}</td>
            <td>${formattedDate}</td>
            <td>${purchase.wholesaler_name || 'N/A'}</td>
            <td>${purchase.wholesaler_contact || 'N/A'}</td>
            <td>${purchaseData.invoice_number || 'N/A'}</td>
            <td>${purchaseData.paymentMethod || 'N/A'}</td>
            <td>₹${discount}</td>
            <td>₹${totalCost}</td>
            <td>₹${amountPaid}</td>
            <td>${purchaseData.notes || 'N/A'}</td>
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
          ${purchaseData.totalItems?.map(item => `
            <tr>
              <td>${item.barcode || 'N/A'}</td>
              <td>${item.name || 'Unknown Item'}</td>
              <td>${item.quantity || 0}</td>
              <td>₹${typeof item.buying_cost === 'number' ? item.buying_cost.toFixed(2) : '0.00'}</td>
              <td>${item.unit || 'N/A'}</td>
            </tr>
          `).join('') || '<tr><td colspan="5">No items</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  detailsRow.appendChild(detailsCell);
  row.insertAdjacentElement('afterend', detailsRow);
}