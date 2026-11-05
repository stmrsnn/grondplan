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

  await expect.poll(async () => (await chips(page)).filter((c) => c.t === "5,00").length).toBe(2);
  const top = (await chips(page)).filter((c) => c.t === "5,00").sort((a, b) => a.y - b.y);
  // een binnenmuur van hartlijn tot hartlijn van de gevels
  const o = await page.evaluate(() => {
    const r = document.querySelector("svg[role=application] [data-walls]")!.getBoundingClientRect();
    return { y0: r.y, y1: r.y + r.height, k: r.width / 5760 };
  });
  await page.keyboard.press("m");
  await page.mouse.click(top[0].x, o.y0 + 190 * o.k);
  await page.mouse.move(top[0].x, o.y1 - 300 * o.k);
  await page.mouse.click(top[0].x, o.y1 - 190 * o.k);
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
    const p = document.querySelector("svg[role=application] [data-walls]")!;
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
    const p = document.querySelector("svg[role=application] [data-walls]")!;
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
    const p = document.querySelector("svg[role=application] [data-walls]")!;
    const r = p.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  // buitenmaat = 5,00 + 2 × 0,38 = 5,76 m en 4,76 m
  const pxPerMm = (pct / 100) * 0.1;
  expect(wallBox.w).toBeGreaterThan(5760 * pxPerMm * 0.98);
  expect(wallBox.w).toBeLessThan(5760 * pxPerMm * 1.02);
  expect(wallBox.h).toBeGreaterThan(4760 * pxPerMm * 0.98);
  expect(wallBox.h).toBeLessThan(4760 * pxPerMm * 1.02);
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
  expect(await overview(page)).toEqual(["Ruimte 1 20,3 m²", "Gelijkvloers 20,3 m²"]);
});

test("tekenen met de vinger op een tablet @tablet", async ({ page }) => {
  const box = await canvas(page);
  await page.getByRole("button", { name: "Kamer", exact: true }).tap();
  await page.getByRole("button", { name: /Slaapkamer 3,5×3/ }).tap();
  await page.touchscreen.tap(box.x + 600, box.y + 300);
  // op een tablet is het zijpaneel dicht: lees de ruimte uit de tekening
  await expect(page.locator("svg[role=application] text", { hasText: /^SLAAPKAMER$/ })).toBeVisible();
  await expect(page.locator("svg[role=application] text", { hasText: "10,50 m²" })).toBeVisible();
});

test("deur en raam plaatsen, aanpassen, verwijderen en terugzetten", async ({ page }) => {
  const box = await canvas(page);
  await page.keyboard.press("k");
  await page.mouse.click(box.x + 600, box.y + 200);
  await page.mouse.move(box.x + 800, box.y + 400);
  await page.keyboard.type("5x4");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  const o = await page.evaluate(() => {
    const p = document.querySelector("svg[role=application] [data-walls]")!;
    const r = p.getBoundingClientRect();
    return { x0: r.x, x1: r.x + r.width, y0: r.y, y1: r.y + r.height, k: r.width / 5760 };
  });
  const arcs = () => page.evaluate(() => [...document.querySelectorAll("svg[role=application] path")].filter((p) => /A/.test(p.getAttribute("d") ?? "")).length);

  // deur in de onderste gevel, cursor binnen
  await page.keyboard.press("d");
  const door = { x: o.x0 + 1500 * o.k, y: o.y1 - 190 * o.k - 8 };
  await page.mouse.move(door.x, door.y);
  await page.mouse.click(door.x, door.y);
  expect(await arcs()).toBe(1);

  // vast raam in de bovenste gevel (zonder draaiboog)
  await page.keyboard.press("r");
  await page.getByRole("radio", { name: "Vast raam" }).click();
  await page.mouse.move(o.x0 + 3000 * o.k, o.y0 + 190 * o.k + 8);
  await page.mouse.click(o.x0 + 3000 * o.k, o.y0 + 190 * o.k + 8);

  // de deur selecteren en breder maken
  await page.keyboard.press("v");
  await page.mouse.click(door.x, o.y1 - 190 * o.k);
  await expect(page.getByRole("heading", { name: "Deur" })).toBeVisible();
  await page.getByRole("button", { name: "93 cm" }).click();
  await expect(page.getByRole("textbox", { name: /^Breedte/ })).toHaveValue("0,93 m");

  // verwijderen en terugzetten
  await page.keyboard.press("Delete");
  expect(await arcs()).toBe(0);
  await page.keyboard.press("Control+z");
  expect(await arcs()).toBe(1);

  // de kamer blijft even groot: openingen veranderen de oppervlakte niet
  expect(await overview(page)).toEqual(["Ruimte 1 20,0 m²", "Gelijkvloers 20,0 m²"]);
});

