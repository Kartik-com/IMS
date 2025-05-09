const { ipcRenderer } = require('electron');

let currentlyOpenWholesalerId = null;
let wholesalers = [];

document.addEventListener('DOMContentLoaded', () => {
  console.log('Wholesalers History page loaded');
  loadWholesalers();

  // Combined search functionality
  const applyFilters = () => {
    const searchIdTerm = document.getElementById('searchInput').value.toLowerCase();
    const searchNameContactTerm = document.getElementById('searchByNameContact').value.toLowerCase();
    const rows = document.querySelectorAll('#wholesalersTableBody tr:not(.details-row)');

    rows.forEach(row => {
      const wholesalerId = row.cells[0].textContent.toLowerCase();
      const name = row.cells[1].textContent.toLowerCase();
      const contactNumber = row.cells[2].textContent.toLowerCase();
      const detailsRow = row.nextElementSibling?.classList.contains('details-row') ? row.nextElementSibling : null;

      const matchesId = searchIdTerm ? wholesalerId.includes(searchIdTerm) : true;
      const matchesNameContact = searchNameContactTerm
        ? (name.includes(searchNameContactTerm) || contactNumber.includes(searchNameContactTerm))
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

  // Listen for new wholesalers
  ipcRenderer.on('wholesalers:newWholesaler', (event, newWholesaler) => {
    console.log('Received new wholesaler via IPC:', newWholesaler);
    wholesalers.push(newWholesaler);
    renderWholesalerRow(newWholesaler);
    applyFilters(); // Apply filters to new wholesaler
  });
});

async function loadWholesalers() {
  try {
    wholesalers = await ipcRenderer.invoke('wholesalers:getWholesalers');
    console.log('Fetched wholesalers:', wholesalers);

    // Filter out wholesalers with invalid data
    wholesalers = wholesalers.filter(wholesaler => {
      try {
        return typeof wholesaler.total_amount === 'number' &&
               typeof wholesaler.payment_method === 'string';
      } catch (error) {
        console.error(`Invalid wholesaler data for ID ${wholesaler.id}:`, error);
        return false;
      }
    });

    console.log('Filtered wholesalers:', wholesalers);
    const tableBody = document.getElementById('wholesalersTableBody');
    tableBody.innerHTML = '';
    wholesalers.forEach(wholesaler => renderWholesalerRow(wholesaler));
  } catch (error) {
    console.error('Error loading wholesalers:', error);
  }
}

function renderWholesalerRow(wholesaler) {
  // Ensure numerical values with fallbacks
  const totalAmount = typeof wholesaler.total_amount === 'number' ? wholesaler.total_amount.toFixed(2) : '0.00';
  const paymentMethod = wholesaler.payment_method || 'N/A';

  const tableBody = document.getElementById('wholesalersTableBody');
  const row = document.createElement('tr');
  row.dataset.wholesalerId = wholesaler.id;
  row.innerHTML = `
    <td>${wholesaler.id}</td>
    <td>${wholesaler.name || 'N/A'}</td>
    <td>${wholesaler.contact_number || 'N/A'}</td>
    <td>₹${totalAmount}</td>
    <td>${paymentMethod}</td>
  `;

  row.addEventListener('click', () => toggleWholesalerDetails(row, wholesaler.id, wholesaler));
  tableBody.appendChild(row);
  console.log(`Rendered row for wholesaler ID ${wholesaler.id}`);
}

async function toggleWholesalerDetails(row, wholesalerId, wholesaler) {
  // Check if there's already a details row for this wholesaler
  let detailsRow = row.nextElementSibling;
  if (detailsRow && detailsRow.classList.contains('details-row')) {
    detailsRow.remove();
    currentlyOpenWholesalerId = null;
    return;
  }

  // If another wholesaler's details are open, close them
  if (currentlyOpenWholesalerId !== null) {
    const openRow = document.querySelector(`tr[data-wholesaler-id="${currentlyOpenWholesalerId}"]`);
    if (openRow && openRow.nextElementSibling?.classList.contains('details-row')) {
      openRow.nextElementSibling.remove();
    }
  }

  // Update the currently open wholesaler ID
  currentlyOpenWholesalerId = wholesalerId;

  // Ensure numerical values with fallbacks
  const totalAmount = typeof wholesaler.total_amount === 'number' ? wholesaler.total_amount.toFixed(2) : '0.00';
  const paymentMethod = wholesaler.payment_method || 'N/A';

  // Fetch associated items
  let items = [];
  try {
    items = await ipcRenderer.invoke('wholesalers:getWholesalerItems', wholesalerId);
  } catch (error) {
    console.error('Error fetching wholesaler items:', error);
  }

  detailsRow = document.createElement('tr');
  detailsRow.classList.add('details-row');
  const detailsCell = document.createElement('td');
  detailsCell.colSpan = 5;
  detailsCell.innerHTML = `
    <div class="wholesaler-details">
      <table class="summary-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Contact Number</th>
            <th>Total Amount</th>
            <th>Payment Method</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${wholesaler.id}</td>
            <td>${wholesaler.name || 'N/A'}</td>
            <td>${wholesaler.contact_number || 'N/A'}</td>
            <td>₹${totalAmount}</td>
            <td>${paymentMethod}</td>
          </tr>
        </tbody>
      </table>
      <h3>Associated Items</h3>
      <table class="items-table">
        <thead>
          <tr>
            <th>Item ID</th>
            <th>Item Name</th>
          </tr>
        </thead>
        <tbody>
          ${items.length > 0 ? items.map(item => `
            <tr>
              <td>${item.id}</td>
              <td>${item.name || 'N/A'}</td>
            </tr>
          `).join('') : '<tr><td colspan="2">No items</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  detailsRow.appendChild(detailsCell);
  row.insertAdjacentElement('afterend', detailsRow);
}