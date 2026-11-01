// Outil de diagnostic : éléments qui dépassent la largeur de l'écran sur une page d'administration.
//   PLAYWRIGHT_CORE_DIR=… node tests/e2e/premium/debug-overflow.mjs <largeur> [onglet] [rubrique IA]
import { WEB, loginUi, neutralize, pw, tempAdmin } from './harness.mjs';

const [width = '390', tab = 'Intelligence artificielle', section = 'Assistants et affectations'] = process.argv.slice(2);
const admin = await tempAdmin('debug');
const browser = await pw.chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 }, isMobile: true, hasTouch: true });
  await neutralize(ctx);
  const p = await ctx.newPage();
  await p.goto(`${WEB}/admin`);
  await p.getByLabel('E-mail').waitFor();
  await loginUi(p, admin);
  await p.getByRole('heading', { name: 'Dashboard Admin' }).waitFor({ timeout: 20_000 });
  await p.getByRole('tab', { name: new RegExp(tab) }).click();
  if (section) await p.getByRole('button', { name: new RegExp(section) }).click();
  await p.waitForTimeout(2500);
  const offenders = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')].map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.right > vw + 1 && r.width > 0 && !el.closest('[role="tablist"]'))
      .slice(0, 12)
      .map(({ el, r }) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(r.right)} (${Math.round(r.width)}) « ${(el.textContent || '').trim().slice(0, 40)} »`);
  });
  console.log(offenders.join('\n') || 'aucun dépassement');
} finally {
  await browser.close();
  await admin.remove();
}
