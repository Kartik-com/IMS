document.addEventListener('DOMContentLoaded', () => {

    let salesChart = null;
    let allTransactions = [];

    // Function to fetch transactions from API
    async function fetchTransactions() {
        try {
            console.log('Fetching transactions from API...');
            const response = await fetch('http://192.168.0.100:4000/api/v1/purchese/getAllPurcheseHistory');
            const data = await response.json();
            console.log('API response:', data);
            if (data.success && Array.isArray(data.allPurcheseHistory)) {
                allTransactions = data.allPurcheseHistory
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                renderTransactions(allTransactions);
                updateSalesChart(document.getElementById('timeFilter').value);
            } else {
                console.error('Invalid API response:', data);
                allTransactions = [];
                renderTransactions([]);
                updateSalesChart(document.getElementById('timeFilter').value);
            }
        } catch (error) {
            console.error('Error fetching transactions:', error);
            allTransactions = [];
            renderTransactions([]);
            updateSalesChart(document.getElementById('timeFilter').value);
        }
    }

    // Function to render transactions
    function renderTransactions(transactions) {
        const transactionsContainer = document.getElementById('transactions');
        // Store open state of transaction details
        const openDetails = {};
        document.querySelectorAll('.transaction-details.show').forEach(details => {
            const card = details.closest('.transaction-card');
            const index = Array.from(transactionsContainer.children).indexOf(card);
            if (index >= 0) openDetails[index] = true;
        });
        transactionsContainer.innerHTML = '';
        transactions.forEach((transaction, index) => {
            const date = new Date(transaction.createdAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
            // Use customerName if available, otherwise "Unknown"
            const customerName = transaction.customerName || 'Unknown';
            const transactionCard = document.createElement('div');
            transactionCard.className = 'transaction-card';
            transactionCard.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-dark font-medium">${customerName}</p>
                        <p class="text-gray text-sm">${date}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-dark font-medium">₹${transaction.totalAmount.toFixed(2)}</p>
                        <p class="text-gray text-sm">${transaction.paymentMethod}</p>
                    </div>
                </div>
                <div class="transaction-details ${openDetails[index] ? 'show' : ''}">
                    <h3 class="text-lg font-semibold text-dark mb-4">Bill Details</h3>
                    <table class="details-table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Quantity</th>
                                <th>Price (₹)</th>
                                <th>Item Total (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${transaction.items.map((item, itemIndex) => `
                                <tr class="${itemIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
                                    <td>${item.item?.name || 'Unknown Item'}</td>
                                    <td>${item.quantity}</td>
                                    <td>${item.price.toFixed(2)}</td>
                                    <td>${(item.price * item.quantity).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                            <tr class="bg-white">
                                <td colspan="4" class="text-left font-semibold">Summary</td>
                            </tr>
                            <tr class="${transaction.items.length % 2 === 0 ? 'bg-gray-50' : 'bg-white'}">
                                <td>Total Before GST</td>
                                <td colspan="3">${transaction.totalAmountBeforeGST.toFixed(2)}</td>
                            </tr>
                            <tr class="${(transaction.items.length + 1) % 2 === 0 ? 'bg-gray-50' : 'bg-white'}">
                                <td>Total GST</td>
                                <td colspan="3">${transaction.totalGST.toFixed(2)}</td>
                            </tr>
                            <tr class="${(transaction.items.length + 2) % 2 === 0 ? 'bg-gray-50' : 'bg-white'}">
                                <td>Discount</td>
                                <td colspan="3">${transaction.discount.toFixed(2)}</td>
                            </tr>
                            <tr class="${(transaction.items.length + 3) % 2 === 0 ? 'bg-gray-50' : 'bg-white'}">
                                <td>Total Amount</td>
                                <td colspan="3">${transaction.totalAmount.toFixed(2)}</td>
                            </tr>
                            <tr class="${(transaction.items.length + 4) % 2 === 0 ? 'bg-gray-50' : 'bg-white'}">
                                <td>Amount Paid</td>
                                <td colspan="3">${transaction.amountPaid.toFixed(2)}</td>
                            </tr>
                            <tr class="${(transaction.items.length + 5) % 2 === 0 ? 'bg-gray-50' : 'bg-white'}">
                                <td>Change Given</td>
                                <td colspan="3">${transaction.change.toFixed(2)}</td>
                            </tr>
                            <tr class="${(transaction.items.length + 6) % 2 === 0 ? 'bg-gray-50' : 'bg-white'}">
                                <td>Payment Method</td>
                                <td colspan="3">${transaction.paymentMethod}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
            // Toggle details on click, prevent bubbling
            const summaryDiv = transactionCard.querySelector('.flex');
            summaryDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                const details = transactionCard.querySelector('.transaction-details');
                details.classList.toggle('show');
            });
            transactionsContainer.appendChild(transactionCard);
        });
    }

    // Function to group transactions by time period
    function groupTransactions(period) {
        const grouped = {};
        allTransactions.forEach(t => {
            const date = new Date(t.createdAt);
            let key;
            if (period === 'daily') {
                key = date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
            } else if (period === 'weekly') {
                const week = Math.ceil((date.getDate() + (7 - date.getDay())) / 7);
                key = `${date.getFullYear()}-W${week}`;
            } else if (period === 'monthly') {
                key = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
            } else if (period === 'yearly') {
                key = date.getFullYear();
            }
            if (!grouped[key]) {
                grouped[key] = { total: 0, count: 0 };
            }
            grouped[key].total += Number(t.totalAmount) || 0;
            grouped[key].count += 1;
        });
        return Object.entries(grouped).map(([key, value]) => ({
            label: key,
            total: value.total
        })).sort((a, b) => {
            if (period === 'weekly') {
                const [yearA, weekA] = a.label.split('-W').map(Number);
                const [yearB, weekB] = b.label.split('-W').map(Number);
                return yearA - yearB || weekA - weekB;
            }
            return a.label.localeCompare(b.label);
        });
    }

    // Function to update sales chart
    function updateSalesChart(period) {
        const ctx = document.getElementById('salesChart').getContext('2d');
        console.log('Updating chart for period:', period);
        let labels, data;
        if (allTransactions.length === 0) {
            console.warn('No transactions; using placeholder data');
            const now = new Date();
            labels = [
                new Date(now - 2 * 60 * 60 * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
                new Date(now - 1 * 60 * 60 * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
                now.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
            ];
            data = [50, 75, 100];
        } else {
            const groupedData = groupTransactions(period);
            labels = groupedData.map(d => d.label);
            data = groupedData.map(d => d.total);
        }
        // Log data for debugging
        console.log('Chart labels:', labels);
        console.log('Chart data:', data);
        // Check for valid data
        if (!labels.length || !data.length) {
            console.warn('Invalid or no data for chart; using placeholder');
            const now = new Date();
            labels = [
                new Date(now - 2 * 60 * 60 * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
                new Date(now - 1 * 60 * 60 * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
                now.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
            ];
            data = [50, 75, 100];
        }
        // Create gradient for bars
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, '#28A745');
        gradient.addColorStop(1, '#218838');
        // Calculate dynamic bar thickness
        const maxBarThickness = 50; // Broader bars for better visibility
        const minBarThickness = 10; // Minimum to prevent overcrowding
        const barThickness = Math.max(minBarThickness, Math.min(maxBarThickness, 600 / labels.length));
        // Calculate max value for y-axis padding, with fallback for zero/empty data
        const maxDataValue = data.length > 0 && Math.max(...data) > 0 ? Math.max(...data) : 100;
        // If chart exists, update it; otherwise, create new chart
        if (salesChart) {
            console.log('Updating existing chart');
            salesChart.data.labels = labels;
            salesChart.data.datasets[0].data = data;
            salesChart.data.datasets[0].barThickness = barThickness;
            salesChart.options.scales.y.suggestedMax = maxDataValue * 1.4; // Update padding dynamically
            salesChart.update();
        } else {
            console.log('Creating new chart');
            salesChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Total Sales (₹)',
                        data: data,
                        backgroundColor: gradient,
                        borderColor: '#218838',
                        borderWidth: 1,
                        borderRadius: 8,
                        barThickness: barThickness
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 1000,
                        easing: 'easeOutQuart'
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: period === 'daily' ? 'Date' : period === 'weekly' ? 'Week' : period === 'monthly' ? 'Month' : 'Year',
                                color: '#000000',
                                font: { size: 14 }
                            },
                            ticks: {
                                color: '#000000',
                                maxRotation: 45,
                                minRotation: 45,
                                font: { size: 12 }
                            },
                            grid: { display: false }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Total Sales (₹)',
                                color: '#000000',
                                font: { size: 14 },
                                padding: { top: 10, bottom: 10 }
                            },
                            ticks: {
                                color: '#000000',
                                font: { size: 12 }
                            },
                            grid: { color: '#E5E7EB', drawBorder: false },
                            beginAtZero: true,
                            position: 'left',
                            suggestedMax: maxDataValue * 1.4 // 40% extra space above max value
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: '#FFFFFF',
                            titleColor: '#000000',
                            bodyColor: '#000000',
                            borderColor: '#E5E7EB',
                            borderWidth: 1
                        },
                        datalabels: {
                            anchor: 'end',
                            align: 'top',
                            color: '#000000',
                            font: {
                                size: 14, // Larger font for visibility
                                weight: 'bold'
                            },
                            formatter: (value) => `₹${value.toFixed(2)}` // Show as currency
                        }
                    }
                },
                plugins: [ChartDataLabels] // Register ChartDataLabels plugin
            });
            // Enable swipe gestures
            const canvas = document.getElementById('salesChart');
            const hammer = new Hammer(canvas);
            hammer.get('pan').set({ direction: Hammer.DIRECTION_HORIZONTAL });
            hammer.on('pan', (e) => {
                canvas.scrollLeft -= e.deltaX;
            });
        }
    }

    // Handle time filter change
    document.getElementById('timeFilter').addEventListener('change', (e) => {
        updateSalesChart(e.target.value);
    });

    // Initialize
    console.log('Initializing sales history...');
    fetchTransactions();
});