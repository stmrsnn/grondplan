import { expect, test, type Page } from "@playwright/test";

/** De ruimtes uit het overzicht rechts: ["Living 20,0 m²", …]. */
async function overview(page: Page) {
  for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");
  return (await page.locator("aside ul li").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
}

/** Maatlabels op het plan met hun schermpositie. */
async function chips(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("svg[role=application] g[data-ui]")].map((g) => {
      const r = g.getBoundingClientRect();
      return { t: g.querySelector("text")!.textContent!.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
}

async function canvas(page: Page) {
  const box = (await page.locator("svg[role=application]").boundingBox())!;
  return box;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("hint-tekenvlak", "gezien"));
  await page.goto("/proefbank");
  await expect(page.getByRole("toolbar", { name: "Gereedschap" })).toBeVisible();
});

test("kamer tekenen met getypte binnenmaten", async ({ page }) => {
  const box = await canvas(page);
  await page.keyboard.press("k");
  await page.mouse.click(box.x + 600, box.y + 200);
  await page.mouse.move(box.x + 800, box.y + 400);
  await page.keyboard.type("5x4");
  await page.keyboard.press("Enter");
  // meteen de functie kiezen
  await page.getByRole("group", { name: "Wat voor ruimte is dit?" }).getByRole("button", { name: "Living" }).click();
  expect(await overview(page)).toEqual(["Living 20,0 m²", "Gelijkvloers 20,0 m²"]);
});

test("kamer opdelen met een muur, maat typen en ongedaan maken", async ({ page }) => {
  const box = await canvas(page);
  await page.keyboard.press("k");
  await page.mouse.click(box.x + 600, box.y + 200);
  await page.mouse.move(box.x + 800, box.y + 400);
  await page.keyboard.type("5x4");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await expect.poll(async () => (await chips(page)).filter((c) => c.t === "5,00 m").length).toBe(2);
  const top = (await chips(page)).filter((c) => c.t === "5,00 m").sort((a, b) => a.y - b.y);
  await page.keyboard.press("m");
  await page.mouse.click(top[0].x, top[0].y - 30);
  await page.mouse.move(top[0].x, top[1].y + 15);
  await page.mouse.click(top[0].x, top[1].y + 30);
  expect(await overview(page)).toHaveLength(3);

  const first = (await chips(page)).sort((a, b) => Math.round(a.y) - Math.round(b.y) || a.x - b.x)[0];
  await page.mouse.click(first.x, first.y);
  const input = page.getByLabel("Nieuwe maat");
  await input.fill("2");
  await input.press("Enter");
  const after = await overview(page);
  expect(after.some((t) => t.endsWith("8,0 m²"))).toBe(true);

  await page.keyboard.press("Control+z");
  expect(await overview(page)).not.toEqual(after);
});

test("standaardkamer stempelen tegen een andere: gedeelde muur wordt binnenmuur", async ({ page }) => {
  const box = await canvas(page);
  await page.keyboard.press("k");
  await page.mouse.click(box.x + 550, box.y + 200);
  await page.mouse.move(box.x + 750, box.y + 400);
  await page.keyboard.type("4x3");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  // badkamer van 2,5 × 2 tegen de rechterbovenhoek (hartlijn) van de eerste kamer
  const walls = await page.evaluate(() => {
    const r = document.querySelector('svg[role=application] g[transform^="translate"] path')!.parentElement!.getBoundingClientRect();
    return { x1: r.x + r.width, y0: r.y };
  });
  await page.keyboard.press("k");
  await page.getByRole("button", { name: /Badkamer 2,5×2/ }).click();
  const outer = await page.evaluate(() => {
    const p = [...document.querySelectorAll('svg[role=application] g[transform^="translate"] path')].find((x) => x.getAttribute("fill") === "var(--wall-fill)")!;
    const r = p.getBoundingClientRect();
    return { x1: r.x + r.width, y0: r.y };
  });
  void walls;
  await page.mouse.move(outer.x1 - 14, outer.y0 + 14);
  await page.mouse.click(outer.x1 - 14, outer.y0 + 14);
  const rooms = await overview(page);
  // beide kamers houden exact hun binnenmaat, ook al werd de gedeelde muur dunner
  expect(rooms).toContain("Badkamer 5,0 m²");
  expect(rooms).toContain("Ruimte 1 12,0 m²");
});

test("living met een minder diepe keuken ernaast: beide exact", async ({ page }) => {
  const box = await canvas(page);
  await page.keyboard.press("k");
  await page.mouse.click(box.x + 420, box.y + 230);
  await page.mouse.move(box.x + 640, box.y + 400);
  await page.keyboard.type("6x4,5");
  await page.keyboard.press("Enter");
  await page.getByRole("group", { name: "Wat voor ruimte is dit?" }).getByRole("button", { name: "Living" }).click();
  const outer = await page.evaluate(() => {
    const p = [...document.querySelectorAll('svg[role=application] g[transform^="translate"] path')].find((x) => x.getAttribute("fill") === "var(--wall-fill)")!;
    const r = p.getBoundingClientRect();
    return { x1: r.x + r.width, y0: r.y };
  });
  await page.getByRole("button", { name: /Keuken 3,5×3/ }).click();
  await page.mouse.move(outer.x1 - 13, outer.y0 + 13);
  await page.mouse.click(outer.x1 - 13, outer.y0 + 13);
  const rooms = await overview(page);
  expect(rooms).toContain("Living 27,0 m²");
  expect(rooms).toContain("Keuken 10,5 m²");
});

test("muren zijn op schaal getekend", async ({ page }) => {
  const box = await canvas(page);
  await page.keyboard.press("k");
  await page.mouse.click(box.x + 600, box.y + 200);
  await page.mouse.move(box.x + 800, box.y + 400);
  await page.keyboard.type("5x4");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  // de zoom staat in de werkbalk; 100 % = 1 px per cm
  const pct = Number((await page.getByTitle("Alles in beeld (0)").first().innerText()).replace("%", ""));
  const wallBox = await page.evaluate(() => {
    const p = [...document.querySelectorAll('svg[role=application] g[transform^="translate"] path')].find((x) => x.getAttribute("fill") === "var(--wall-fill)")!;
    const r = p.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  // buitenmaat = 5,00 + 2 × 0,35 = 5,70 m en 4,70 m
  const pxPerMm = (pct / 100) * 0.1;
  expect(wallBox.w).toBeGreaterThan(5700 * pxPerMm * 0.98);
  expect(wallBox.w).toBeLessThan(5700 * pxPerMm * 1.02);
  expect(wallBox.h).toBeGreaterThan(4700 * pxPerMm * 0.98);
  expect(wallBox.h).toBeLessThan(4700 * pxPerMm * 1.02);
});

test("muurketting met getypte lengtes sluit tot een ruimte", async ({ page }) => {
  const box = await canvas(page);
  await page.keyboard.press("m");
  await page.mouse.click(box.x + 550, box.y + 200);
  await page.mouse.move(box.x + 700, box.y + 200);
  await page.keyboard.type("6");
  await page.keyboard.press("Enter");
  await page.mouse.move(box.x + 550 + 500, box.y + 400);
  await page.keyboard.type("4");
  await page.keyboard.press("Enter");
  await page.mouse.move(box.x + 400, box.y + 200 + 330);
  await page.keyboard.type("6");
  await page.keyboard.press("Enter");
  await page.mouse.move(box.x + 550, box.y + 230);
  await page.mouse.click(box.x + 550, box.y + 201);
  expect(await overview(page)).toEqual(["Ruimte 1 20,6 m²", "Gelijkvloers 20,6 m²"]);
});

test("tekenen met de vinger op een tablet @tablet", async ({ page }) => {
  const box = await canvas(page);
  await page.getByRole("button", { name: "Kamer", exact: true }).tap();
  await page.getByRole("button", { name: /Slaapkamer 3,5×3/ }).tap();
  await page.touchscreen.tap(box.x + 600, box.y + 300);
  // op een tablet is het zijpaneel dicht: lees de ruimte uit de tekening
  await expect(page.locator("svg[role=application] text", { hasText: /^Slaapkamer$/ })).toBeVisible();
  await expect(page.locator("svg[role=application] text", { hasText: "10,5 m²" })).toBeVisible();
});
