<div align="center">
  <img src="icons/icon.svg" width="128" height="128" alt="Synapse Logo" />
  <h1>Synapse</h1>
  <p><strong>Your AI-powered "Second Brain" inside the Chrome Sidebar</strong></p>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)

</div>

<br />

## About

Synapse is a sleek, AI-powered Chrome extension designed to act as your digital copilot. Running seamlessly in your side panel, it uses Google's free Gemini API to let you chat with any webpage, extract structured data instantly, manage persistent notes, and quickly connect to your favorite productivity apps.

It is built completely with vanilla HTML/CSS/JS with zero heavy frameworks or dependencies, wrapped in a premium minimalist design inspired by `shadcn/ui`.

## Features

- 🧠 **Contextual AI Chat**: Chat directly with the webpage you are viewing. Ask it to summarize, explain concepts, or find key takeaways from long articles.
- 📊 **Structured Data Extraction**: Instantly scan any page for tables and lists, and export the findings cleanly to a CSV file.
- 📝 **Persistent Memory & Notes**: Save your thoughts and notes in a built-in notepad. Synapse remembers your conversation history across sessions and tabs.
- 🔗 **App Connector**: Jump straight into your productivity stack. Features a LinkedIn profile scanner that uses AI to extract structured info from profiles, and a Quick Compose tool that uses AI to draft emails and open them directly in Gmail.
- 🎨 **Minimalist `shadcn/ui` Design**: The entire interface is styled with deep blacks (`#0a0a0a`), subtle gray borders (`#262626`), and clean white accents, ensuring a premium, distraction-free experience.

## Installation

As this is a developer build, you can install it directly into Chrome using Developer Mode:

1. Clone or download this repository:
   ```bash
   git clone https://github.com/piyushdotcomm/Synapse.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top right corner.
4. Click the **Load unpacked** button and select the `Synapse` root directory.
5. Pin the extension to your toolbar for easy access. Click the Synapse icon to open the side panel!

## Setup & Configuration

1. In the Synapse side panel, click the **Settings** icon.
2. Enter your **Gemini API Key**. 
   > *Note: You can get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).*
3. Select your preferred AI model (`Gemini 2.0 Flash` recommended for speed).
4. Save your settings. You're ready to go!

## Architecture

Synapse strictly adheres to modern browser extension best practices (Manifest V3):

- **Side Panel Interface**: Remains open across all tabs without interrupting your workflow.
- **Service Worker (`background.js`)**: Handles all API calls to Google Gemini and manages state, keeping the extension incredibly lightweight.
- **Content Scripts (`content-script.js`)**: Extracts page text, metadata, and tables without heavy DOM manipulation.
- **Local Storage (`chrome.storage.local`)**: Securely stores your API key, notes, and conversation history locally in your browser.

## Contributing

Contributions are completely welcome! Whether you want to add a new app integration to the Connect tab, improve the AI prompts, or polish the CSS further, feel free to open a Pull Request.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
