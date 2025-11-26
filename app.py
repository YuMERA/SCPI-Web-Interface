from flask import Flask, send_file, render_template, request, jsonify
from flask_cors import CORS
import socket
import io
import sys
import pyvisa as visa 

# --- GLOBALNE POSTAVKE ---
DEFAULT_RIGOL_PORT = 5555 
SCPI_COMMAND = ':DISP:DATA? PNG\n' 
TIMEOUT = 5.0 

# NOVO: Direktorijum za čuvanje (sada je trajan, pošto je samo download)
SNAPSHOT_DIR = 'downloaded_snapshots' 
# -------------------------

app = Flask(__name__)
CORS(app)

@app.route('/', methods=['GET'])
def index():
    """Servira pocetnu HTML stranicu iz foldera templates."""
    return render_template('index.html')

# --- POSTOJEĆE RUTE (SCAN, SCREENSHOT, CONTROL, IDENTIFY) ---
# Ove rute ostaju iste kao i pre.

@app.route('/devices', methods=['GET'])
def get_devices():
    """Skenira VISA uređaje i vraća listu objekata (adresa, ime)."""
    rm = None
    try:
        rm = visa.ResourceManager('@py')
        visa_devices = rm.list_resources()
        found_devices = []
        
        print(f"INFO: Found {len(visa_devices)} potential device(s) via VISA. Starting IDN probe...")

        for address in visa_devices:
            if not address:
                continue

            name = address
            
            if 'TCPIP' in address:
                target_ip = None
                try:
                    parts = address.split('::')
                    target_ip = parts[1]
                    target_port = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else DEFAULT_RIGOL_PORT
                except Exception:
                    print(f"WARNING: Invalid TCPIP format for {address}", file=sys.stderr)
                    found_devices.append({"address": address, "name": address})
                    continue 
                
                sock = None
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(1.0) 
                    sock.connect((target_ip, target_port))

                    idn_command = '*IDN?\n'
                    sock.sendall(idn_command.encode('ascii'))
                    
                    sock.settimeout(1.0)
                    response_bytes = sock.recv(2048)
                    response_string = response_bytes.decode('ascii').strip()
                    
                    if response_string:
                        model_name = response_string.split(',')[1].strip()
                        name = f"{model_name} ({target_ip})" 
                        
                except Exception as e:
                    if target_ip:
                        name = f"Unknown Device ({target_ip})"
                    print(f"WARNING: IDN read failed for {target_ip or address}. {e}", file=sys.stderr)
                    
                finally:
                    if sock:
                        sock.close()
            
            found_devices.append({"address": address, "name": name})

        print(f"INFO: Successfully identified {len(found_devices)} device(s).")
        return jsonify({"devices": found_devices}), 200
        
    except Exception as e:
        print(f"ERROR: VISA scanning failed. {e}", file=sys.stderr)
        return jsonify({"devices": [], "error": f"Scanning failed: {e}"}), 500
        
    finally:
        if rm:
            rm.close()

