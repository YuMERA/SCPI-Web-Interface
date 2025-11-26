// Sva frontend logika za komunikaciju sa serverom i Capture Modal

// --- KONSTANTE I GLOBALNE VARIJABLE ---

const IMAGE_ELEMENT = document.getElementById('screenshot-image');
const STATUS_ELEMENT = document.getElementById('status-message');
const DEVICE_SELECT_ELEMENT = document.getElementById('device-select');
const SCREENSHOT_BUTTON = document.getElementById('screenshot-button'); // Sada služi za otvaranje modala
const DEVICE_INFO_ELEMENT = document.getElementById('device-info');
const CONNECT_BUTTON = document.getElementById('connect-button'); 
const COMMAND_BUTTONS = document.querySelectorAll('.command-group button'); 

// Modal Konstante
const MODAL = document.getElementById('image-modal');
const MODAL_IMAGE = document.getElementById('modal-image');
const CAPTURE_BUTTON = document.getElementById('screenshot-button');

// Server Rute
const BACKEND_URL_SCREENSHOT = '/screenshot';
const BACKEND_URL_DEVICES = '/devices';
const BACKEND_URL_CONTROL = '/control';

const REFRESH_RATE_MS = 1000; 

// Globalno stanje
let refreshIntervalId = null; 
let isConnected = false;
let currentModalBlobUrl = null;

// --- POMOĆNE FUNKCIJE STABILNOSTI I INTERFEJSA ---

function updateStatus(message, type = 'info') {
    STATUS_ELEMENT.textContent = message;
    STATUS_ELEMENT.style.color = 
        type === 'error' ? 'red' : 
        type === 'success' ? 'lightgreen' : '#FFFFFF';
}

function updateInterfaceState() {
    DEVICE_SELECT_ELEMENT.disabled = isConnected; 
    
    if (isConnected) {
        CONNECT_BUTTON.textContent = 'DISCONNECT';
        CONNECT_BUTTON.classList.remove('btn-connect');
        CONNECT_BUTTON.classList.add('btn-disconnect');

        COMMAND_BUTTONS.forEach(btn => btn.disabled = false);
        CAPTURE_BUTTON.disabled = false;
        
        startLiveStream(); 
        
    } else {
        CONNECT_BUTTON.textContent = 'CONNECT';
        CONNECT_BUTTON.classList.remove('btn-disconnect');
        CONNECT_BUTTON.classList.add('btn-connect');

        COMMAND_BUTTONS.forEach(btn => btn.disabled = true);
        CAPTURE_BUTTON.disabled = true;

        stopLiveStream(); 
        
        IMAGE_ELEMENT.src = '';
        IMAGE_ELEMENT.classList.add('scope-screen');
        DEVICE_INFO_ELEMENT.textContent = 'Device not connected.';
    }
}

function startLiveStream() {
    if (refreshIntervalId !== null) return;
    refreshIntervalId = setInterval(getScreenshot, REFRESH_RATE_MS);
    getScreenshot(false); 
}

function stopLiveStream() {
    if (refreshIntervalId === null) return;
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
}

// --- FUNKCIJE ZA MODAL ---

function openModal() {
    if (!currentModalBlobUrl) return;
    MODAL_IMAGE.src = currentModalBlobUrl; 
    MODAL.style.display = 'block';
}

function closeModal() {
    MODAL.style.display = 'none';
    if (currentModalBlobUrl) {
        URL.revokeObjectURL(currentModalBlobUrl); // Oslobodi memoriju
    }
    currentModalBlobUrl = null;
}

// Zatvaranje modala klikom van njega
window.onclick = function(event) {
    if (event.target === MODAL) {
        closeModal();
    }
}

// printSnapshot funkcija koja koristi iframe
function printSnapshot() {
    
    // Dohvati Modal i sliku
    const modalContent = MODAL.querySelector('.modal-content').outerHTML;
    
    // 1. Dohvati iframe
    const printFrame = document.getElementById('print-frame');
    const frameDoc = printFrame.contentDocument || printFrame.contentWindow.document;

    // 2. Kreiranje HTML sadržaja za štampanje
    frameDoc.open();
    frameDoc.write(`
        <html>
        <head>
            <title>Print Capture</title>
            <style>
                /* Orijentacija i margina */
                @page {
                    size: landscape;
                    margin: 10mm;
                }
                body {
                    font-family: sans-serif;
                    margin: 0;
                    padding: 0;
                    background: white;
                    color: black;
                }
                .modal-content {
                    width: 100%;
                    max-width: 100%;
                    margin: 0;
                    padding: 0;
                    box-shadow: none;
                    border: none;
                }
                #modal-image {
                    max-width: 95%;
                    height: auto;
                    display: block;
                    margin: 10mm auto; /* Centriranje na papiru */
                    
                    /* Inverzija boja radi uštede tonera */
                    filter: invert(100%); 
                    border: none;
                }
                .modal-footer, .close-button {
                    display: none;
                }
                .modal-header {
                    font-style: italic;
                    color: white;
                }
            </style>
        </head>
        <body>
            ${modalContent}
        </body>
        </html>
    `);
    frameDoc.close();

    // 3. Pokretanje štampe
    printFrame.contentWindow.focus();
    printFrame.contentWindow.print();
    
    updateStatus('Print initiated.', 'info');
}

