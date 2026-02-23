# Restaurant Raw Materials Automation

A robust Selenium automation script built with **Node.js** to bulk-add raw materials (ingredients) into a restaurant management system using data from an Excel file.

This project focuses on **stability, performance, and correctness**, eliminating fixed delays and relying entirely on explicit waits, validation, and optimized DOM interaction.

---

## ✨ Features

- 📊 **Excel-Driven Input**
  - Reads raw materials from an Excel sheet
  - Auto-detects header row
  - Skips empty or invalid rows

- ⚙️ **Material Type Handling**
  - Supports **solid** and **liquid** materials
  - Automatically loads correct unit options after form change

- 📏 **Unit Mapping (No Abbreviations)**
  - Solid: `gram`, `kilogram`, `tonne`
  - Liquid: `milliliter`, `liter`, `gallon`

- 🧠 **Smart Validation**
  - Pre-flight validation before automation starts
  - Warns about invalid units or material forms
  - Falls back to safe defaults when needed

- 🚀 **Optimized Selenium Flow**
  - No fixed `sleep()` calls
  - Uses explicit waits only
  - Prevents stale element issues
  - Confirms dropdown selections after change

- 🪟 **Reliable Modal Handling**
  - Waits for floating forms to fully close
  - Prevents duplicate or skipped entries

---

## 🛠 Tech Stack

- **Node.js**
- **Selenium WebDriver**
- **Firefox + GeckoDriver**
- **xlsx** (Excel parsing)

---

## 📂 Project Structure
```
├── materials_template.xlsx
├── script.js
├── geckodriver.exe
├── README.md
└── .gitignore
```

---

## 📑 Excel Template Format

The Excel file must include the following columns:
```
| Column Name      | Description |
|------------------|-------------|
| `Name_AR`        | Material name in Arabic |
| `Name_EN`        | Material name in English |
| `Material_Form` | `solid` or `liquid` |
| `Order_Limit`   | Order limit value (number) |
| `Order_Unit`    | Unit for order limit |
| `Buying_Cost`   | Buying cost value (number) |
| `Cost_Unit`     | Unit for buying cost |
```
### ✅ Allowed Units

**Solid Materials**
- `gram`
- `kilogram`
- `tonne`

**Liquid Materials**
- `milliliter`
- `liter`
- `gallon`

---

## ▶️ How to Run

### 1️⃣ Install Dependencies
```bash
npm install selenium-webdriver xlsx
```
2️⃣ Configure Paths

Update these paths inside the script if needed:

Excel file path

GeckoDriver path

3️⃣ Run the Script
node script.js
4️⃣ Enter Domain

When prompted:
```
Enter the domain (without https://):
```
---
## 🔐 Login Flow

The script:

Logs into the employee system

Navigates to Products Entry

Logs in again (secondary modal)

Opens Materials

Adds ingredients one by one from Excel
---
## ⚠️ Notes

Firefox browser is required

GeckoDriver version must match Firefox version

The script is optimized for dynamic UI behavior

Validation warnings do not stop execution
---
## 📌 Author

Mostafa Mahmoud Salah
Software Engineer – Automation & Web Systems
