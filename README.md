# Antique Wardrobe

SillyTavern extension for manual AI-generated clothing continuity for CHAR and USER.

## Features
- Separate OpenAI-compatible endpoint and model.
- Detailed wardrobe state for CHAR and USER.
- Separate `<wardrobe>` prompt block.
- Manual update: BOTH / CHAR / USER.
- Freeze for N messages after each update.
- No automatic wardrobe generation when the lock expires.
- Current wardrobe persists in the active chat metadata.
- Floating antique dressing-room UI, including mobile layout.

## Install
Upload this repository to GitHub with `manifest.json`, `index.js`, and `style.css` at the repository root. Then install the Git URL in SillyTavern, or put the folder in `public/scripts/extensions/third-party/antique-wardrobe/`.

## API
The extension sends a standard OpenAI-compatible `POST /v1/chat/completions` request. Enter either a full `/chat/completions` URL or a `/v1` base URL. API key is optional.

## Important
Do not put your API key into GitHub. It is stored in SillyTavern settings instead.

## Freeze
If freeze is 10, an update generates a new outfit and sets the corresponding counter to 10. Each newly added chat message decreases it. At zero, the stored outfit remains unchanged until you manually press an update button.
