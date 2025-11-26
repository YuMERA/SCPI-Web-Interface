@echo off
REM Ovaj fajl je dvoklik resenje za korisnika.
echo Pokretanje RIGOL Screenshot Utility-a by mera-system...

REM Pokreće nas Python skript koji ce automatski pronaci IP adresu i pokrenuti Flask.
REM Koristimo START /B da se ova BAT skripta odmah zatvori i ostavi run.py da radi.
start /B "" "python" "run.py"

exit