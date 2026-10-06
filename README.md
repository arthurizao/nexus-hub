# NEXUS Hub — 1.2.0 (Ultimate Personal Command Center)

Hub JavaScript modular projetado para ser executado como overlay no cliente do Discord ou em navegadores. Interface 100% isolada por **Shadow DOM**, com painel arrastável, redimensionável, modo Mini-Dock compacto, estética neon glassmorphism e persistência local (`localStorage`). Zero dependências externas de runtime.

---

## ⚡ Começar Rápido

1. **Preview Standalone:** Abra [`preview.html`](preview.html) em qualquer navegador moderno para explorar o painel interativo.
2. **Repositório Git:** O projeto já possui repositório Git local e `.gitignore` configurado. Para sincronizar com o GitHub:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/nexus-hub.git
   git push -u origin master
   ```
3. **Loader no Discord:** Abra [`loader.js`](loader.js), altere para a URL raw do seu commit no GitHub e execute no console do Discord/Vencord.
4. **Controles e Atalhos:**
   - <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd>: Abrir / Ocultar o NEXUS Hub.
   - <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd>: Alternar para o modo Mini-Dock flutuante.
   - <kbd>Esc</kbd>: Fechar / Ocultar a janela.
   - Botão `—`: Minimizar.
   - Botão `⛶`: Alternar tela cheia / modo janela.
   - Botão `⊟`: Encolher para Mini-Dock.
   - Botão `×`: Descarregar completamente o hub da memória.

---

## 🚀 Ferramentas e Funcionalidades

### ◈ Principal
- **Command Center:** Busca em tempo real com estatísticas rápidas de tarefas, textos e favoritos.
- **Radar do Servidor:** Leitura de cargos, cores hexadecimais, IDs e membros em cache via stores internos do Vencord.
- **Embed & Webhook Studio:** Construtor visual de Discord Embeds com prévia em tempo real idêntica ao Discord, exportação para JSON e disparo direto via Webhook.

### ✎ Produtividade
- **Cyber Tarefas:** Gerenciador de afazeres local com prioridades (Alta, Média, Baixa), cálculo de taxa de conclusão e barra de progresso.
- **Bloco de Notas Inteligente:** Salva notas isoladas por servidor do Discord ou no escopo global.
- **Textos Prontos:** Biblioteca de mensagens, modelos e respostas rápidas com cópia em 1 clique.
- **Favoritos do Discord:** Links diretos salvos para canais e mensagens com detecção do canal atual.

### ♬ Áudio & Estilo
- **Soundscapes Web Audio:** Gerador de ruídos e ambiências sintetizados em tempo real (0 arquivos de áudio externos):
  - *Chuva Cyberpunk* (pink/brown noise filtrado)
  - *Deep Space Drone* (duplo oscilador grave 55Hz)
  - *432Hz Harmonic Beats* (frequência de foco alfa)
  - *Zumbido de Neon 60Hz* (ressonância elétrica cyberpunk)
  - Controle de volume e visualizador dinâmico de ondas.
- **Texto & Estilos:** Conversor de texto para fontes unicode (Gótico/Fraktur, Bold Sans, Italic, Círculos, Upside-down), gerador de Glitch Zalgo com slider e atalhos de Markdown do Discord.
- **Color Studio:** Seletor de cores com conversão instantânea para HEX, RGB, HSL e **Discord Integer Color** (formato numérico decimal essencial para desenvolvedores de bots), com cálculo de contraste WCAG.
- **Biblioteca Kaomoji:** Seleção de emoticons clássicos japoneses para envio imediato.

### ☀ Consultas & Utilitários
- **Cripto Ticker:** Cotações ao vivo de Bitcoin (BTC), Ethereum (ETH), Solana (SOL), BNB, XRP e DOGE em USD e BRL via API pública do CoinGecko.
- **Previsão do Tempo:** Geocodificação de cidades e previsão climática de 3 dias via Open-Meteo.
- **Tradutor:** Tradução rápida em múltiplos idiomas via MyMemory.
- **GitHub Explorer:** Consulta pública de repositórios, estrelas, forks, linguagem e último push.
- **Discord Timestamps:** Gerador dos 7 formatos nativos de timestamp dinâmico `<t:timestamp:F>`.
- **Modo Foco (Pomodoro):** Timer com notificação sonora e sincronização com o Mini-Dock.
- **Cyber-Breach Game:** Minigame de hacking inspirado no universo Cyberpunk 2077 para entretenimento tático.
- **Diagnóstico & Ping:** Teste de latência de rede em tempo real contra o Discord Gateway, Cloudflare e Google DNS.
- **Snowflake Decoder:** Conversão de IDs de usuários/canais do Discord para timestamp exato de criação.
- **Formatador JSON & Sorteador Criptográfico:** Utilitários para formatação e sorteios sem viés pseudoaleatório (`crypto.getRandomValues`).

---

## 🔒 Privacidade & Segurança

- **Zero Telemetria:** Nenhuma informação privada, credencial ou token é interceptado ou enviado a servidores de terceiros.
- **Armazenamento Local:** Todas as notas, snippets, tarefas e preferências residem exclusivamente no `localStorage` do seu navegador/cliente.
- **Exportação & Backup v2:** Backup e restauração completos em formato JSON com sanitização e retrocompatibilidade com a versão 1.0.

---

## 📚 Fontes e APIs Utilizadas

- [Open-Meteo Weather API](https://open-meteo.com/en/docs) (CC BY 4.0)
- [CoinGecko Simple Price API](https://www.coingecko.com/en/api)
- [GitHub REST API](https://docs.github.com/en/rest/repos/repos)
- [MyMemory Translation API](https://mymemory.translated.net/doc/spec.php)
