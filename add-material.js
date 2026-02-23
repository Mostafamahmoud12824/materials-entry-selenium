//!---- Restaurant Automation - Raw Materials Entry
//  Optimized by: removing fixed sleeps, eliminating debug blocks,
//  reducing redundant DOM fetches, and using proper explicit waits.

const { Builder, By, until } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");
const XLSX = require("xlsx");
const readline = require("readline");
const path = require("path");
const fs = require("fs");

/* ===============================
   Helper: Read user input
================================ */
function askQuestion(query) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    process.stdout.write(query);
    rl.on("line", answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/* ===============================
   Helper: Wait then type
================================ */
async function waitAndType(driver, locator, text, timeout = 10000) {
  const element = await driver.wait(until.elementLocated(locator), timeout);
  await driver.wait(until.elementIsVisible(element), timeout);
  await element.clear();
  await element.sendKeys(text);
  return element;
}

/* ===============================
   Helper: Wait then click
================================ */
async function waitAndClick(driver, locator, timeout = 10000) {
  const element = await driver.wait(until.elementLocated(locator), timeout);
  await driver.wait(until.elementIsVisible(element), timeout);
  await element.click();
  return element;
}

/* ===============================
   Helper: Select option in a <select>
   by numeric option value (e.g. "1", "2", "3")
================================ */
async function selectByValue(driver, selectLocator, value, timeout = 10000) {
  const select = await driver.wait(until.elementLocated(selectLocator), timeout);
  await driver.wait(until.elementIsVisible(select), timeout);
  const option = await select.findElement(By.css(`option[value="${value}"]`));
  await option.click();
  return select;
}

/* ===============================
   Unit Map — Full names only (no abbreviations)

   Solid units:
     1 = Gram
     2 = Kilogram
     3 = Tonne

   Liquid units:
     4 = Milliliter
     5 = Liter
     6 = Gallon

   ✅ Excel القيم المسموح بيها:
      solid  → gram | kilogram | tonne
      liquid → milliliter | liter | gallon
================================ */
const UNIT_MAP = {
  solid: {
    gram:     "1",
    kilogram: "2",
    tonne:    "3",
  },
  liquid: {
    milliliter: "4",
    liter:      "5",
    gallon:     "6",
  },
};

function unitToValue(unitName, materialForm = "solid") {
  const form = String(materialForm).toLowerCase().trim();
  const key  = String(unitName).toLowerCase().trim();

  const map = UNIT_MAP[form] || UNIT_MAP["solid"];
  const val = map[key];

  if (!val) {
    console.warn(
      `  ⚠️  Unknown unit "${unitName}" for form "${form}".` +
      ` Allowed values: ${Object.keys(map).join(" | ")}. Defaulting to 1.`
    );
    return "1";
  }
  return val;
}

/* ===============================
   Helper: Select unit <select> by position
   index 0 → Order Limit unit
   index 1 → Buying Cost unit

   ✅ OPTIMIZED:
   - Removed all fixed sleeps (replaced with explicit waits)
   - Removed debug block entirely
   - Single DOM fetch right before click
   - Confirmation wait re-fetches fresh reference
================================ */
async function selectUnitByIndex(driver, selectIndex, unitName, timeout = 15000, materialForm = "solid") {
  const numericValue = unitToValue(unitName, materialForm);

  // ✅ Wait until the correct option exists in the target select
  await driver.wait(async () => {
    try {
      const selects = await driver.findElements(By.css('select[id^="select-unit-"]'));
      if (selects.length <= selectIndex) return false;
      const opts = await selects[selectIndex].findElements(By.css(`option[value="${numericValue}"]`));
      return opts.length > 0;
    } catch (e) {
      return false;
    }
  }, timeout, `Option value="${numericValue}" not found in select[${selectIndex}] for form="${materialForm}"`);

  // ✅ Single DOM fetch right before clicking
  const selects = await driver.findElements(By.css('select[id^="select-unit-"]'));
  const select  = selects[selectIndex];
  await driver.wait(until.elementIsVisible(select), timeout);

  const option = await select.findElement(By.css(`option[value="${numericValue}"]`));
  await option.click();

  // ✅ Confirm value was applied — re-fetch once to avoid stale ref
  await driver.wait(async () => {
    try {
      const freshSelects = await driver.findElements(By.css('select[id^="select-unit-"]'));
      if (freshSelects.length <= selectIndex) return false;
      const val = await freshSelects[selectIndex].getAttribute("value");
      return val === numericValue;
    } catch (e) {
      return false;
    }
  }, 6000, `Select[${selectIndex}] did not update to value="${numericValue}"`);

  return select;
}

/* ===============================
   Validate Excel row before processing
================================ */
function validateMaterialRow(m, index) {
  const errors = [];

  const validForms = ["solid", "liquid"];
  const form = String(m.Material_Form || "").toLowerCase().trim();
  if (!validForms.includes(form)) {
    errors.push(`Material_Form "${m.Material_Form}" is invalid. Use: solid | liquid`);
  }

  const solidUnits   = ["gram", "kilogram", "tonne"];
  const liquidUnits  = ["milliliter", "liter", "gallon"];
  const allowedUnits = form === "liquid" ? liquidUnits : solidUnits;

  const orderUnit = String(m.Order_Unit || "").toLowerCase().trim();
  if (orderUnit && !allowedUnits.includes(orderUnit)) {
    errors.push(
      `Order_Unit "${m.Order_Unit}" is invalid for form "${form}". Use: ${allowedUnits.join(" | ")}`
    );
  }

  const costUnit = String(m.Cost_Unit || "").toLowerCase().trim();
  if (costUnit && !allowedUnits.includes(costUnit)) {
    errors.push(
      `Cost_Unit "${m.Cost_Unit}" is invalid for form "${form}". Use: ${allowedUnits.join(" | ")}`
    );
  }

  if (errors.length) {
    console.warn(`\n  ⚠️  Row ${index + 1} validation errors for "${m.Name_EN}":`);
    errors.forEach(e => console.warn(`     - ${e}`));
  }

  return errors.length === 0;
}

/* ===============================
   Helper: Wait for the floating overlay modal to fully close
   after a save action.
   Targets the overlay div: .floating-form.position-absolute
   Waits until it's gone from the DOM or invisible.
================================ */
async function waitForModalToClose(driver, timeout = 15000) {
  try {
    await driver.wait(async () => {
      try {
        const overlays = await driver.findElements(
          By.css("div.floating-form.position-absolute")
        );
        if (overlays.length === 0) return true;
        // Check if overlay is invisible
        const displayed = await overlays[0].isDisplayed();
        return !displayed;
      } catch (e) {
        return true; // element gone = modal closed
      }
    }, timeout, "Modal overlay did not close in time");
  } catch (e) {
    console.warn(`  ⚠️  Modal close wait timed out: ${e.message}`);
  }
}

/* ===============================
   Helper: Wait for page/modal to settle
   after Material Form change — waits until
   the unit select options match the expected form
   instead of using a fixed sleep.
================================ */
async function waitForFormUnitsToLoad(driver, materialForm, timeout = 8000) {
  const expectedFirstValue = materialForm === "liquid" ? "4" : "1"; // first option value after form change
  await driver.wait(async () => {
    try {
      const selects = await driver.findElements(By.css('select[id^="select-unit-"]'));
      if (selects.length === 0) return false;
      const opts = await selects[0].findElements(By.css(`option[value="${expectedFirstValue}"]`));
      return opts.length > 0;
    } catch (e) {
      return false;
    }
  }, timeout, `Unit options for form="${materialForm}" did not load in time`);
}

/* ===============================
   Main
================================ */
(async function main() {
  let driver;

  try {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║   Raw Materials Entry Automation (FX)    ║`);
    console.log(`║   By Mostafa Mahmoud Salah               ║`);
    console.log(`╚══════════════════════════════════════════╝\n`);

    /* ---------- Domain ---------- */
    const domain = await askQuestion("🔗 Enter the domain (without https://): ");
    if (!domain) throw new Error("Domain cannot be empty!");

    /* ---------- Excel ---------- */
    console.log("📂 Reading Excel file...");
    const excelPath = "E:\\add a material\\materials_template.xlsx";

    if (!fs.existsSync(excelPath)) {
      throw new Error(`Excel file not found: ${excelPath}`);
    }

    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let headerRowIndex = 0;
    for (let r = 0; r < rawRows.length; r++) {
      const row = rawRows[r].map(c => String(c || "").trim());
      if (row.includes("Name_EN") || row.includes("Name_AR")) {
        headerRowIndex = r;
        break;
      }
    }

    const materials = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex });

    const validMaterials = materials.filter(m => {
      const name = String(m.Name_EN || "").trim();
      return name !== "" && name !== "Name_EN" && name !== "الاسم بالإنجليزية";
    });

    if (!validMaterials.length) {
      throw new Error("No materials found in Excel file!");
    }

    console.log(`✓ ${validMaterials.length} materials loaded\n`);

    /* ---------- Pre-flight validation ---------- */
    console.log("🔍 Validating all rows before starting...");
    let hasErrors = false;
    validMaterials.forEach((m, i) => {
      const ok = validateMaterialRow(m, i);
      if (!ok) hasErrors = true;
    });

    if (hasErrors) {
      console.warn(
        "\n  ⚠️  Some rows have validation errors. They will be skipped or use defaults.\n"
      );
    } else {
      console.log("  ✓ All rows passed validation\n");
    }

    /* -------------------------------------------------------
       Expected Excel columns:
         Name_AR       – الاسم بالعربية
         Name_EN       – الاسم بالإنجليزية
         Material_Form – solid | liquid
         Order_Limit   – حد الطلب (number)
         Order_Unit    – gram | kilogram | tonne | milliliter | liter | gallon
         Buying_Cost   – سعر الشراء (number)
         Cost_Unit     – gram | kilogram | tonne | milliliter | liter | gallon
    ------------------------------------------------------- */

    /* ---------- Firefox Driver ---------- */
    const driverPath = "E:\\add a material\\geckodriver.exe";

    if (!fs.existsSync(driverPath)) {
      throw new Error(`GeckoDriver not found: ${driverPath}`);
    }

    const service = new firefox.ServiceBuilder(driverPath);
    const options = new firefox.Options();

    driver = await new Builder()
      .forBrowser("firefox")
      .setFirefoxService(service)
      .setFirefoxOptions(options)
      .build();

    await driver.manage().window().maximize();

    /* ---------- Login ---------- */
    console.log("🔐 Logging in...");
    await driver.get(`https://${domain}/auth/employees/login`);

    await waitAndType(
      driver,
      By.xpath('//input[@placeholder="Enter user name"]'),
      "cashier"
    );
    await waitAndType(
      driver,
      By.xpath('//input[@placeholder="Enter password"]'),
      "@cashier"
    );
    await waitAndClick(driver, By.css('button[type="submit"]'));

    // ✅ Wait for page redirect instead of fixed sleep
    await driver.wait(until.urlContains("/dashboard"), 10000).catch(() => {});

    /* ── Click "Products entry" button ── */
    console.log("🖱️  Clicking 'Products entry'...");
    await waitAndClick(
      driver,
      By.xpath('//p[contains(text(),"Products entry")]/..')
    );
    console.log("✓ Products entry clicked\n");

    /* ── Second login modal ── */
    console.log("🔐 Second login...");

    await waitAndType(
      driver,
      By.xpath('//input[@placeholder="email or phone number"]'),
      "cashier"
    );

    await waitAndType(
      driver,
      By.xpath('//input[@placeholder="password"]'),
      "@cashier"
    );

    await waitAndClick(
      driver,
      By.xpath('//button[normalize-space(text())="Login"]')
    );

    // ✅ Wait for "materials" tab to appear instead of fixed sleep
    await driver.wait(
      until.elementLocated(By.xpath('//span[normalize-space(text())="materials"]')),
      10000
    );
    console.log("✓ Second login successful\n");

    /* ── Click "Materials" tab ── */
    console.log("🗂️  Clicking 'Materials' tab...");
    await waitAndClick(
      driver,
      By.xpath('//span[normalize-space(text())="materials"]')
    );

    // ✅ Wait for "add a new ingredient" button to confirm tab loaded
    await driver.wait(
      until.elementLocated(By.xpath('//span[normalize-space(text())="add a new ingredient"]/..')),
      10000
    );
    console.log("✓ Materials tab opened\n");

    /* ---------- Raw Materials Loop ---------- */
    for (let i = 0; i < validMaterials.length; i++) {
      const m = validMaterials[i];

      try {
        console.log(
          `\n➕ Adding material ${i + 1}/${validMaterials.length}: ${m.Name_EN}`
        );

        /* ── Click "add a new ingredient" button ── */
        await waitAndClick(
          driver,
          By.xpath('//span[normalize-space(text())="add a new ingredient"]/..')
        );

        // ✅ Wait for name inputs to appear (modal opened) instead of fixed sleep
        await driver.wait(
          until.elementLocated(By.css('input[id^="input-name-"]')),
          8000
        );

        /* ── Arabic Name ── */
        if (m.Name_AR) {
          const arInputs = await driver.findElements(By.css('input[id^="input-name-"]'));
          await arInputs[0].clear();
          await arInputs[0].sendKeys(String(m.Name_AR));
          console.log(`  ✓ Arabic name: ${m.Name_AR}`);
        }

        /* ── English Name ── */
        if (m.Name_EN) {
          const enInputs = await driver.findElements(By.css('input[id^="input-name-"]'));
          await enInputs[1].clear();
          await enInputs[1].sendKeys(String(m.Name_EN));
          console.log(`  ✓ English name: ${m.Name_EN}`);
        }

        /* ── Material Form ── */
        const materialForm = String(m.Material_Form || "solid").toLowerCase().trim();
        if (m.Material_Form) {
          try {
            await selectByValue(
              driver,
              By.css('select[id^="select-state_of_matter_id-"]'),
              materialForm === "solid" ? "1" : "2"
            );
            // ✅ Wait for unit options to re-render after form change (no fixed sleep)
            await waitForFormUnitsToLoad(driver, materialForm);
            console.log(`  ✓ Material form: ${materialForm}`);
          } catch (e) {
            console.warn(`  ⚠️  Could not select material form: ${e.message}`);
          }
        }

        /* ── Order Limit – value ── */
        if (m.Order_Limit !== undefined && m.Order_Limit !== null) {
          await waitAndType(
            driver,
            By.css('input[id^="input-order_limit-"]'),
            String(m.Order_Limit)
          );
          console.log(`  ✓ Order limit: ${m.Order_Limit}`);
        }

        /* ── Order Limit – unit ── */
        const orderUnit = String(m.Order_Unit || (materialForm === "liquid" ? "liter" : "gram")).toLowerCase().trim();
        try {
          await selectUnitByIndex(driver, 0, orderUnit, 15000, materialForm);
          console.log(`  ✓ Order unit: ${orderUnit}`);
        } catch (e) {
          console.warn(`  ⚠️  Could not select order unit: ${e.message}`);
        }

        /* ── Buying Cost – value ── */
        if (m.Buying_Cost !== undefined && m.Buying_Cost !== null) {
          await waitAndType(
            driver,
            By.css('input[id^="input-buying_cost-"]'),
            String(m.Buying_Cost)
          );
          console.log(`  ✓ Buying cost: ${m.Buying_Cost}`);
        }

        /* ── Buying Cost – unit ── */
        const costUnit = String(m.Cost_Unit || (materialForm === "liquid" ? "liter" : "gram")).toLowerCase().trim();
        try {
          await selectUnitByIndex(driver, 1, costUnit, 15000, materialForm);
          console.log(`  ✓ Cost unit: ${costUnit}`);
        } catch (e) {
          console.warn(`  ⚠️  Could not select cost unit: ${e.message}`);
        }

        /* ── Toggle: taxable ── */
        try {
          const taxableLabel = await driver.wait(
            until.elementLocated(
              By.xpath('//div[normalize-space(text())="taxable"]/preceding-sibling::label[contains(@class,"lbl-on-off")]')
            ),
            5000
          );
          await taxableLabel.click();
          console.log(`  ✓ Taxable: ON`);
        } catch (e) {
          console.warn(`  ⚠️  Could not set Taxable toggle: ${e.message}`);
        }

        /* ── Toggle: Prices including VAT ── */
        try {
          const vatLabel = await driver.wait(
            until.elementLocated(
              By.xpath('//div[normalize-space(text())="Prices including VAT"]/preceding-sibling::label[contains(@class,"lbl-on-off")]')
            ),
            5000
          );
          await vatLabel.click();
          console.log(`  ✓ Prices including VAT: ON`);
        } catch (e) {
          console.warn(`  ⚠️  Could not set VAT toggle: ${e.message}`);
        }

        /* ── Create button ── */
        await waitAndClick(
          driver,
          By.xpath('//button[normalize-space(text())="create"]')
        );

        // ✅ Wait for modal to close instead of fixed sleep
        await waitForModalToClose(driver, 8000);

        console.log(`  ✓ Material saved successfully`);

      } catch (err) {
        console.error(
          `  ✗ Failed to add material "${m.Name_EN}": ${err.message}`
        );
      }
    }

    console.log(`\n✅ All materials processed successfully\n`);

  } catch (err) {
    console.error("\n❌ Critical Error:", err.message);
    console.error(err.stack);
  } finally {
    if (driver) {
      console.log("\n🔚 Closing browser...");
      await driver.sleep(2000);
      // await driver.quit();
    }
  }
})();