const { ipcRenderer } = require('electron');
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const backupDir = path.join(__dirname, 'backups');
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);
oauth2Client.setCredentials({
  access_token: process.env.ACCESS_TOKEN,
  refresh_token: process.env.REFRESH_TOKEN
});

// Ensure backup directory exists
fs.ensureDirSync(backupDir);

document.addEventListener('DOMContentLoaded', () => {
  const backupBtn = document.getElementById('backupBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const backupFilesSelect = document.getElementById('backupFiles');
  const backupStatus = document.getElementById('backupStatus');
  const restoreStatus = document.getElementById('restoreStatus');

  // List available backups
  async function listBackups() {
    try {
      const result = await ipcRenderer.invoke('backup:listBackups');
      if (result.success) {
        backupFilesSelect.innerHTML = '<option value="">Select a backup file</option>';
        result.files.forEach((file) => {
          const option = document.createElement('option');
          option.value = file.id;
          option.textContent = `${file.name} (${new Date(file.createdTime).toLocaleString()})`;
          backupFilesSelect.appendChild(option);
        });
        restoreBtn.disabled = !result.files.length;
        downloadBtn.disabled = !result.files.length;
        restoreStatus.textContent = '';
      } else {
        console.error('Failed to list backups:', result.error);
        restoreStatus.textContent = `Error: ${result.error}. Please try authenticating again.`;
      }
    } catch (err) {
      console.error('Error listing backups:', err.message);
      restoreStatus.textContent = `Error: ${err.message}. Please try authenticating again.`;
    }
  }

  // List backups on load
  listBackups();

  // Handle backup button click
  backupBtn.addEventListener('click', async () => {
    backupStatus.textContent = 'Initiating backup...';
    try {
      const result = await ipcRenderer.invoke('backup:saveToDrive');
      if (result.success) {
        backupStatus.textContent = 'Backup successfully uploaded to Google Drive!';
        // Refresh backup list
        await listBackups();
      } else {
        console.error('Backup failed:', result.error);
        backupStatus.textContent = `Error: ${result.error}`;
      }
    } catch (err) {
      console.error('Backup error:', err.message);
      backupStatus.textContent = `Error: ${err.message}`;
    }
  });

  // Handle restore button click
  restoreBtn.addEventListener('click', async () => {
    const fileId = backupFilesSelect.value;
    if (!fileId) {
      restoreStatus.textContent = 'Please select a backup file';
      return;
    }
    restoreStatus.textContent = 'Initiating restore...';
    try {
      const result = await ipcRenderer.invoke('backup:restoreFromDrive', fileId);
      if (result.success) {
        restoreStatus.textContent = 'Backup successfully restored!';
      } else {
        console.error('Restore failed:', result.error);
        restoreStatus.textContent = `Error: ${result.error}`;
      }
    } catch (err) {
      console.error('Restore error:', err.message);
      restoreStatus.textContent = `Error: ${err.message}`;
    }
  });

  // Handle download button click
  downloadBtn.addEventListener('click', async () => {
    const fileId = backupFilesSelect.value;
    if (!fileId) {
      restoreStatus.textContent = 'Please select a backup file';
      return;
    }
    restoreStatus.textContent = 'Initiating download...';
    try {
      const selectedOption = backupFilesSelect.options[backupFilesSelect.selectedIndex];
      const fileName = selectedOption.text.split(' (')[0]; // Extract file name
      const result = await ipcRenderer.invoke('backup:downloadFromDrive', fileId, fileName);
      if (result.success) {
        restoreStatus.textContent = `Backup downloaded to ${result.savePath}`;
      } else {
        console.error('Download failed:', result.error);
        restoreStatus.textContent = `Error: ${result.error}`;
      }
    } catch (err) {
      console.error('Download error:', err.message);
      restoreStatus.textContent = `Error: ${err.message}`;
    }
  });
});

// Start a simple server for OAuth callback
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body>
          <h1>Authentication not required</h1>
          <p>Credentials are managed via environment variables.</p>
          <script>
            setTimeout(() => {
              try {
                window.location.href = 'about:blank';
                window.close();
              } catch (e) {
                console.error('Error closing window:', e);
              }
            }, 1000);
          </script>
        </body>
      </html>
    `);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
});
server.listen(3000);