test("een kamer half over een andere kamer wordt geweigerd", async ({ page }) => {
  const box = await canvas(page);
  await page.keyboard.press("k");
  await page.mouse.click(box.x + 600, box.y + 200);
  await page.mouse.move(box.x + 800, box.y + 400);
  await page.keyboard.type("5x4");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  const o = await page.evaluate(() => {
    const p = document.querySelector("svg[role=application] [data-walls]")!;
    const r = p.getBoundingClientRect();
    return { x1: r.x + r.width, y0: r.y, k: r.width / 5760 };
  });
  // slaapkamer stempelen: hoek 1,5 m binnen de rechtermuur, ver genoeg van elke lijn voor de magneet
  await page.getByRole("button", { name: /Slaapkamer 3,5×3/ }).click();
  const at = { x: o.x1 - (190 + 1500) * o.k, y: o.y0 + (190 + 2000) * o.k };
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByText(/valt half over een andere kamer/)).toBeVisible();
  expect(await overview(page)).toEqual(["Ruimte 1 20,0 m²", "Gelijkvloers 20,0 m²"]);
});

test.describe("overtrekken", () => {
  /** Klik op een punt van de afbeelding (in pixels van het bestand). */
  const clickImg = async (page: Page, imgW: number, x: number, y: number) => {
    const c = page.getByLabel("Afbeelding: klik om punten te zetten");
    const r = (await c.boundingBox())!;
    const k = r.width / imgW;
    await page.mouse.move(r.x + x * k, r.y + y * k);
    await page.mouse.click(r.x + x * k, r.y + y * k);
  };

  test("een plan op schaal zetten met twee punten en een maat", async ({ page }) => {
    await page.getByRole("button", { name: "Foto of pdf kiezen" }).click();
    await page.getByLabel("Foto of pdf kiezen").setInputFiles("e2e/fixtures/plan-recht.png");
    await page.getByRole("button", { name: /Twee punten en een maat/ }).click();
    // hartlijnen van de linker- en rechtermuur: 600 px = 6,00 m
    await clickImg(page, 900, 150, 350);
    await clickImg(page, 900, 750, 350);
    await page.getByLabel("Echte lengte A–B").fill("6");
    await page.getByRole("button", { name: "Op schaal zetten" }).click();
    const img = page.locator("svg[role=application] image[data-underlay]");
    await expect(img).toBeVisible();
    // 900 px × 10 mm per px = 9 m breed
    expect(Math.round(Number(await img.getAttribute("width")))).toBe(9000);
    await expect(page.getByText("plan-recht.png")).toBeVisible();
  });

  test("op het plan: schaal bijstellen en rechtzetten", async ({ page }) => {
    await page.getByRole("button", { name: "Foto of pdf kiezen" }).click();
    await page.getByLabel("Foto of pdf kiezen").setInputFiles("e2e/fixtures/plan-recht.png");
    await page.getByRole("button", { name: /Twee punten en een maat/ }).click();
    await clickImg(page, 900, 150, 350);
    await clickImg(page, 900, 750, 350);
    await page.getByLabel("Echte lengte A–B").fill("6");
    await page.getByRole("button", { name: "Op schaal zetten" }).click();
    const img = page.locator("svg[role=application] image[data-underlay]");
    await expect(img).toBeVisible();
    const box = (await img.boundingBox())!;
    // de linker- en rechtermuur liggen op 150 en 750 px van de 900
    const at = (fx: number, fy: number) => ({ x: box.x + (fx / 900) * box.width, y: box.y + (fy / 700) * box.height });
    // schaal bijstellen: die afstand is eigenlijk 7,50 m → alles 1,25 keer groter
    await page.getByRole("button", { name: "Schaal bijstellen" }).click();
    const a = at(150, 350);
    const b = at(750, 350);
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y);
    await page.mouse.click(b.x, b.y);
    const input = page.getByLabel("Echte maat tussen de twee punten");
    await input.fill("7,5");
    await input.press("Enter");
    await expect.poll(async () => Math.round(Number(await img.getAttribute("width")))).toBe(11250);
    // rechtzetten: een licht scheve lijn wordt horizontaal → draaiing ≠ 0
    await page.getByRole("button", { name: "Rechtzetten" }).click();
    const box2 = (await img.boundingBox())!;
    await page.mouse.click(box2.x + 100, box2.y + 100);
    await page.mouse.move(box2.x + 300, box2.y + 110);
    await page.mouse.click(box2.x + 300, box2.y + 110);
    await expect.poll(async () => (await img.getAttribute("transform")) ?? "").not.toMatch(/^rotate\(0 /);
    // ongedaan maken zet de draaiing terug
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await img.getAttribute("transform")) ?? "").toMatch(/^rotate\(0 /);
  });

  test("een schuine foto rechttrekken met vier hoeken", async ({ page }) => {
    await page.getByRole("button", { name: "Foto of pdf kiezen" }).click();
    await page.getByLabel("Foto of pdf kiezen").setInputFiles("e2e/fixtures/plan-schuin.jpg");
    await page.getByRole("button", { name: /Vier hoeken van een rechthoek/ }).click();
    // buitenhoeken van het plan op de schuine foto
    for (const [x, y] of [
      [292, 207],
      [626, 233],
      [649, 500],
      [252, 473],
    ])
      await clickImg(page, 900, x, y);
    await page.getByLabel("Breedte A–B").fill("6,30");
    await page.getByLabel("Diepte B–C").fill("4,80");
    await page.getByRole("button", { name: "Op schaal zetten" }).click();
    await expect(page.locator("svg[role=application] image[data-underlay]")).toBeVisible();
  });
});

