const { ipcRenderer } = require('electron');

let lastAutocompleteQuery = '';

document.addEventListener('DOMContentLoaded', () => {
    loadSuggestions();
    // Set current date only using real-time system clock
    const now = new Date();
    const localTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    document.getElementById('createdAt').value = localTime.toISOString().split('T')[0];
});

function loadSuggestions() {
    ipcRenderer.invoke('customerSuggestions:getSuggestions').then((suggestions) => {
        const tbody = document.getElementById('suggestionsBody');
        tbody.innerHTML = '';
        suggestions.forEach(suggestion => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${suggestion.id}</td>
                <td>${suggestion.customer_name}</td>
                <td>${suggestion.customer_mobile}</td>
                <td>${suggestion.suggestion}</td>
                <td>${new Date(suggestion.createdAt).toLocaleString()}</td>
                <td class="actions">
                    <button onclick="toggleEditMode(${suggestion.id}, '${suggestion.suggestion}')">Edit</button>
                    <button onclick="deleteSuggestion(${suggestion.id})">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }).catch(err => console.error(err));
}

function addSuggestion() {
    const customerName = document.getElementById('customerName').value;
    const customerMobile = document.getElementById('customerMobile').value;
    const suggestion = document.getElementById('suggestion').value;
    const createdAtDate = document.getElementById('createdAt').value;
    const now = new Date();
    const localTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const createdAt = `${createdAtDate}T${localTime.toTimeString().split(' ')[0]}`;

    if (!customerName || !customerMobile || !suggestion) {
        alert("Please fill all required fields (Name, Mobile, Suggestion)");
        return;
    }

    ipcRenderer.invoke('customerSuggestions:addSuggestion', { name: customerName, mobile_number: customerMobile, suggestion, createdAt }).then((result) => {
        if (result.success) {
            alert('Suggestion added successfully!');
            loadSuggestions();
            document.getElementById('customerName').value = '';
            document.getElementById('customerMobile').value = '';
            document.getElementById('suggestion').value = '';
            document.getElementById('createdAt').value = localTime.toISOString().split('T')[0];
            lastAutocompleteQuery = '';
            document.getElementById('nameSuggestionDropdown').style.display = 'none';
            document.getElementById('mobileSuggestionDropdown').style.display = 'none';
        } else {
            alert('Failed to add suggestion: ' + result.error);
        }
    });
}

function searchSuggestions() {
    const searchTerm = document.getElementById('searchSuggestions').value;
    ipcRenderer.invoke('customerSuggestions:getSuggestions').then((suggestions) => {
        const filteredSuggestions = suggestions.filter(suggestion =>
            suggestion.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            suggestion.suggestion.toLowerCase().includes(searchTerm.toLowerCase())
        );
        const tbody = document.getElementById('suggestionsBody');
        tbody.innerHTML = '';
        filteredSuggestions.forEach(suggestion => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${suggestion.id}</td>
                <td>${suggestion.customer_name}</td>
                <td>${suggestion.customer_mobile}</td>
                <td>${suggestion.suggestion}</td>
                <td>${new Date(suggestion.createdAt).toLocaleString()}</td>
                <td class="actions">
                    <button onclick="toggleEditMode(${suggestion.id}, '${suggestion.suggestion}')">Edit</button>
                    <button onclick="deleteSuggestion(${suggestion.id})">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
        const dropdown = document.getElementById('searchSuggestionDropdown');
        dropdown.innerHTML = '';
        if (filteredSuggestions.length > 0) {
            filteredSuggestions.forEach(suggestion => {
                const div = document.createElement('div');
                div.textContent = `${suggestion.customer_name} (${suggestion.customer_mobile}): ${suggestion.suggestion}`;
                div.onclick = () => {
                    document.getElementById('searchSuggestions').value = suggestion.customer_name;
                    dropdown.style.display = 'none';
                    loadSuggestions();
                };
                dropdown.appendChild(div);
            });
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    });
}

function autocompleteCustomer() {
    const nameInput = document.getElementById('customerName').value;
    const mobileInput = document.getElementById('customerMobile').value;
    const query = nameInput || mobileInput;

    if (query && query !== lastAutocompleteQuery) {
        ipcRenderer.invoke('customerSuggestions:getCustomerByNameOrMobile', query, true).then((customers) => {
            const nameDropdown = document.getElementById('nameSuggestionDropdown');
            const mobileDropdown = document.getElementById('mobileSuggestionDropdown');
            nameDropdown.innerHTML = '';
            mobileDropdown.innerHTML = '';
            if (customers && customers.length > 0) {
                customers.forEach(customer => {
                    const nameDiv = document.createElement('div');
                    nameDiv.textContent = `${customer.name} (${customer.mobile_number})`;
                    nameDiv.onclick = () => {
                        document.getElementById('customerName').value = customer.name;
                        document.getElementById('customerMobile').value = customer.mobile_number;
                        nameDropdown.style.display = 'none';
                        mobileDropdown.style.display = 'none';
                        lastAutocompleteQuery = customer.name;
                    };
                    nameDropdown.appendChild(nameDiv);

                    const mobileDiv = document.createElement('div');
                    mobileDiv.textContent = `${customer.name} (${customer.mobile_number})`;
                    mobileDiv.onclick = () => {
                        document.getElementById('customerName').value = customer.name;
                        document.getElementById('customerMobile').value = customer.mobile_number;
                        nameDropdown.style.display = 'none';
                        mobileDropdown.style.display = 'none';
                        lastAutocompleteQuery = customer.name;
                    };
                    mobileDropdown.appendChild(mobileDiv);
                });
                if (nameInput) nameDropdown.style.display = 'block';
                if (mobileInput) mobileDropdown.style.display = 'block';
            } else {
                nameDropdown.style.display = 'none';
                mobileDropdown.style.display = 'none';
            }
            lastAutocompleteQuery = query;
        }).catch(err => console.error(err));
    } else if (!query) {
        document.getElementById('customerName').value = '';
        document.getElementById('customerMobile').value = '';
        document.getElementById('nameSuggestionDropdown').style.display = 'none';
        document.getElementById('mobileSuggestionDropdown').style.display = 'none';
        lastAutocompleteQuery = '';
    }
}

function validateMobile(event) {
    const input = event.target;
    const value = input.value.replace(/[^0-9]/g, ''); // Remove non-numeric characters
    if (value !== input.value) {
        input.value = value;
        alert("Mobile number must contain only digits. Non-numeric characters have been removed.");
    }
}

function toggleEditMode(id, currentSuggestion) {
    const tbody = document.getElementById('suggestionsBody');
    const rows = tbody.getElementsByTagName('tr');
    for (let row of rows) {
        const rowId = parseInt(row.querySelector('td:nth-child(6) button').getAttribute('onclick').match(/\d+/)[0]);
        if (rowId === id) {
            if (row.querySelector('.edit-mode')) {
                const newSuggestion = row.querySelector('input').value;
                if (newSuggestion && newSuggestion !== currentSuggestion) {
                    ipcRenderer.invoke('customerSuggestions:updateSuggestion', { id, suggestion: newSuggestion }).then((result) => {
                        if (result.success) {
                            loadSuggestions();
                        } else {
                            alert('Failed to update suggestion: ' + result.error);
                        }
                    });
                }
            } else {
                row.innerHTML = `
                    <td>${row.cells[0].textContent}</td>
                    <td>${row.cells[1].textContent}</td>
                    <td>${row.cells[2].textContent}</td>
                    <td class="edit-mode"><input type="text" value="${currentSuggestion}" style="width: 200px; padding: 5px;"></td>
                    <td>${row.cells[4].textContent}</td>
                    <td class="actions">
                        <button onclick="toggleEditMode(${id}, '${currentSuggestion}')">Save</button>
                        <button onclick="loadSuggestions()">Cancel</button>
                    </td>
                `;
            }
            break;
        }
    }
}

function deleteSuggestion(id) {
    if (confirm('Are you sure you want to delete this suggestion?')) {
        ipcRenderer.invoke('customerSuggestions:deleteSuggestion', id).then((result) => {
            if (result.success) {
                loadSuggestions();
            } else {
                alert('Failed to delete suggestion: ' + result.error);
            }
        });
    }
}

ipcRenderer.on('customerSuggestions:updatedSuggestion', (event, suggestion) => {
    loadSuggestions();
});

ipcRenderer.on('customerSuggestions:deletedSuggestion', (event, id) => {
    loadSuggestions();
});

ipcRenderer.on('customerSuggestions:newSuggestion', (event, suggestion) => {
    const tbody = document.getElementById('suggestionsBody');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${suggestion.id}</td>
        <td>${suggestion.customer_name}</td>
        <td>${suggestion.customer_mobile}</td>
        <td>${suggestion.suggestion}</td>
        <td>${new Date(suggestion.createdAt).toLocaleString()}</td>
        <td class="actions">
            <button onclick="toggleEditMode(${suggestion.id}, '${suggestion.suggestion}')">Edit</button>
            <button onclick="deleteSuggestion(${suggestion.id})">Delete</button>
        </td>
    `;
    tbody.insertBefore(row, tbody.firstChild);
});