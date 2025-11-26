import subprocess
import time
import webbrowser
import socket
import sys

# --- PODEŠAVANJA ---
FLASK_SCRIPT = 'app.py'
SERVER_PORT = 5000
# -------------------

def get_local_ip():
    """Pronalazi lokalnu IP adresu računara."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80)) 
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"

if __name__ == '__main__':
    local_ip = get_local_ip()
    server_url = f"http://{local_ip}:{SERVER_PORT}/"
    
    # 1. Pokretanje Flask-a
    # Pokrecemo Flask u novom, minimizovanom CMD prozoru
    # Koristimo start /min za minimizaciju
    # Koristimo cmd /k da ostane otvoren dok korisnik ne zatvori
    subprocess.Popen([
        'start', 'Flask Server', '/min', 'cmd', '/k', 
        sys.executable, FLASK_SCRIPT
    ], shell=True)
    
    # 2. Sacekajte 3 sekunde da se server podigne
    time.sleep(3)
    
    # 3. Otvaranje pregledača na dinamički utvrđenoj adresi
    webbrowser.open(server_url)
    
    # 4. Izlaz iz skripte. Flask nastavlja da radi u minimizovanom prozoru.
    print(f"Server pokrenut. URL za LAN: {server_url}. CMD prozor je minimizovan.")
    print("Zatvorite minimizovani prozor da zaustavite aplikaciju.")