function downloadSnapshot() {
    if (!currentModalBlobUrl) {
        return updateStatus('Download Error: No image data in modal.', 'error');
    }

    try {
        updateStatus('Initiating client download...', 'info');

        // Kreiranje virtuelnog linka i simulacija klika za download
        const a = document.createElement('a');
        a.href = currentModalBlobUrl; // Koristimo već postojeći URL
        
        // Generisanje imena fajla (kao i pre)
        const now = new Date();
        const timestamp = now.getFullYear().toString().padStart(4, '0') + 
                          '-' + (now.getMonth() + 1).toString().padStart(2, '0') + 
                          '-' + now.getDate().toString().padStart(2, '0') + 
                          '_' + now.getHours().toString().padStart(2, '0') + 
                          '-' + now.getMinutes().toString().padStart(2, '0') + 
                          '-' + now.getSeconds().toString().padStart(2, '0');
        
        a.download = `screenshot_SCPI_${timestamp}.png`; 

        document.body.appendChild(a);
        a.click();
        
        // Čišćenje
        document.body.removeChild(a);
    
        
        updateStatus('File download initiated successfully.', 'success');
        
    } catch (error) {
        updateStatus(`Client Download Error: Could not prepare file for download. ${error.message}`, 'error');
    }
}

// --- GLAVNE RUTE I AKCIJE (SCAN, CONNECT, SCREENSHOT) ---

async function scanDevices() {
    DEVICE_SELECT_ELEMENT.innerHTML = ''; 
    DEVICE_SELECT_ELEMENT.disabled = true;
    CONNECT_BUTTON.disabled = true; 

    updateStatus('Scanning local network for devices...');

    try {
        const response = await fetch(BACKEND_URL_DEVICES);
        const data = await response.json();

        if (response.ok && data.devices && Array.isArray(data.devices)) {
            const devices = data.devices; 
            if (devices.length > 0) {
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = '--- Select Device ---';
                DEVICE_SELECT_ELEMENT.appendChild(defaultOption);
                
                devices.forEach(device => { 
                    const option = document.createElement('option');
                    option.value = device.address;    
                    option.textContent = device.name;  
                    DEVICE_SELECT_ELEMENT.appendChild(option);
                });
                
                DEVICE_SELECT_ELEMENT.disabled = false;
                CONNECT_BUTTON.disabled = false;
                updateStatus(`Found ${devices.length} VISA device(s). Select one and press CONNECT.`, 'info');
                
            } else {
                // *** LOGIKA ZA PRAZNU LISTU ***
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No compatible VISA devices found'; // Poruka u Select Boxu
                option.disabled = true; // Onemogući selekciju
                option.selected = true; // Postavi je kao vidljivu
                DEVICE_SELECT_ELEMENT.appendChild(option);
                
                DEVICE_SELECT_ELEMENT.disabled = true; // Ostaje onemogućen
                CONNECT_BUTTON.disabled = true; // Ostaje onemogućen
                updateStatus('No compatible VISA devices found on the network. Refresh page to rescan.', 'error');
                // *** KRAJ IZMENE ***
            }
        } else {
            updateStatus(`Scan Error: ${data.error || 'Unknown server error during scan.'} Refresh page to rescan.`, 'error');
        }
    } catch (error) {
        updateStatus(`Connection Error: Could not connect to device scanner. Refresh page to rescan. ${error.message}`, 'error');
    } finally {
        if (DEVICE_SELECT_ELEMENT.options.length > 0) {
            DEVICE_SELECT_ELEMENT.disabled = false;
        }
    }
}