test("eigen muurtype maken vanuit een muur en later dikker maken", async ({ page }) => {
  const box = await canvas(page);
  await page.keyboard.press("k");
  await page.mouse.click(box.x + 600, box.y + 200);
  await page.mouse.move(box.x + 800, box.y + 400);
  await page.keyboard.type("5x4");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  const o = await page.evaluate(() => {
    const r = document.querySelector("svg[role=application] [data-walls]")!.getBoundingClientRect();
    return { x0: r.x, y0: r.y, k: r.width / 5760 };
  });
  // bovenste gevel selecteren
  await page.keyboard.press("v");
  await page.mouse.click(o.x0 + 2500 * o.k, o.y0 + 190 * o.k);
  await page.getByRole("combobox", { name: "Opbouw" }).selectOption("__nieuw");
  const dlg = page.getByRole("dialog", { name: "Nieuw muurtype" });
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("Naam").fill("Gevel met 20 cm PIR");
  await dlg.getByLabel("Dikte laag 3 in cm").fill("20");
  await dlg.getByRole("button", { name: "Bewaren" }).click();
  // de muur krijgt meteen het nieuwe type: 9 + 3 + 20 + 14 = 46 cm
  await expect(page.getByRole("textbox", { name: /^Totale dikte/ })).toHaveValue("0,46 m");
  // de kamer blijft 5 × 4
  for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");
  await expect(page.locator("aside ul li").first()).toContainText("20,0 m²");
  // bewerken via de lijst bij het plan: binnenblad 14 → 19 cm
  await page.getByRole("button", { name: /Gevel met 20 cm PIR/ }).click();
  const dlg2 = page.getByRole("dialog", { name: "Muurtype bewerken" });
  await dlg2.getByLabel("Dikte laag 4 in cm").fill("19");
  await expect(dlg2.getByText(/Eén muur gebruikt dit type/)).toBeVisible();
  await dlg2.getByRole("button", { name: "Bewaren" }).click();
  await expect(page.locator("aside ul li").first()).toContainText("20,0 m²");
});

