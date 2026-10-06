// Troque a URL pela versão revisada do seu hub no GitHub.
(async () => {
  const url = 'https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/SEU_COMMIT/hub.js';
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`Falha ao carregar NEXUS: HTTP ${response.status}`);
  const source = await response.text();
  (0, eval)(source + '\n//# sourceURL=nexus-hub.js');
})().catch(error => console.error('[NEXUS]', error));
