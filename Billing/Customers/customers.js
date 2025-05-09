const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const customerTableBody = document.getElementById('customerTableBody');
  const searchInput = document.getElementById('searchInput');
  const searchByNameMobile = document.getElementById('searchByNameMobile');
  const createCustomerBtn = document.getElementById('createCustomerBtn');
  const customerModal = document.getElementById('customerModal');
  const closeModal = document.getElementById('closeModal');
  const customerForm = document.getElementById('customerForm');
  const modalTitle = document.getElementById('modalTitle');
  const customerIdInput = document.getElementById('customerId');
  const customerNameInput = document.getElementById('customerName');
  const mobileNumberInput = document.getElementById('mobileNumber');
  const udhariInput = document.getElementById('udhari');

  // Fetch and display customers
  async function loadCustomers() {
    try {
      const customers = await ipcRenderer.invoke('customers:getCustomers');
      displayCustomers(customers);
      return customers;
    } catch (error) {
      console.error('Error loading customers:', error);
      return [];
    }
  }

  // Display customers in the table
  function displayCustomers(customers) {
    customerTableBody.innerHTML = '';
    customers.forEach(customer => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${customer.id}</td>
        <td>${customer.name}</td>
        <td>${customer.mobile_number}</td>
        <td>₹${customer.udhari.toFixed(2)}</td>
        <td>
          <button class="action-btn edit-btn" onclick="editCustomer(${customer.id}, '${customer.name}', '${customer.mobile_number}', ${customer.udhari})">Edit</button>
          <button class="action-btn delete-btn" onclick="deleteCustomer(${customer.id})">Delete</button>
        </td>
      `;
      customerTableBody.appendChild(row);
    });
  }

  // Combined search functionality
  async function applyFilters() {
    const searchIdTerm = searchInput.value.trim().toLowerCase();
    const searchNameMobileTerm = searchByNameMobile.value.trim().toLowerCase();
    
    try {
      const customers = await ipcRenderer.invoke('customers:getCustomers');
      let filteredCustomers = customers;

      // Filter by ID
      if (searchIdTerm) {
        filteredCustomers = filteredCustomers.filter(customer => 
          customer.id.toString().toLowerCase().includes(searchIdTerm)
        );
      }

      // Filter by Name or Mobile Number
      if (searchNameMobileTerm) {
        filteredCustomers = filteredCustomers.filter(customer => 
          customer.name.toLowerCase().includes(searchNameMobileTerm) ||
          customer.mobile_number.toLowerCase().includes(searchNameMobileTerm)
        );
      }

      displayCustomers(filteredCustomers);
    } catch (error) {
      console.error('Error applying filters:', error);
    }
  }

  // Search by ID
  searchInput.addEventListener('input', applyFilters);

  // Search by Name or Mobile Number
  searchByNameMobile.addEventListener('input', applyFilters);

  // Open modal for creating a new customer
  createCustomerBtn.addEventListener('click', () => {
    modalTitle.textContent = 'Create Customer';
    customerIdInput.value = '';
    customerNameInput.value = '';
    mobileNumberInput.value = '';
    udhariInput.value = '0.0';
    customerModal.style.display = 'block';
  });

  // Close modal
  closeModal.addEventListener('click', () => {
    customerModal.style.display = 'none';
  });

  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    if (event.target === customerModal) {
      customerModal.style.display = 'none';
    }
  });

  // Handle form submission for create/edit
  customerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const customer = {
      id: customerIdInput.value,
      name: customerNameInput.value,
      mobile_number: mobileNumberInput.value,
      udhari: parseFloat(udhariInput.value) || 0.0
    };

    try {
      if (customer.id) {
        // Edit customer
        await ipcRenderer.invoke('customers:updateCustomer', customer);
      } else {
        // Create customer
        await ipcRenderer.invoke('customers:addCustomer', customer);
      }
      customerModal.style.display = 'none';
      loadCustomers(); // Refresh table
    } catch (error) {
      console.error('Error saving customer:', error);
      alert('Failed to save customer: ' + error.message);
    }
  });

  // Edit customer
  window.editCustomer = (id, name, mobile_number, udhari) => {
    modalTitle.textContent = 'Edit Customer';
    customerIdInput.value = id;
    customerNameInput.value = name;
    mobileNumberInput.value = mobile_number;
    udhariInput.value = udhari;
    customerModal.style.display = 'block';
  };

  // Delete customer
  window.deleteCustomer = async (id) => {
    if (confirm('Are you sure you want to delete this customer?')) {
      try {
        await ipcRenderer.invoke('customers:deleteCustomer', id);
        loadCustomers(); // Refresh table
      } catch (error) {
        console.error('Error deleting customer:', error);
        alert('Failed to delete customer: ' + error.message);
      }
    }
  };

  // Initial load
  loadCustomers();
});