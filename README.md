# HTML Email Parser & Contact Finder

A powerful Chrome Extension designed for Lead Generation, Sales, and AdOps professionals. It goes beyond simple regex matching by actively searching for contact information across the current page and automatically fetching related "Contact Us" pages in the background to ensure no lead is missed.

![Manifest](https://img.shields.io/badge/manifest-V3-blue)
![Category](https://img.shields.io/badge/category-Lead_Gen-green)
![Version](https://img.shields.io/badge/version-1.0.11-orange)

## Key Features

### 1. Advanced Deep Scanning
* **DOM Traversal:** Scans not just visible text, but also input values, data attributes (`data-email`, `data-contact`), `href` links, and metadata.
* **Cloudflare Decoding:** Automatically detects and decodes emails protected by Cloudflare's email obfuscation (`data-cfemail`).
* **De-obfuscation:** Intelligently reconstructs emails written in anti-bot formats:
    * `user [at] domain [dot] com`
    * `contact (at) site . com`
    * Reversed strings (e.g., `moc.liame@resu`)

### 2. Intelligent "Contact Page" Augmentation
If no emails are found on the landing page, the extension automatically performs a **background fetch** of common contact paths (without opening new tabs):
* `/contact`, `/contact-us`, `/contacts`
* `/about`, `/about-us`
* `/support`, `/help`

### 3. Smart Filtering & Prioritization
* **Junk Filter:** Eliminates false positives like image filenames (`image@2x.png`), hashes, Sentry logs, and bundled code artifacts.
* **Priority Scoring:** Sorts results to show high-value business emails first:
    * Top Priority: `ads@`, `sales@`, `marketing@`, `partners@`
    * High Priority: `support@`, `info@`, `contact@`

## Technical Implementation

* **Manifest V3:** Compliant with modern security standards.
* **TreeWalker API:** efficient DOM parsing with minimal performance impact.
* **Regex Engine:** Uses complex patterns to handle HTML entities and variations of email masking.
* **Background Fetching:**
    ```javascript
    // The script proactively checks adjacent pages if the main page is empty
    const candidatePaths = ["/contact", "/about", "/support"...];
    fetch(origin + path).then(parseResponse);
    ```

## Installation (Developer Mode)

1.  Clone or download this repository.
2.  Open Chrome and go to `chrome://extensions`.
3.  Enable **Developer mode** (top right toggle).
4.  Click **Load unpacked**.
5.  Select the folder containing `manifest.json`.

## Usage

1.  Navigate to any target website.
2.  The extension automatically starts scanning.
3.  Open the extension popup to view results.
    * **Copy:** Copies the email to clipboard.
    * **Mail:** Opens your default email client (`mailto:`).
4.  If the result list is empty, click **"Обновити" (Refresh)** to force a deep re-scan.

## Project Structure

```text
├── background.js      # Service worker
├── content.js         # Core logic: Parsing, De-obfuscation, Background Fetching
├── manifest.json      # Extension configuration
├── popup.html         # User Interface
├── popup.js           # UI Logic & Messaging
└── styles.css         # Styling