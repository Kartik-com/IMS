const { ipcRenderer } = require('electron');

let currentlyOpenBillId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadBills();

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
});

async function loadBills() {
  try {
    const bills = await ipcRenderer.invoke('billing:getBills');
    const tableBody = document.getElementById('billsTableBody');
    tableBody.innerHTML = '';

    bills.forEach(bill => {
      const billData = JSON.parse(bill.data);
      const row = document.createElement('tr');
      row.dataset.billId = bill.id;
      row.innerHTML = `
        <td>${bill.id}</td>
        <td>${bill.createdAt}</td>
        <td>${billData.totalItems.length}</td>
        <td>${billData.paymentMethod}</td>
        <td>$${billData.discount.toFixed(2)}</td>
        <td>$${billData.amountPaid.toFixed(2)}</td>
        <td>$${billData.change.toFixed(2)}</td>
      `;
      row.addEventListener('click', () => toggleBillDetails(row, bill.id, billData));
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading bills:', error);
  }
}

function toggleBillDetails(row, billId, billData) {
  // Check if there's already a details row for this bill
  let detailsRow = row.nextElementSibling;
  if (detailsRow && detailsRow.classList.contains('details-row')) {
    // If the details row exists, toggle its visibility
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

  // Create the details row
  detailsRow = document.createElement('tr');
  detailsRow.classList.add('details-row');
  const detailsCell = document.createElement('td');
  detailsCell.colSpan = 7;
  detailsCell.innerHTML = `
    <div class="bill-details">
      <h2>Bill Details</h2>
      <div class="bill-summary">
        <p><strong>Payment Method:</strong> ${billData.paymentMethod}</p>
        <p><strong>Discount:</strong> $${billData.discount.toFixed(2)}</p>
        <p><strong>Amount Paid:</strong> $${billData.amountPaid.toFixed(2)}</p>
        <p><strong>Change:</strong> $${billData.change.toFixed(2)}</p>
      </div>
      <h3>Items</h3>
      <table class="items-table">
        <thead>
          <tr>
            <th>Barcode</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Measure</th>
          </tr>
        </thead>
        <tbody>
          ${billData.totalItems.map(item => `
            <tr>
              <td>${item.barcode}</td>
              <td>${item.quantity}</td>
              <td>$${item.price.toFixed(2)}</td>
              <td>${item.measure}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  detailsRow.appendChild(detailsCell);
  row.insertAdjacentElement('afterend', detailsRow);
}