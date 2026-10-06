// NEXUS Hub Loader — Versão pronta para seu repositório
(async () => {
  const url = 'https://raw.githubusercontent.com/arthurizao/nexus-hub/master/hub.js';
  console.log('[NEXUS] Baixando última versão de:', url);
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`Falha ao carregar NEXUS: HTTP ${response.status}`);
  const source = await response.text();
  (0, eval)(source + '\n//# sourceURL=nexus-hub.js');
  console.log('[NEXUS] Hub injetado com sucesso! Pressione Alt + Shift + N para abrir.');
})().catch(error => console.error('[NEXUS]', error));