test("een dunnere muur rechtdoor: kiezen welk vlak doorloopt", async ({ page }) => {
  await page.goto("/proefbank?sprong=1");
  await page.keyboard.press("0");
  const r = (await page.locator("svg[role=application] [data-walls]").boundingBox())!;
  const k = r.width / 6760;
  // de muur van 10 cm rechts van de aansluiting
  await page.mouse.click(r.x + 4690 * k, r.y + 2380 * k);
  const group = page.getByRole("group", { name: "Uitlijning" });
  await expect(page.getByText(/beide vlakken verspringen/)).toBeVisible();
  await group.getByRole("button", { name: "Onder" }).click();
  await expect(group.getByRole("button", { name: "Onder" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/beide vlakken verspringen/)).toBeHidden();
  await page.keyboard.press("Control+z");
  await expect(group.getByRole("button", { name: "Geen (midden)" })).toHaveAttribute("aria-pressed", "true");
});

test("een raam samenstellen: vast + draaikiep, en bewaren als eigen soort", async ({ page }) => {
  const box = await canvas(page);
  await page.keyboard.press("k");
  await page.mouse.click(box.x + 600, box.y + 200);
  await page.mouse.move(box.x + 800, box.y + 400);
  await page.keyboard.type("5x4");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  const o = await page.evaluate(() => {
    const p = document.querySelector("svg[role=application] [data-walls]")!;
    const r = p.getBoundingClientRect();
    return { x0: r.x, y0: r.y, k: r.width / 5760 };
  });
  // een ingebouwd samengesteld raam plaatsen
  await page.keyboard.press("r");
  await page.getByRole("radio", { name: "Vast + draaikiep" }).click();
  const at = { x: o.x0 + 2500 * o.k, y: o.y0 + 190 * o.k + 8 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press("v");
  await page.mouse.click(at.x, o.y0 + 190 * o.k);
  await expect(page.getByRole("heading", { name: "Vast + draaikiep" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Vooraanzicht/ })).toBeVisible();

  // vakken aanpassen: een derde vak, en bewaren als eigen soort
  await page.getByRole("button", { name: "Aanpassen" }).click();
  const dialog = page.getByRole("dialog", { name: "Raam samenstellen" });
  await dialog.getByRole("button", { name: "Vak toevoegen" }).click();
  await dialog.getByLabel("Soort vak 3").selectOption("kiep");
  await dialog.getByLabel("Breedte in cm").fill("240");
  await dialog.getByRole("switch", { name: /Ook bewaren als eigen soort/ }).click();
  await dialog.getByRole("textbox", { name: "Naam" }).fill("Leefruimteraam");
  await dialog.getByRole("button", { name: "Bewaren" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Leefruimteraam" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Breedte/ })).toHaveValue("2,40 m");

  // de eigen soort staat nu bij het raamgereedschap
  await page.keyboard.press("Escape");
  await page.keyboard.press("r");
  await expect(page.getByRole("radio", { name: "Leefruimteraam" })).toBeVisible();
});

test("het plan in 3D: poppenhuis, rondwandelen en een vloer kiezen", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem("hint-tekenvlak", "gezien"));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/proefbank?demo=1");
  await page.getByRole("radio", { name: "3D" }).click();
  await expect(page.locator("[data-view3d=klaar]")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("img", { name: "3D-weergave van het plan" })).toBeVisible();
  // een ruimte aanklikken: de vloer en muurkleur kiezen
  const main = (await page.getByRole("main", { name: "Plan" }).boundingBox())!;
  await page.mouse.click(main.x + main.width * 0.4, main.y + main.height * 0.45);
  const vloer = page.getByRole("radiogroup", { name: "Vloer" });
  await expect(vloer).toBeVisible();
  await vloer.getByRole("radio", { name: "Tegels antraciet" }).click();
  await expect(vloer.getByRole("radio", { name: "Tegels antraciet" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Rondwandelen" }).click();
  await expect(page.getByText(/Klik op de vloer om erheen te wandelen/)).toBeVisible();
  await page.keyboard.down("w");
  await page.waitForTimeout(300);
  await page.keyboard.up("w");
  // terug naar het plan
  await page.getByRole("radio", { name: "2D" }).click();
  await expect(page.locator("[data-view3d]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
