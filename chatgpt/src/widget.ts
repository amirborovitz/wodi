import { App } from '@modelcontextprotocol/ext-apps';
const app = new App({ name: 'Wodi posters', version: '1.0.0' }, {});
app.ontoolresult = result => {
  const images = result._meta?.images;
  const root = document.getElementById('posters')!;
  root.replaceChildren();
  if (!Array.isArray(images)) { root.textContent = 'No poster available.'; return; }
  for (const [index, source] of images.entries()) {
    if (typeof source !== 'string' || !source.startsWith('data:image/png;base64,')) continue;
    const img = document.createElement('img');
    img.src = source; img.alt = `Wodi workout poster, page ${index + 1}`;
    img.style.cssText = 'display:block;width:100%;height:auto;margin:0 auto 12px;max-width:540px';
    root.append(img);
  }
};
await app.connect();
