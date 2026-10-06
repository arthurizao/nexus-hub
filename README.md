# NEXUS YouTube Power Hub — 2.0.0 (Glassmorphism Edition)

Overlay profissional e suíte de produtividade e controle para o **YouTube** e reprodutores de vídeo web.
Construído com **Glassmorphism**, paleta oficial do YouTube (Vermelho `#FF0033`, Preto Fosco `#0F0F0F`, desfoque translúcido), isolamento via **Shadow DOM** e sem dependências externas.

---

## 🚀 Funcionalidades Incríveis

### ⚡ Player Master & Reprodução
1. **Controle Preciso de Velocidade Contínua:** Ajuste fino de 0.25x até 5.0x (ultrapassando o limite padrão de 2.0x do YouTube) com presets rápidos.
2. **Volume Booster até 600%:** Amplificação de ganho via Web Audio API para vídeos com áudio baixo, podcasts ou videoaulas com gravação silenciosa.
3. **Captura de Tela HD (Screenshot do Frame):** Captura o frame exato do vídeo na resolução máxima do streaming em PNG com 1 clique.
4. **Picture-in-Picture (PiP) Forçado:** Destaca o vídeo em uma janela flutuante no sistema operacional.
5. **Avanço/Retrocesso Rápido:** Atalhos para pular 10s ou 30s.
6. **Detector & Skip de Anúncios:** Muta e acelera o término de anúncios.

### 📥 Download de Vídeo & Áudio
- **Download Integrado com Seleção de Resolução:** Baixe em `1080p (Full HD)`, `720p (HD)`, `480p` ou extraia `Apenas Áudio (MP3)`.
- **API Cobalt Integrada:** Conecta a instâncias públicas de processamento de alta velocidade para gerar o arquivo sem pop-ups ou anúncios.
- **Atalhos Rápidos de 1-Clique:** Acesso direto ao Cobalt Web, 10Downloader e gerador de comando `yt-dlp` para terminal.

### 🎨 Cinema & Calibração Visual
- **Filtros em Tempo Real:** Controle direto de Brilho, Contraste e Saturação no elemento `<video>`.
- **Modos Predefinidos:** *Cores Vívidas*, *Modo Noturno Amoled* (reduz brilho e eleva contraste para telas OLED), *Preto & Branco* e *Sepia/Leitura*.

### 🔁 A-B Looper (Repetição Contínua)
- Marque o **Ponto A (Início)** e o **Ponto B (Fim)** para repetir um trecho específico em loop contínuo.
- Indispensável para aprender passos de dança, solos musicais, tutoriais de código ou trechos de aulas.

### 📝 Notas com Timestamp & Estudo
- Crie anotações com timestamps automáticos sincronizados com o segundo exato do vídeo.
- Clique no timestamp para pular imediatamente até aquele trecho.
- Salva no `localStorage` separado por ID de cada vídeo.
- Exportação em formato **Markdown** com links prontos para a descrição do YouTube.

### ⏱ Gerador de Capítulos do YouTube
- Marque momentos do vídeo e gere a lista padronizada do YouTube (`00:00 Introdução`, `03:45 Demonstração`, etc.).
- Botão para copiar a lista pronta para a descrição ou comentário fixado.

### 🛠 Extrator de Thumbnails & SEO Tools
- Extração de miniaturas do vídeo atual em **MaxRes (1080p/4K)**, **HQ (720p)** e **MQ**.
- **Calculadora de Playlist/Vídeo:** Descubra exatamente quanto tempo você vai demorar para assistir um vídeo ou curso inteiro em 1.25x, 1.5x, 1.75x ou 2.0x.

### 🧘 Modo Zen & Shorts Converter
- **Modo Zen:** Oculta barra lateral de recomendações, comentários e distrações para foco total no conteúdo.
- **Conversor de Shorts para Player Padrão:** Transforma links `/shorts/ID` na interface normal do `/watch?v=ID` (devolvendo a barra de progresso, velocidade e tela cheia completa).

### 🪟 Interface Glassmorphism & Mini HUD
- **Mini HUD Flutuante:** Encolhe para uma barra compacta com controle de velocidade e botão de screenshot.
- Janela arrastável, redimensionável e com controle de opacidade.
- Atalho global: <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd> (ou <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd> para o Mini HUD).

---

## ⚡ Como Carregar no YouTube

### Método 1: Direto no Console do YouTube (Recomendado)
1. No seu terminal, copie todo o script para o Clipboard:
   ```powershell
   Get-Content hub.js -Raw | Set-Clipboard
   ```
2. Abra o [YouTube](https://www.youtube.com), aperte <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd> para abrir o Console.
3. Cole com <kbd>Ctrl</kbd> + <kbd>V</kbd> e aperte <kbd>Enter</kbd>.

### Método 2: Testar Localmente
Abra [`preview.html`](preview.html) em qualquer navegador para experimentar o hub com o player de vídeo integrado.