@app.route('/screenshot', methods=['GET'])
def get_screenshot_socket():
    """Ruta koja vraća binarnu PNG sliku ekrana."""
    
    resource_address = request.args.get('address', None)
    
    if not resource_address:
        return jsonify({"error": "No device address provided. Please select a device."}), 400

    try:
        if '::' in resource_address:
            parts = resource_address.split('::')
            target_ip = parts[1]
            target_port = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else DEFAULT_RIGOL_PORT
        else:
            target_ip = resource_address
            target_port = DEFAULT_RIGOL_PORT
            
    except Exception as e:
        return jsonify({"error": f"Invalid device address format: {resource_address}. {e}"}), 400
        
    sock = None
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(TIMEOUT)
        
        sock.connect((target_ip, target_port))

        sock.sendall(SCPI_COMMAND.encode('ascii'))
        
        header = sock.recv(2).decode('ascii')
        if not header.startswith('#'):
            raise Exception(f"Invalid header format: {header}. Not starting with '#'. Received data: {sock.recv(100).decode('ascii', errors='ignore')}")
            
        num_len = int(header[1]) 
        len_str = sock.recv(num_len).decode('ascii')
        data_len = int(len_str) 
        
        image_bytes = b''
        while len(image_bytes) < data_len:
            chunk = sock.recv(min(data_len - len(image_bytes), 4096))
            if not chunk:
                raise Exception("Connection interrupted before receiving the whole image.")
            image_bytes += chunk
            
        try:
            sock.recv(2) 
        except:
            pass
            
        if len(image_bytes) != data_len:
            raise Exception(f"Incomplete data received: Expected {data_len}, got {len(image_bytes)}")
            
        return_file = io.BytesIO(image_bytes)
        return_file.seek(0)
        
        return send_file(return_file, mimetype='image/png')
        
    except socket.timeout:
        print(f"ERROR: Timeout during connection or read operation. ({target_ip}:{target_port})", file=sys.stderr)
        return jsonify({"error": f"Connection Timeout: Check if the device ({target_ip}:{target_port}) is on and the SCPI service is enabled."}), 500
    except ConnectionRefusedError:
        print(f"ERROR: Connection Refused. Port {target_port} is closed on device {target_ip}.", file=sys.stderr)
        return jsonify({"error": f"Connection Refused: Port {target_port} is closed on device."}), 500
    except Exception as e:
        print(f"CRITICAL ERROR: Unexpected error while getting screenshot. {e}", file=sys.stderr)
        return jsonify({"error": f"Critical Error: {e}"}), 500
        
    finally:
        if sock:
            sock.close()

@app.route('/control', methods=['POST'])
def send_scpi_command():
    """Ruta koja salje SCPI komandu (npr. RUN/STOP) odabranom instrumentu."""
    
    data = request.json 
    resource_address = data.get('address')
    command = data.get('command')
    
    if not resource_address or not command:
        return jsonify({"error": "Missing address or command in request."}), 400

    try:
        if '::' in resource_address:
            parts = resource_address.split('::')
            target_ip = parts[1]
            target_port = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else DEFAULT_RIGOL_PORT
        else:
            target_ip = resource_address
            target_port = DEFAULT_RIGOL_PORT
            
    except Exception:
        return jsonify({"error": f"Invalid device address format."}), 400
        
    sock = None
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(TIMEOUT)
        sock.connect((target_ip, target_port))

        full_command = f"{command.strip()}\n" 
        
        print(f"INFO: Sending command {command} to {target_ip}:{target_port}")
        sock.sendall(full_command.encode('ascii'))
        
        sock.settimeout(0.5) 
        try:
            sock.recv(1024) 
        except socket.timeout:
            pass 
            
        return jsonify({"status": f"Command {command} executed successfully."}), 200
        
    except Exception as e:
        print(f"ERROR: Failed to execute command {command}. {e}", file=sys.stderr)
        return jsonify({"error": f"Failed to execute command {command}. {e}"}), 500
        
    finally:
        if sock:
            sock.close()

@app.route('/identify', methods=['POST'])
def identify_device():
    """Šalje *IDN? komandu izabranom instrumentu i vraća identifikacioni string."""
    
    data = request.json
    resource_address = data.get('address')
    
    if not resource_address:
        return jsonify({"error": "Missing device address."}), 400

    try:
        if '::' in resource_address:
            parts = resource_address.split('::')
            target_ip = parts[1]
            target_port = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else DEFAULT_RIGOL_PORT
        else:
            target_ip = resource_address
            target_port = DEFAULT_RIGOL_PORT
            
    except Exception:
        return jsonify({"error": f"Invalid device address format."}), 400
        
    sock = None
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(TIMEOUT)
        sock.connect((target_ip, target_port))

        idn_command = '*IDN?\n' 
        
        print(f"INFO: Sending command {idn_command.strip()} to {target_ip}:{target_port}")
        sock.sendall(idn_command.encode('ascii'))
        
        sock.settimeout(1.0)
        
        response_bytes = sock.recv(2048)
        response_string = response_bytes.decode('ascii').strip()
        
        if not response_string:
            raise Exception("No identification string received from the device.")
            
        return jsonify({"info": response_string}), 200
        
    except Exception as e:
        print(f"ERROR: Failed to identify device. {e}", file=sys.stderr)
        return jsonify({"error": f"Failed to connect and identify device: {e}"}), 500
        
    finally:
        if sock:
            sock.close()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)