async function toggleConnection() {
    const selectedAddress = DEVICE_SELECT_ELEMENT.value;
    
    if (isConnected) {
        isConnected = false;
        updateInterfaceState();
        updateStatus('Disconnected from the device.', 'info');
        DEVICE_SELECT_ELEMENT.value = ''; 
        return;
    }

    if (!selectedAddress) {
        return updateStatus('Error: Select a device before connecting.', 'error');
    }

    CONNECT_BUTTON.disabled = true;
    updateStatus('Attempting connection and identification...', 'info');
    
    try {
        const response = await fetch('/identify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: selectedAddress })
        });
        
        const data = await response.json();

        if (response.ok) {
            const rawInfo = data.info;
            const infoParts = rawInfo.split(',');
            const formattedInfo = `Manufacturer: ${infoParts[0]} | Model: ${infoParts[1]} | S/N: ${infoParts[2]} | FW: ${infoParts[3]}`;
            
            DEVICE_INFO_ELEMENT.textContent = formattedInfo;
            isConnected = true; 
            updateInterfaceState(); 
            
        } else {
            DEVICE_INFO_ELEMENT.textContent = 'Device not connected.';
            updateStatus(`Connection failed: ${data.error || 'Unknown error'}`, 'error');
            isConnected = false; 
            updateInterfaceState();
        }
    } catch (error) {
        DEVICE_INFO_ELEMENT.textContent = 'Device not connected.';
        updateStatus(`Connection Error: ${error.message}`, 'error');
        isConnected = false;
        updateInterfaceState();
    } finally {
        CONNECT_BUTTON.disabled = false;
    }
}

async function getScreenshot(isManualCapture = false) {
    const selectedAddress = DEVICE_SELECT_ELEMENT.value;
    
    if (!selectedAddress) {
        if (refreshIntervalId !== null) {
            stopLiveStream(); 
            isConnected = false;
            updateInterfaceState();
        }
        return;
    }
    
    // Ako nije ručno hvatanje (iz modala), samo osvežavamo Live Stream
    if (isManualCapture) {
        CAPTURE_BUTTON.disabled = true;
        updateStatus('Fetching fresh snapshot for modal...', 'info');
    }

    try {
        const response = await fetch(`${BACKEND_URL_SCREENSHOT}?address=${encodeURIComponent(selectedAddress)}`);

        if (response.ok) {
            const imageBlob = await response.blob();
            const imageObjectURL = URL.createObjectURL(imageBlob);
            
            IMAGE_ELEMENT.src = imageObjectURL;
            IMAGE_ELEMENT.classList.remove('scope-screen'); 
            
            if (isManualCapture) {
                currentModalBlobUrl = imageObjectURL;
                openModal();
            }
            
        } else {
            const errorData = await response.json();
            const errorMessage = `Server Error: ${errorData.error || 'Unknown error'}`;
            updateStatus(errorMessage, 'error');
            
            stopLiveStream(); 
            isConnected = false;
            updateInterfaceState();
        }
    } catch (error) {
        const errorMessage = `Connection Error: ${error.message}`;
        updateStatus(errorMessage, 'error');
        
        stopLiveStream(); 
        isConnected = false;
        updateInterfaceState();
        
    } finally {
        if (isManualCapture) {
             CAPTURE_BUTTON.disabled = false;
             updateStatus('Snapshot captured. Stream resumed.', 'success');
        }
    }
}

function openCaptureModal() {
    getScreenshot(true);
}

async function sendCommand(command) {
    const selectedAddress = DEVICE_SELECT_ELEMENT.value;
    
    if (!isConnected) {
        return updateStatus('Error: You must be connected to send a command.', 'error');
    }
    
    COMMAND_BUTTONS.forEach(btn => btn.disabled = true);
    CONNECT_BUTTON.disabled = true; 
    CAPTURE_BUTTON.disabled = true;
    
    updateStatus(`Executing command: ${command}...`, 'info');

    try {
        const response = await fetch(BACKEND_URL_CONTROL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: selectedAddress,
                command: command
            })
        });

        const data = await response.json();

        if (response.ok) {
            updateStatus(`Command ${command} executed successfully.`, 'success');
        } else {
            updateStatus(`Command Error (${command}): ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        updateStatus(`Connection Error during command: ${error.message}`, 'error');
    } finally {
        if (isConnected) {
             COMMAND_BUTTONS.forEach(btn => btn.disabled = false);
             CONNECT_BUTTON.disabled = false;
             CAPTURE_BUTTON.disabled = false;
        }
    }
}


// --- INICIJALIZACIJA ---

window.onload = () => {
    updateInterfaceState(); 
    scanDevices(); 
}