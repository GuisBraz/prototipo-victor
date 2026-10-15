@echo off
rem MECABOM Lite: abre o protótipo num servidor local (só no seu computador, nada vai para a internet).
rem Precisa do Python instalado. Para encerrar, feche a janela "MECABOM Lite - servidor".
cd /d "%~dp0"
start "MECABOM Lite - servidor" /min python -m http.server 8000 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" "http://localhost:8000/index.html"
